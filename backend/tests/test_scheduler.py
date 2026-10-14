from contextlib import asynccontextmanager
from datetime import date, datetime, time
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Appointment, Barber, CronJob, CronJobStatus, Service
from app.services.scheduler import (
    ensure_cron_jobs_seeded,
    execute_cron_job,
    next_day_for_reminders,
    send_appointment_reminders,
    send_review_requests,
)


def test_next_day_for_reminders_uses_local_timezone() -> None:
    reference = datetime(2026, 9, 17, 21, 30, tzinfo=ZoneInfo("Europe/Madrid"))
    assert next_day_for_reminders(reference) == date(2026, 9, 18)


@pytest.mark.asyncio
async def test_send_appointment_reminders_targets_next_day_only(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    tomorrow = date(2026, 9, 18)
    today = date(2026, 9, 17)

    sent_ids: list[int] = []

    async def fake_send_reminder(appointment: Appointment, service: Service, barber: Barber | None) -> bool:
        sent_ids.append(appointment.id)
        return True

    @asynccontextmanager
    async def mock_session_local():
        yield db_session

    monkeypatch.setattr("app.crons.reminder_daily.SessionLocal", mock_session_local)
    monkeypatch.setattr("app.crons.reminder_daily.next_day_for_reminders", lambda: tomorrow)
    monkeypatch.setattr("app.crons.reminder_daily.email_service.send_reminder_24h", fake_send_reminder)

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

    monkeypatch.setattr("app.crons.reminder_daily.SessionLocal", mock_session_local)
    monkeypatch.setattr("app.crons.reminder_daily.next_day_for_reminders", lambda: tomorrow)
    monkeypatch.setattr("app.crons.reminder_daily.get_runtime_settings", lambda: DisabledEmailSettings())
    monkeypatch.setattr("app.crons.reminder_daily.email_service.send_reminder_24h", fake_send_reminder)

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


@pytest.mark.asyncio
async def test_send_review_requests_only_after_end_time(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    timezone = ZoneInfo("Europe/Madrid")
    now = datetime(2026, 9, 17, 12, 0, tzinfo=timezone)
    today = date(2026, 9, 17)
    sent_ids: list[int] = []

    async def fake_send_review(appointment: Appointment, service: Service, barber: Barber | None) -> bool:
        sent_ids.append(appointment.id)
        return True

    @asynccontextmanager
    async def mock_session_local():
        yield db_session

    class ReviewSettings:
        email_enabled = True
        google_review_url = "https://g.page/r/example"
        reminder_timezone = "Europe/Madrid"

    monkeypatch.setattr("app.crons.review_requests_hourly.SessionLocal", mock_session_local)
    monkeypatch.setattr("app.crons.review_requests_hourly.get_runtime_settings", lambda: ReviewSettings())
    monkeypatch.setattr("app.crons.review_requests_hourly.email_service.send_review_request", fake_send_review)

    service = await db_session.get(Service, 1)
    assert service is not None

    db_session.add_all(
        [
            Appointment(
                service_id=service.id,
                barber_id=1,
                customer_name="Past",
                customer_surname="Client",
                customer_phone="600000010",
                customer_email="past@example.com",
                date=today,
                start_time=time(10, 0),
                end_time=time(10, 40),
                price=Decimal("20.00"),
                cancel_token="token-past",
            ),
            Appointment(
                service_id=service.id,
                barber_id=1,
                customer_name="Future",
                customer_surname="Client",
                customer_phone="600000011",
                customer_email="future@example.com",
                date=today,
                start_time=time(16, 0),
                end_time=time(16, 40),
                price=Decimal("20.00"),
                cancel_token="token-future",
            ),
            Appointment(
                service_id=service.id,
                barber_id=1,
                customer_name="Cancelled",
                customer_surname="Client",
                customer_phone="600000012",
                customer_email="cancelled@example.com",
                date=today,
                start_time=time(9, 0),
                end_time=time(9, 40),
                price=Decimal("20.00"),
                status="cancelled",
                cancel_token="token-cancelled",
            ),
        ]
    )
    await db_session.commit()

    await send_review_requests(reference=now)

    assert sent_ids == [1]
    refreshed = await db_session.get(Appointment, 1)
    assert refreshed is not None
    assert refreshed.review_request_sent_at is not None


@pytest.mark.asyncio
async def test_send_review_requests_skips_without_url(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    timezone = ZoneInfo("Europe/Madrid")
    now = datetime(2026, 9, 17, 18, 0, tzinfo=timezone)
    today = date(2026, 9, 17)

    @asynccontextmanager
    async def mock_session_local():
        yield db_session

    class NoUrlSettings:
        email_enabled = True
        google_review_url = ""
        reminder_timezone = "Europe/Madrid"

    monkeypatch.setattr("app.crons.review_requests_hourly.SessionLocal", mock_session_local)
    monkeypatch.setattr("app.crons.review_requests_hourly.get_runtime_settings", lambda: NoUrlSettings())

    service = await db_session.get(Service, 1)
    assert service is not None
    appointment = Appointment(
        service_id=service.id,
        barber_id=1,
        customer_name="Past",
        customer_surname="Client",
        customer_phone="600000010",
        customer_email="past@example.com",
        date=today,
        start_time=time(10, 0),
        end_time=time(10, 40),
        price=Decimal("20.00"),
        cancel_token="token-past-2",
    )
    db_session.add(appointment)
    await db_session.commit()
    appointment_id = appointment.id

    await send_review_requests(reference=now)

    refreshed = await db_session.get(Appointment, appointment_id)
    assert refreshed is not None
    assert refreshed.review_request_sent_at is None


@pytest.mark.asyncio
async def test_execute_cron_job_records_ok_status(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    @asynccontextmanager
    async def mock_session_local():
        yield db_session

    async def fake_reminders() -> str:
        return "ok-test"

    monkeypatch.setattr("app.services.scheduler.SessionLocal", mock_session_local)
    monkeypatch.setattr("app.services.scheduler.JOB_HANDLERS", {"reminder_daily": fake_reminders})
    monkeypatch.setattr("app.services.scheduler.sync_next_run_times", lambda: _noop_async())

    await ensure_cron_jobs_seeded()
    await execute_cron_job("reminder_daily")

    job = await db_session.scalar(select(CronJob).where(CronJob.code == "reminder_daily"))
    assert job is not None
    assert job.last_run_status == CronJobStatus.ok.value
    assert job.last_run_summary == "ok-test"
    assert job.run_count == 1
    assert job.last_run_at is not None


async def _noop_async() -> None:
    return None
