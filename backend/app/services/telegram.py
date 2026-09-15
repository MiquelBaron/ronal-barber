import logging
from datetime import datetime, timedelta
from uuid import uuid4

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.settings_store import get_runtime_settings
from app.models.models import Appointment, Barber, Service

logger = logging.getLogger(__name__)


async def send_message(chat_id: str, text: str) -> bool:
    settings = get_runtime_settings()
    if not settings.telegram_enabled:
        logger.info("Telegram disabled; would send to %s: %s", chat_id, text)
        return False

    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"})
            response.raise_for_status()
        logger.info("Telegram message sent to %s", chat_id)
        return True
    except Exception:
        logger.exception("Failed to send Telegram message to %s", chat_id)
        return False


async def notify_barber_new_appointment(
    barber: Barber,
    appointment: Appointment,
    service: Service,
) -> bool:
    if not barber.telegram_chat_id:
        return False

    text = (
        f"<b>Nueva cita</b>\n"
        f"{appointment.customer_name} {appointment.customer_surname}\n"
        f"{service.name} — {appointment.date.strftime('%d/%m/%Y')} {appointment.start_time.strftime('%H:%M')}\n"
        f"Tel: {appointment.customer_phone}"
    )
    return await send_message(barber.telegram_chat_id, text)


async def notify_barber_cancellation(
    barber: Barber,
    appointment: Appointment,
    service: Service | None,
) -> bool:
    if not barber.telegram_chat_id:
        return False

    service_name = service.name if service else "Servicio"
    text = (
        f"<b>Cita cancelada</b>\n"
        f"{appointment.customer_name} {appointment.customer_surname}\n"
        f"{service_name} — {appointment.date.strftime('%d/%m/%Y')} {appointment.start_time.strftime('%H:%M')}"
    )
    return await send_message(barber.telegram_chat_id, text)


async def generate_telegram_link_token(db: AsyncSession, barber: Barber) -> str:
    token = uuid4().hex
    barber.telegram_link_token = token
    barber.telegram_link_token_expires_at = datetime.utcnow() + timedelta(hours=1)
    await db.commit()
    return token


async def link_telegram_chat(db: AsyncSession, token: str, chat_id: str) -> Barber:
    from sqlalchemy import select

    barber = await db.scalar(select(Barber).where(Barber.telegram_link_token == token))
    if barber is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invalid or expired link token")

    if barber.telegram_link_token_expires_at and datetime.utcnow() > barber.telegram_link_token_expires_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Link token has expired")

    barber.telegram_chat_id = chat_id
    barber.telegram_link_token = None
    barber.telegram_link_token_expires_at = None
    await db.commit()
    await db.refresh(barber)
    return barber
