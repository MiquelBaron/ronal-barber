from contextlib import asynccontextmanager
from datetime import date, datetime, time
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Appointment, Barber, Service
from app.services.scheduler import next_day_for_reminders, send_appointment_reminders


def test_next_day_for_reminders_uses_local_timezone() -> None:
    reference = datetime(2026, 9, 17, 21, 30, tzinfo=ZoneInfo("Europe/Madrid"))
    assert next_day_for_reminders(reference) == date(2026, 9, 18)


@pytest.mark.asyncio
async def test_send_appointment_reminders_targets_next_day_only(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    timezone = ZoneInfo("Europe/Madrid")
    reference = datetime(2026, 9, 17, 21, 0, tzinfo=timezone)
    tomorrow = date(2026, 9, 18)
    today = date(2026, 9, 17)

    sent_ids: list[int] = []

    async def fake_send_reminder(appointment: Appointment, service: Service, barber: Barber | None) -> bool:
        sent_ids.append(appointment.id)
        return True

    @asynccontextmanager
    async def mock_session_local():
        yield db_session

    monkeypatch.setattr("app.services.scheduler.SessionLocal", mock_session_local)
    monkeypatch.setattr("app.services.scheduler.next_day_for_reminders", lambda: tomorrow)
    monkeypatch.setattr("app.services.scheduler.email_service.send_reminder_24h", fake_send_reminder)

    service = await db_session.get(Service, 1)
    assert service is not None

    db_session.add_all(
        [
            Appointment(
                service_id=service.id,
                barber_id=1,
                customer_name="Ana",
                customer_surname="López",
                customer_phone="600000001",
                customer_email="ana@example.com",
                date=today,
                start_time=time(10, 0),
                end_time=time(10, 40),
                price=Decimal("20.00"),
                cancel_token="token-today",
            ),
            Appointment(
                service_id=service.id,
                barber_id=1,
                customer_name="Luis",
                customer_surname="García",
                customer_phone="600000002",
                customer_email="luis@example.com",
                date=tomorrow,
                start_time=time(11, 0),
                end_time=time(11, 40),
                price=Decimal("20.00"),
                cancel_token="token-tomorrow",
            ),
        ]
    )
    await db_session.commit()

    await send_appointment_reminders()

    assert sent_ids == [2]

    refreshed = await db_session.get(Appointment, 2)
    assert refreshed is not None
    assert refreshed.reminder_sent_at is not None


@pytest.mark.asyncio
async def test_send_appointment_reminders_does_not_mark_sent_when_email_disabled(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tomorrow = date(2026, 9, 18)

    async def fake_send_reminder(_appointment: Appointment, _service: Service, _barber: Barber | None) -> bool:
        return False

    @asynccontextmanager
    async def mock_session_local():
        yield db_session

    class DisabledEmailSettings:
        email_enabled = False

    monkeypatch.setattr("app.services.scheduler.SessionLocal", mock_session_local)
    monkeypatch.setattr("app.services.scheduler.next_day_for_reminders", lambda: tomorrow)
    monkeypatch.setattr("app.services.scheduler.get_runtime_settings", lambda: DisabledEmailSettings())
    monkeypatch.setattr("app.services.scheduler.email_service.send_reminder_24h", fake_send_reminder)

    service = await db_session.get(Service, 1)
    assert service is not None

    appointment = Appointment(
        service_id=service.id,
        barber_id=1,
        customer_name="Luis",
        customer_surname="García",
        customer_phone="600000002",
        customer_email="luis@example.com",
        date=tomorrow,
        start_time=time(11, 0),
        end_time=time(11, 40),
        price=Decimal("20.00"),
        cancel_token="token-tomorrow",
    )
    db_session.add(appointment)
    await db_session.commit()
    appointment_id = appointment.id

    await send_appointment_reminders()

    refreshed = await db_session.get(Appointment, appointment_id)
    assert refreshed is not None
    assert refreshed.reminder_sent_at is None
