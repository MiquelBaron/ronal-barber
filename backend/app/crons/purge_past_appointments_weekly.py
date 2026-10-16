"""Every Friday: delete appointments dated before today (shop timezone)."""

from __future__ import annotations

import logging

from sqlalchemy import delete, func, select

from app.crons.common import CronSpec, shop_now
from app.db.session import SessionLocal
from app.models.models import Appointment

logger = logging.getLogger(__name__)

CODE = "purge_past_appointments_weekly"


async def run() -> str:
    today = shop_now().date()
    async with SessionLocal() as db:
        count = await db.scalar(
            select(func.count()).select_from(Appointment).where(Appointment.date < today)
        )
        await db.execute(delete(Appointment).where(Appointment.date < today))
        await db.commit()

    deleted = int(count or 0)
    logger.info("Purged %s appointments before %s", deleted, today.isoformat())
    return f"Eliminadas {deleted} citas anteriores a {today.isoformat()}"


SPEC = CronSpec(
    code=CODE,
    name="Purga de citas pasadas",
    description="Cada viernes borra todas las citas con fecha anterior a ese día.",
    trigger_type="cron",
    cron_hour=3,
    cron_minute=0,
    cron_day_of_week=4,  # Friday (Mon=0)
    run=run,
)
