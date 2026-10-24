"""In-process HTTP profiling with PyInstrument + SQL nested under call frames."""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
import traceback
from contextvars import ContextVar
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from pyinstrument import Profiler
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.services.uploads import UPLOAD_ROOT

logger = logging.getLogger(__name__)

PROFILES_DIR = UPLOAD_ROOT / "profiles"
MAX_RUNS = 50
AUTO_STOP_MINUTES = 10
MAX_SQL_STATEMENT_CHARS = 4000
MAX_SQL_PARAMS_CHARS = 500
MAX_STACK_FRAMES = 40

_lock = threading.Lock()
_enabled = False
_started_at: datetime | None = None
_expires_at: datetime | None = None
_sql_listeners_installed = False

_sql_buffer: ContextVar[list[dict[str, Any]] | None] = ContextVar("profiling_sql_buffer", default=None)
# Stack captured in async context (do_orm_execute) before greenlet switch for DB I/O
_pending_sql_stack: ContextVar[list[dict[str, Any]] | None] = ContextVar("profiling_pending_sql_stack", default=None)


@dataclass
class StackFrameMeta:
    file: str
    function: str
    line: int
    key: str


@dataclass
class SqlQueryMeta:
    statement: str
    duration_ms: float
    parameters: str = ""
    stack: list[StackFrameMeta] = field(default_factory=list)
    owner_key: str = ""


@dataclass
class ProfileRunMeta:
    id: str
    method: str
    path: str
    status_code: int
    duration_ms: int
    created_at: str
    sql_count: int = 0
    sql_total_ms: float = 0.0
    queries: list[SqlQueryMeta] = field(default_factory=list)
    cpu_tree: dict[str, Any] | None = None


def ensure_profiles_dir() -> None:
    PROFILES_DIR.mkdir(parents=True, exist_ok=True)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _maybe_auto_stop() -> None:
    global _enabled, _started_at, _expires_at
    if not _enabled or _expires_at is None:
        return
    if _utcnow() >= _expires_at:
        _enabled = False
        _started_at = None
        _expires_at = None
        logger.info("Profiling auto-stopped after %s minutes", AUTO_STOP_MINUTES)


def is_enabled() -> bool:
    with _lock:
        _maybe_auto_stop()
        return _enabled


def start_profiling() -> dict[str, object]:
    global _enabled, _started_at, _expires_at
    ensure_profiles_dir()
    with _lock:
        now = _utcnow()
        _enabled = True
        _started_at = now
        _expires_at = now + timedelta(minutes=AUTO_STOP_MINUTES)
        return _status_unlocked()


def stop_profiling() -> dict[str, object]:
    global _enabled, _started_at, _expires_at
    with _lock:
        _enabled = False
        _started_at = None
        _expires_at = None
        return _status_unlocked()


def _status_unlocked() -> dict[str, object]:
    _maybe_auto_stop()
    return {
        "enabled": _enabled,
        "started_at": _started_at.isoformat() if _started_at else None,
        "expires_at": _expires_at.isoformat() if _expires_at else None,
        "auto_stop_minutes": AUTO_STOP_MINUTES,
        "runs_count": len(_list_meta_paths()),
    }


def get_status() -> dict[str, object]:
    with _lock:
        return _status_unlocked()


def should_profile_path(path: str) -> bool:
    if not path.startswith("/api"):
        return False
    if path == "/api/health" or path.startswith("/api/health/"):
        return False
    if path.startswith("/api/admin/profiling"):
        return False
    return True


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + "…"


def _format_parameters(parameters: Any) -> str:
    try:
        return _truncate(repr(parameters), MAX_SQL_PARAMS_CHARS)
    except Exception:
        return ""


def _frame_key(file_name: str, function: str) -> str:
    return f"{Path(file_name).name}:{function}"


def _is_interesting_path(path: str) -> bool:
    normalized = path.replace("\\", "/")
    if "/site-packages/" in normalized or "/pyinstrument/" in normalized:
        return False
    if normalized.endswith("/profiling.py") or "/services/profiling.py" in normalized:
        return False
    if "/app/" in normalized:
        return True
    # Local Windows checkout without /app/ segment
    if "/ronal-barber/backend/" in normalized:
        return True
    return False


