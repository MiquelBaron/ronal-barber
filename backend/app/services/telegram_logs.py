"""Forward ERROR+ log records to a dedicated Telegram bot (admin-configured)."""

from __future__ import annotations

import html
import logging
import sys
import threading
import time
import traceback
from typing import ClassVar

import httpx

from app.services.settings_store import get_runtime_settings

logger = logging.getLogger(__name__)

TELEGRAM_TEXT_LIMIT = 3900
MIN_SEND_INTERVAL_SECONDS = 2.0


def _send_log_message_sync(text: str) -> bool:
    settings = get_runtime_settings()
    if not settings.telegram_logs_enabled:
        return False

    url = f"https://api.telegram.org/bot{settings.telegram_logs_bot_token}/sendMessage"
    try:
        with httpx.Client(timeout=8.0) as client:
            response = client.post(
                url,
                json={
                    "chat_id": settings.telegram_logs_chat_id,
                    "text": text,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": True,
                },
            )
            response.raise_for_status()
        return True
    except Exception as exc:  # noqa: BLE001 — never re-enter logging here
        sys.stderr.write(f"telegram logs bot send failed: {exc}\n")
        return False


def format_error_record(record: logging.LogRecord) -> str:
    message = record.getMessage()
    parts = [
        f"<b>ERROR</b> <code>{html.escape(record.name)}</code>",
        f"<b>Level</b> {html.escape(record.levelname)}",
        html.escape(message),
    ]
    if record.exc_info:
        try:
            formatted = "".join(traceback.format_exception(*record.exc_info))
        except Exception:  # noqa: BLE001
            formatted = record.exc_text or ""
        if formatted:
            parts.append(f"<pre>{html.escape(formatted[-2500:])}</pre>")
    elif record.exc_text:
        parts.append(f"<pre>{html.escape(record.exc_text[-2500:])}</pre>")

    text = "\n".join(parts)
    if len(text) > TELEGRAM_TEXT_LIMIT:
        text = text[: TELEGRAM_TEXT_LIMIT - 20] + "\n… (truncated)"
    return text


class TelegramErrorLogHandler(logging.Handler):
    """Sync handler: ERROR/CRITICAL → Telegram logs bot."""

    _emitting: ClassVar[threading.local] = threading.local()
    _lock: ClassVar[threading.Lock] = threading.Lock()
    _last_sent_at: ClassVar[float] = 0.0
    _suppressed: ClassVar[int] = 0

    def emit(self, record: logging.LogRecord) -> None:
        if record.levelno < logging.ERROR:
            return
        if record.name.startswith("app.services.telegram_logs"):
            return
        if getattr(self._emitting, "active", False):
            return

        settings = get_runtime_settings()
        if not settings.telegram_logs_enabled:
            return

        self._emitting.active = True
        try:
            with self._lock:
                now = time.monotonic()
                elapsed = now - self._last_sent_at
                if elapsed < MIN_SEND_INTERVAL_SECONDS:
                    self._suppressed += 1
                    return

                suppressed = self._suppressed
                self._suppressed = 0
                self._last_sent_at = now

            text = format_error_record(record)
            if suppressed:
                text = f"{text}\n\n<i>({suppressed} error(es) omitidos por rate-limit)</i>"
            _send_log_message_sync(text)
        except Exception:  # noqa: BLE001
            self.handleError(record)
        finally:
            self._emitting.active = False


_handler: TelegramErrorLogHandler | None = None


def configure_telegram_error_logging() -> None:
    """Attach a single ERROR handler to the root logger (idempotent)."""
    global _handler
    root = logging.getLogger()
    if _handler is not None and _handler in root.handlers:
        return
    for existing in root.handlers:
        if isinstance(existing, TelegramErrorLogHandler):
            _handler = existing
            return
    _handler = TelegramErrorLogHandler(level=logging.ERROR)
    _handler.setFormatter(logging.Formatter("%(message)s"))
    root.addHandler(_handler)
    logger.debug("Telegram error log handler attached")
