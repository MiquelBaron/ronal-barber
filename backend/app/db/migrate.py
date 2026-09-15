"""Apply incremental schema patches to existing PostgreSQL databases.

create_all() only creates new tables; it does not add columns to existing ones.
These patches keep Docker volumes working across model updates.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

PATCHES: list[str] = [
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
    "CREATE INDEX IF NOT EXISTS ix_appointments_cancel_token ON appointments (cancel_token)",
    # system settings
    """
    CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(120) PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """,
]


async def apply_schema_patches(connection: AsyncConnection) -> None:
    for patch in PATCHES:
        await connection.execute(text(patch))