def _append_frame(frames: list[StackFrameMeta], filename: str | None, name: str | None, lineno: int | None) -> None:
    if not filename or not _is_interesting_path(filename):
        return
    file_name = Path(filename).name
    function = name or "<unknown>"
    frames.append(
        StackFrameMeta(
            file=file_name,
            function=function,
            line=lineno or 0,
            key=_frame_key(file_name, function),
        )
    )


def _capture_app_stack() -> list[StackFrameMeta]:
    """Resolve the app stack; async SQL needs the pre-greenlet snapshot when available."""
    frames: list[StackFrameMeta] = []

    pending = _pending_sql_stack.get()
    if pending:
        for item in pending:
            if isinstance(item, dict):
                frames.append(
                    StackFrameMeta(
                        file=str(item.get("file", "")),
                        function=str(item.get("function", "")),
                        line=int(item.get("line", 0) or 0),
                        key=str(item.get("key", "")),
                    )
                )
        if frames:
            return frames

    try:
        task = asyncio.current_task()
    except RuntimeError:
        task = None
    if task is not None:
        for fr in task.get_stack(limit=MAX_STACK_FRAMES):
            _append_frame(frames, fr.f_code.co_filename, fr.f_code.co_name, fr.f_lineno)
            if len(frames) >= MAX_STACK_FRAMES:
                return frames
    if frames:
        return frames

    try:
        import greenlet as greenlet_mod

        gr = greenlet_mod.getcurrent()
        while gr is not None and len(frames) < MAX_STACK_FRAMES:
            frame = getattr(gr, "gr_frame", None)
            while frame is not None and len(frames) < MAX_STACK_FRAMES:
                _append_frame(frames, frame.f_code.co_filename, frame.f_code.co_name, frame.f_lineno)
                frame = frame.f_back
            gr = gr.parent
    except Exception:
        pass
    if frames:
        return frames

    for fr in traceback.extract_stack()[:-2]:
        _append_frame(frames, fr.filename, fr.name, fr.lineno)
        if len(frames) >= MAX_STACK_FRAMES:
            break
    return frames


def _on_orm_execute(_orm_execute_state: Any) -> None:
    """Runs in the caller context (async) before SQLAlchemy switches to a greenlet."""
    if _sql_buffer.get() is None:
        return
    stack = []
    for fr in traceback.extract_stack()[:-1]:
        if not fr.filename or not _is_interesting_path(fr.filename):
            continue
        file_name = Path(fr.filename).name
        function = fr.name or "<unknown>"
        stack.append(
            {
                "file": file_name,
                "function": function,
                "line": fr.lineno or 0,
                "key": _frame_key(file_name, function),
            }
        )
        if len(stack) >= MAX_STACK_FRAMES:
            break
    _pending_sql_stack.set(stack or None)


def _before_cursor_execute(
    conn: Any,
    _cursor: Any,
    _statement: Any,
    _parameters: Any,
    _context: Any,
    _executemany: Any,
) -> None:
    conn.info.setdefault("profiling_query_start", []).append(time.perf_counter())


def _after_cursor_execute(
    conn: Any,
    _cursor: Any,
    statement: Any,
    parameters: Any,
    _context: Any,
    _executemany: Any,
) -> None:
    starts = conn.info.get("profiling_query_start")
    if not starts:
        return
    started = starts.pop()
    buffer = _sql_buffer.get()
    if buffer is None:
        return
    duration_ms = round((time.perf_counter() - started) * 1000, 3)
    stack = _capture_app_stack()
    _pending_sql_stack.set(None)
    owner_key = stack[-1].key if stack else ""
    buffer.append(
        {
            "statement": _truncate(str(statement).strip(), MAX_SQL_STATEMENT_CHARS),
            "duration_ms": duration_ms,
            "parameters": _format_parameters(parameters),
            "stack": [asdict(frame) for frame in stack],
            "owner_key": owner_key,
        }
    )


def install_sql_listeners(sync_engine: Engine) -> None:
    global _sql_listeners_installed
    if _sql_listeners_installed:
        return
    event.listen(Session, "do_orm_execute", _on_orm_execute)
    event.listen(sync_engine, "before_cursor_execute", _before_cursor_execute)
    event.listen(sync_engine, "after_cursor_execute", _after_cursor_execute)
    _sql_listeners_installed = True
    logger.info("SQL profiling listeners installed")


