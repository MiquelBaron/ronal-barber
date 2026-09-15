import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.settings_store import get_runtime_settings, refresh_cache, update_settings


@pytest.mark.asyncio
async def test_admin_can_read_and_update_settings(client: AsyncClient, db_session: AsyncSession) -> None:
    login = await client.post("/api/auth/login", json={"email": "admin@test.com", "password": "password123"})
    assert login.status_code == 200

    response = await client.get("/api/admin/settings")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["items"]) > 0
    assert any(item["key"] == "smtp_host" for item in payload["items"])

    update = await client.put(
        "/api/admin/settings",
        json={"settings": {"app_name": "Ronal Test", "smtp_host": "smtp.test.com", "smtp_port": "587"}},
    )
    assert update.status_code == 200
    assert update.json()["items"]

    await refresh_cache(db_session)
    runtime = get_runtime_settings()
    assert runtime.app_name == "Ronal Test"
    assert runtime.smtp_host == "smtp.test.com"


@pytest.mark.asyncio
async def test_secret_fields_keep_existing_value(db_session: AsyncSession) -> None:
    await update_settings(db_session, {"smtp_password": "super-secret"})
    await update_settings(db_session, {"smtp_password": "••••••••"})
    await refresh_cache(db_session)
    assert get_runtime_settings().smtp_password == "super-secret"
