from collections.abc import AsyncGenerator
from datetime import date, time
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import hash_password
from app.db.session import get_db
from app.main import app
from app.models.models import Barber, Base, BusinessHours, Service, User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        barber = Barber(name="Test Barber", description="", specialties="", active=True)
        session.add(barber)
        await session.flush()
        service = Service(name="Corte", description="", price=Decimal("20.00"), duration_minutes=30, active=True)
        session.add(service)
        for day in range(6):
            session.add(BusinessHours(day_of_week=day, start_time=time(9), end_time=time(18), active=True))
        session.add(User(email="admin@test.com", password_hash=hash_password("password123"), role="admin"))
        session.add(User(email="barber@test.com", password_hash=hash_password("password123"), role="barber", barber_id=barber.id))
        await session.commit()
        yield session

    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