def begin_sql_capture() -> Any:
    _pending_sql_stack.set(None)
    return _sql_buffer.set([])


def end_sql_capture(token: Any) -> list[SqlQueryMeta]:
    buffer = _sql_buffer.get() or []
    _sql_buffer.reset(token)
    _pending_sql_stack.set(None)
    queries: list[SqlQueryMeta] = []
    for item in buffer:
        stack = [
            StackFrameMeta(**frame)
            for frame in item.get("stack") or []
            if isinstance(frame, dict)
        ]
        queries.append(
            SqlQueryMeta(
                statement=str(item.get("statement", "")),
                duration_ms=float(item.get("duration_ms", 0)),
                parameters=str(item.get("parameters", "")),
                stack=stack,
                owner_key=str(item.get("owner_key", "")),
            )
        )
    return queries


def _frame_inclusive_s(frame: Any) -> float:
    return float(frame.total_self_time) + sum(_frame_inclusive_s(child) for child in frame.children)


def _serialize_cpu_frame(frame: Any) -> dict[str, Any]:
    file_short = frame.file_path_short or frame.file_path or ""
    file_name = Path(str(file_short)).name if file_short else ""
    function = frame.function or "<unknown>"
    inclusive_s = _frame_inclusive_s(frame)
    return {
        "function": function,
        "file": file_name,
        "line": frame.line_no or 0,
        "key": _frame_key(file_name or "?", function),
        "time_ms": round(inclusive_s * 1000, 3),
        "self_ms": round(float(frame.total_self_time) * 1000, 3),
        "is_application": bool(getattr(frame, "is_application_code", False)),
        "children": [_serialize_cpu_frame(child) for child in frame.children],
    }


def _cpu_tree_from_profiler(profiler: Profiler) -> dict[str, Any] | None:
    session = profiler.last_session
    if session is None:
        return None
    # PyInstrument 5.x: root_frame is a method, not a property.
    root = session.root_frame() if callable(getattr(session, "root_frame", None)) else session.root_frame
    if root is None:
        return None
    return _serialize_cpu_frame(root)


def _list_meta_paths() -> list[Path]:
    ensure_profiles_dir()
    return sorted(PROFILES_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)


def _prune_old_runs() -> None:
    metas = _list_meta_paths()
    for meta_path in metas[MAX_RUNS:]:
        run_id = meta_path.stem
        meta_path.unlink(missing_ok=True)
        (PROFILES_DIR / f"{run_id}.html").unlink(missing_ok=True)


def _query_to_dict(query: SqlQueryMeta) -> dict[str, Any]:
    return {
        "statement": query.statement,
        "duration_ms": query.duration_ms,
        "parameters": query.parameters,
        "owner_key": query.owner_key,
        "stack": [asdict(frame) for frame in query.stack],
    }


def _meta_to_dict(meta: ProfileRunMeta) -> dict[str, Any]:
    return {
        "id": meta.id,
        "method": meta.method,
        "path": meta.path,
        "status_code": meta.status_code,
        "duration_ms": meta.duration_ms,
        "created_at": meta.created_at,
        "sql_count": meta.sql_count,
        "sql_total_ms": meta.sql_total_ms,
        "queries": [_query_to_dict(q) for q in meta.queries],
        "cpu_tree": meta.cpu_tree,
    }


def _meta_from_dict(data: dict[str, Any]) -> ProfileRunMeta:
    queries: list[SqlQueryMeta] = []
    for item in data.get("queries") or []:
        if not isinstance(item, dict):
            continue
        stack = [
            StackFrameMeta(
                file=str(frame.get("file", "")),
                function=str(frame.get("function", "")),
                line=int(frame.get("line", 0) or 0),
                key=str(frame.get("key", "")),
            )
            for frame in item.get("stack") or []
            if isinstance(frame, dict)
        ]
        owner_key = str(item.get("owner_key") or (stack[-1].key if stack else ""))
        queries.append(
            SqlQueryMeta(
                statement=str(item.get("statement", "")),
                duration_ms=float(item.get("duration_ms", 0)),
                parameters=str(item.get("parameters", "")),
                stack=stack,
                owner_key=owner_key,
            )
        )
    sql_count = int(data.get("sql_count", len(queries)))
    sql_total_ms = float(data.get("sql_total_ms", sum(q.duration_ms for q in queries)))
    cpu_tree = data.get("cpu_tree")
    if cpu_tree is not None and not isinstance(cpu_tree, dict):
        cpu_tree = None
    return ProfileRunMeta(
        id=str(data["id"]),
        method=str(data["method"]),
        path=str(data["path"]),
        status_code=int(data["status_code"]),
        duration_ms=int(data["duration_ms"]),
        created_at=str(data["created_at"]),
        sql_count=sql_count,
        sql_total_ms=round(sql_total_ms, 3),
        queries=queries,
        cpu_tree=cpu_tree,
    )


