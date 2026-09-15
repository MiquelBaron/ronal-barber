import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.api.routes import router
from app.db.session import SessionLocal
from app.services.scheduler import apply_scheduler_settings, stop_scheduler
from app.services.settings_store import ensure_defaults_seeded, get_runtime_settings, refresh_cache
from app.telegram.bot import poll_telegram_updates

logger = logging.getLogger(__name__)


class DynamicCORSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        origin = request.headers.get("origin")
        allowed = get_runtime_settings().frontend_origin

        if request.method == "OPTIONS" and origin:
            response = Response(status_code=204)
        else:
            response = await call_next(request)

        if origin and origin == allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-CSRF-Token"
        return response


async def telegram_polling_loop() -> None:
    offset = 0
    while True:
        settings = get_runtime_settings()
        if not settings.telegram_enabled or settings.telegram_webhook_secret:
            await asyncio.sleep(2)
            continue
        try:
            offset = await poll_telegram_updates(offset)
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Telegram polling error")
        await asyncio.sleep(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with SessionLocal() as db:
        await ensure_defaults_seeded(db)
        await refresh_cache(db)
    apply_scheduler_settings()
    polling_task = asyncio.create_task(telegram_polling_loop())
    yield
    polling_task.cancel()
    try:
        await polling_task
    except asyncio.CancelledError:
        pass
    stop_scheduler()


runtime = get_runtime_settings()
app = FastAPI(title=runtime.app_name, version="0.3.0", lifespan=lifespan)

app.add_middleware(DynamicCORSMiddleware)
app.include_router(router)
