import logging

import httpx

from app.services.settings_store import get_runtime_settings
from app.db.session import SessionLocal
from app.services import telegram as telegram_service

logger = logging.getLogger(__name__)


async def handle_update(update: dict) -> None:
    message = update.get("message") or update.get("edited_message")
    if not message:
        return

    text = message.get("text", "")
    chat_id = str(message["chat"]["id"])

    if not text.startswith("/start"):
        return

    parts = text.split(maxsplit=1)
    if len(parts) < 2:
        await telegram_service.send_message(chat_id, "Usa el enlace de vinculación desde tu panel de barbero.")
        return

    token = parts[1].strip()
    async with SessionLocal() as db:
        try:
            barber = await telegram_service.link_telegram_chat(db, token, chat_id)
            await telegram_service.send_message(
                chat_id,
                f"✅ Telegram vinculado correctamente, {barber.name}. Recibirás avisos de nuevas citas.",
            )
        except Exception as exc:
            logger.warning("Telegram link failed: %s", exc)
            await telegram_service.send_message(chat_id, "❌ Enlace inválido o expirado. Genera uno nuevo desde tu panel.")


async def poll_telegram_updates(offset: int = 0) -> int:
    settings = get_runtime_settings()
    if not settings.telegram_enabled:
        return offset

    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/getUpdates"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, params={"offset": offset, "timeout": 25})
            response.raise_for_status()
            data = response.json()
    except Exception:
        logger.exception("Telegram polling failed")
        return offset

    for update in data.get("result", []):
        await handle_update(update)
        offset = update["update_id"] + 1

    return offset
