import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.models import Barber, User


async def _login(client: AsyncClient, email: str, password: str = "password123") -> None:
    response = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200


async def _seed_admin_barber(db_session: AsyncSession) -> tuple[int, int]:
    """Returns (jefe_barber_id, free_barber_id) for creating a new barber user."""
    jefe_barber = Barber(name="Jefe Barber", description="", specialties="", active=True)
    free_barber = Barber(name="Free Barber", description="", specialties="", active=True)
    db_session.add_all([jefe_barber, free_barber])
    await db_session.flush()
    db_session.add(
        User(
            email="jefe@test.com",
            password_hash=hash_password("password123"),
            role="admin_barber",
            barber_id=jefe_barber.id,
        )
    )
    await db_session.commit()
    return jefe_barber.id, free_barber.id


@pytest.mark.asyncio
async def test_admin_barber_can_create_barber_user(client: AsyncClient, db_session: AsyncSession) -> None:
    _, free_barber_id = await _seed_admin_barber(db_session)
    await _login(client, "jefe@test.com")

    response = await client.post(
        "/api/admin/users",
        json={
            "email": "nuevo@test.com",
            "password": "password123",
            "role": "barber",
            "barber_id": free_barber_id,
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "barber"
    assert body["barber_id"] == free_barber_id


@pytest.mark.asyncio
async def test_admin_barber_cannot_create_admin_or_admin_barber(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, free_barber_id = await _seed_admin_barber(db_session)
    await _login(client, "jefe@test.com")

    for role in ("admin", "admin_barber"):
        response = await client.post(
            "/api/admin/users",
            json={
                "email": f"{role}@deny.test.com",
                "password": "password123",
                "role": role,
                "barber_id": free_barber_id if role != "admin" else None,
            },
        )
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_barber_cannot_update_or_delete_users(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _seed_admin_barber(db_session)
    await _login(client, "jefe@test.com")

    users = await client.get("/api/admin/users")
    assert users.status_code == 200
    barber_user_id = next(item["id"] for item in users.json() if item["email"] == "barber@test.com")

    patch = await client.patch(
        f"/api/admin/users/{barber_user_id}",
        json={"role": "barber", "barber_id": 1},
    )
    assert patch.status_code == 403

    delete = await client.delete(f"/api/admin/users/{barber_user_id}")
    assert delete.status_code == 403
