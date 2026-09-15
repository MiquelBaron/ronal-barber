"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-09-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "barbers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("specialties", sa.Text(), nullable=False),
        sa.Column("image_url", sa.String(length=500), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("telegram_chat_id", sa.String(length=64), nullable=True),
        sa.Column("telegram_link_token", sa.String(length=64), nullable=True),
        sa.Column("telegram_link_token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_barbers_telegram_link_token"), "barbers", ["telegram_link_token"], unique=False)

    op.create_table(
        "services",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "business_hours",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_business_hours_day_of_week"), "business_hours", ["day_of_week"], unique=False)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("barber_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["barber_id"], ["barbers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("barber_id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "days_off",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("barber_id", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["barber_id"], ["barbers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_days_off_start_date"), "days_off", ["start_date"], unique=False)
    op.create_index(op.f("ix_days_off_end_date"), "days_off", ["end_date"], unique=False)

    op.create_table(
        "appointments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=False),
        sa.Column("barber_id", sa.Integer(), nullable=True),
        sa.Column("customer_name", sa.String(length=80), nullable=False),
        sa.Column("customer_surname", sa.String(length=120), nullable=False),
        sa.Column("customer_phone", sa.String(length=40), nullable=False),
        sa.Column("customer_email", sa.String(length=255), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("payment_status", sa.String(length=20), nullable=False),
        sa.Column("payment_provider", sa.String(length=40), nullable=False),
        sa.Column("payment_reference", sa.String(length=120), nullable=False),
        sa.Column("cancel_token", sa.String(length=64), nullable=True),
        sa.Column("cancel_token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("confirmation_sent_at", sa.DateTime(), nullable=True),
        sa.Column("reminder_sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["barber_id"], ["barbers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_appointments_cancel_token"), "appointments", ["cancel_token"], unique=False)
    op.create_index(op.f("ix_appointments_date"), "appointments", ["date"], unique=False)
    op.create_index("ix_appointments_date_barber", "appointments", ["date", "barber_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_appointments_date_barber", table_name="appointments")
    op.drop_index(op.f("ix_appointments_date"), table_name="appointments")
    op.drop_index(op.f("ix_appointments_cancel_token"), table_name="appointments")
    op.drop_table("appointments")
    op.drop_index(op.f("ix_days_off_end_date"), table_name="days_off")
    op.drop_index(op.f("ix_days_off_start_date"), table_name="days_off")
    op.drop_table("days_off")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    op.drop_index(op.f("ix_business_hours_day_of_week"), table_name="business_hours")
    op.drop_table("business_hours")
    op.drop_table("services")
    op.drop_index(op.f("ix_barbers_telegram_link_token"), table_name="barbers")
    op.drop_table("barbers")
