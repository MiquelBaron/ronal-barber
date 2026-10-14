"""Apply incremental schema patches to existing PostgreSQL databases.

create_all() only creates new tables; it does not add columns to existing ones.
These patches keep Docker volumes working across model updates.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

COMMON_PATCHES: list[str] = [
    # users
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS barber_id INTEGER UNIQUE REFERENCES barbers(id)",
    # barbers — telegram
    "ALTER TABLE barbers ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(64)",
    "ALTER TABLE barbers ADD COLUMN IF NOT EXISTS telegram_link_token VARCHAR(64)",
    "ALTER TABLE barbers ADD COLUMN IF NOT EXISTS telegram_link_token_expires_at TIMESTAMP",
    "CREATE INDEX IF NOT EXISTS ix_barbers_telegram_link_token ON barbers (telegram_link_token)",
    # appointments — email / cancel flow
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_token VARCHAR(64)",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_token_expires_at TIMESTAMP",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMP",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS review_request_sent_at TIMESTAMP",
    "CREATE INDEX IF NOT EXISTS ix_appointments_cancel_token ON appointments (cancel_token)",
    # system settings
    """
    CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(120) PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_barber_start
    ON appointments (barber_id, date, start_time)
    WHERE status <> 'cancelled' AND barber_id IS NOT NULL
    """,
]

POSTGRES_PATCHES: list[str] = [
    # cron jobs registry (create_all also creates this on fresh DBs)
    """
    CREATE TABLE IF NOT EXISTS cron_jobs (
        id SERIAL PRIMARY KEY,
        code VARCHAR(80) NOT NULL UNIQUE,
        name VARCHAR(160) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        trigger_type VARCHAR(20) NOT NULL DEFAULT 'interval',
        cron_hour INTEGER,
        cron_minute INTEGER,
        interval_minutes INTEGER,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        last_run_at TIMESTAMP,
        last_run_status VARCHAR(20) NOT NULL DEFAULT 'never',
        last_run_duration_ms INTEGER,
        last_run_summary TEXT NOT NULL DEFAULT '',
        last_error TEXT NOT NULL DEFAULT '',
        next_run_at TIMESTAMP,
        run_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """,
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_cron_jobs_code ON cron_jobs (code)",
    # business_hours — per-barber schedules (backfill then enforce NOT NULL)
    "ALTER TABLE business_hours ADD COLUMN IF NOT EXISTS barber_id INTEGER REFERENCES barbers(id) ON DELETE CASCADE",
    """
    DO $$ BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'business_hours' AND column_name = 'barber_id'
        ) AND EXISTS (SELECT 1 FROM business_hours WHERE barber_id IS NULL) THEN
            INSERT INTO business_hours (barber_id, day_of_week, start_time, end_time, active)
            SELECT b.id, h.day_of_week, h.start_time, h.end_time, h.active
            FROM business_hours h
            CROSS JOIN barbers b
            WHERE h.barber_id IS NULL;
            DELETE FROM business_hours WHERE barber_id IS NULL;
        END IF;
    END $$;
    """,
    """
    DO $$ BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'business_hours' AND column_name = 'barber_id'
              AND is_nullable = 'YES'
        ) AND NOT EXISTS (SELECT 1 FROM business_hours WHERE barber_id IS NULL) THEN
            ALTER TABLE business_hours ALTER COLUMN barber_id SET NOT NULL;
        END IF;
    END $$;
    """,
    "CREATE INDEX IF NOT EXISTS ix_business_hours_barber_id ON business_hours (barber_id)",
    # appointments — prevent overlapping bookings for the same barber
    "CREATE EXTENSION IF NOT EXISTS btree_gist",
    """
    DO $$ BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'ex_appointments_no_overlap'
        ) THEN
            ALTER TABLE appointments ADD CONSTRAINT ex_appointments_no_overlap
            EXCLUDE USING gist (
                barber_id WITH =,
                tsrange(
                    (date + start_time)::timestamp,
                    (date + end_time)::timestamp,
                    '[)'
                ) WITH &&
            ) WHERE (status <> 'cancelled' AND barber_id IS NOT NULL);
        END IF;
    END $$;
    """,
]


async def apply_schema_patches(connection: AsyncConnection) -> None:
    patches = list(COMMON_PATCHES)
    if connection.dialect.name == "postgresql":
        patches.extend(POSTGRES_PATCHES)
    for patch in patches:
        await connection.execute(text(patch))