def save_profile(
    *,
    method: str,
    path: str,
    status_code: int,
    duration_ms: int,
    html: str,
    queries: list[SqlQueryMeta] | None = None,
    cpu_tree: dict[str, Any] | None = None,
) -> ProfileRunMeta:
    ensure_profiles_dir()
    run_id = uuid4().hex[:16]
    query_list = queries or []
    meta = ProfileRunMeta(
        id=run_id,
        method=method,
        path=path,
        status_code=status_code,
        duration_ms=duration_ms,
        created_at=_utcnow().isoformat(),
        sql_count=len(query_list),
        sql_total_ms=round(sum(q.duration_ms for q in query_list), 3),
        queries=query_list,
        cpu_tree=cpu_tree,
    )
    (PROFILES_DIR / f"{run_id}.html").write_text(html, encoding="utf-8")
    (PROFILES_DIR / f"{run_id}.json").write_text(
        json.dumps(_meta_to_dict(meta), indent=2),
        encoding="utf-8",
    )
    _prune_old_runs()
    return meta


def list_runs() -> list[ProfileRunMeta]:
    runs: list[ProfileRunMeta] = []
    for meta_path in _list_meta_paths():
        try:
            data = json.loads(meta_path.read_text(encoding="utf-8"))
            meta = _meta_from_dict(data)
            meta.queries = []
            meta.cpu_tree = None
            runs.append(meta)
        except (OSError, json.JSONDecodeError, TypeError, KeyError) as error:
            logger.warning("Skipping corrupt profile meta %s: %s", meta_path, error)
    return runs


def get_run_detail(run_id: str) -> ProfileRunMeta | None:
    if not run_id.isalnum():
        return None
    meta_path = PROFILES_DIR / f"{run_id}.json"
    if not meta_path.is_file():
        return None
    try:
        data = json.loads(meta_path.read_text(encoding="utf-8"))
        return _meta_from_dict(data)
    except (OSError, json.JSONDecodeError, TypeError, KeyError):
        return None


def get_run_html(run_id: str) -> str | None:
    if not run_id.isalnum():
        return None
    path = PROFILES_DIR / f"{run_id}.html"
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def delete_run(run_id: str) -> bool:
    if not run_id.isalnum():
        return False
    html_path = PROFILES_DIR / f"{run_id}.html"
    meta_path = PROFILES_DIR / f"{run_id}.json"
    existed = html_path.exists() or meta_path.exists()
    html_path.unlink(missing_ok=True)
    meta_path.unlink(missing_ok=True)
    return existed


async def profile_request(request, call_next):
    if not is_enabled() or not should_profile_path(request.url.path):
        return await call_next(request)

    profiler = Profiler(async_mode="enabled")
    started = time.perf_counter()
    sql_token = begin_sql_capture()
    profiler.start()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        profiler.stop()
        queries = end_sql_capture(sql_token)
        duration_ms = int((time.perf_counter() - started) * 1000)
        try:
            html = profiler.output_html()
        except Exception:
            logger.exception("Failed to render profile HTML for %s %s", request.method, request.url.path)
            html = "<html><body><p>Profile HTML unavailable</p></body></html>"
        try:
            cpu_tree = _cpu_tree_from_profiler(profiler)
        except Exception:
            logger.exception("Failed to serialize CPU tree for %s %s", request.method, request.url.path)
            cpu_tree = None
        try:
            save_profile(
                method=request.method,
                path=str(request.url.path),
                status_code=status_code,
                duration_ms=duration_ms,
                html=html,
                queries=queries,
                cpu_tree=cpu_tree,
            )
        except Exception:
            logger.exception("Failed to save profile for %s %s", request.method, request.url.path)
