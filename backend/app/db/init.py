import asyncio
from datetime import time
from decimal import Decimal

from sqlalchemy import select

from app.core.security import hash_password
from app.db.migrate import apply_schema_patches
from app.db.session import SessionLocal, engine
from app.models.models import Barber, Base, BusinessHours, Service, User
from app.services.settings_store import ensure_defaults_seeded

SERVICES = [
    ("Corte clásico", "Corte clásico personalizado adaptado a tu estilo.", "18.00", 30),
    ("Fade / Degradado", "Degradado preciso y acabado personalizado.", "20.00", 45),
    ("Corte + Barba", "Servicio completo de corte y arreglo de barba.", "28.00", 60),
    ("Barba", "Perfilado y arreglo de barba.", "12.00", 30),
    ("Corte Premium", "Corte, lavado, styling y acabado premium.", "30.00", 60),
]
BARBERS = [
    ("Barbero 1", "Especialista en fade y cortes modernos.", "Fade, Cortes modernos"),
    ("Barbero 2", "Especialista en corte clásico y barba.", "Corte clásico, Barba"),
]

BASE_USERS = [
    {"email": "admin@ronalbarber.com", "password": "admin", "role": "admin", "barber_index": None},
    {"email": "barber1@ronalbarber.com", "password": "barber1", "role": "admin_barber", "barber_index": 0},
    {"email": "barber2@ronalbarber.com", "password": "barber2", "role": "barber", "barber_index": 1},
]


async def ensure_base_users(session) -> None:
    barber_rows = list((await session.scalars(select(Barber).order_by(Barber.id))).all())

    for spec in BASE_USERS:
        barber_id = None
        if spec["barber_index"] is not None and spec["barber_index"] < len(barber_rows):
            barber_id = barber_rows[spec["barber_index"]].id

        user = await session.scalar(select(User).where(User.email == spec["email"]))
        if user is None:
            session.add(
                User(
                    email=spec["email"],
                    password_hash=hash_password(spec["password"]),
                    role=spec["role"],
                    barber_id=barber_id,
                )
            )
        else:
            user.password_hash = hash_password(spec["password"])
            user.role = spec["role"]
            user.barber_id = barber_id


async def init_database() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await apply_schema_patches(connection)

    async with SessionLocal() as session:
        if not (await session.scalar(select(Service.id).limit(1))):
            session.add_all(
                [Service(name=name, description=description, price=Decimal(price), duration_minutes=duration) for name, description, price, duration in SERVICES]
            )
        if not (await session.scalar(select(Barber.id).limit(1))):
            session.add_all([Barber(name=name, description=description, specialties=specialties) for name, description, specialties in BARBERS])
        if not (await session.scalar(select(BusinessHours.id).limit(1))):
            intervals = []
            for day in range(6):
                intervals.append(BusinessHours(day_of_week=day, start_time=time(9), end_time=time(14)))
                if day < 5:
                    intervals.append(BusinessHours(day_of_week=day, start_time=time(16), end_time=time(20)))
            session.add_all(intervals)
        await session.commit()

        await ensure_base_users(session)
        await session.commit()
        await ensure_defaults_seeded(session)


if __name__ == "__main__":
    asyncio.run(init_database())
