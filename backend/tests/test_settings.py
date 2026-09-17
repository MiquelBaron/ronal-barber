import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.settings_store import (
    clear_runtime_settings_cache,
    get_runtime_settings,
    refresh_cache,
    update_settings,
)


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
async def test_refresh_cache_loads_database_values(db_session: AsyncSession) -> None:
    clear_runtime_settings_cache()

    fallback = get_runtime_settings()
    assert fallback.email_enabled is False

    await update_settings(
        db_session,
        {
            "smtp_host": "smtp.gmail.com",
            "smtp_from": "ronalbarber504@gmail.com",
            "smtp_port": "587",
            "smtp_use_tls": "true",
        },
    )
    runtime = get_runtime_settings()

    assert runtime.smtp_host == "smtp.gmail.com"
    assert runtime.smtp_from == "ronalbarber504@gmail.com"
    assert runtime.email_enabled is True


@pytest.mark.asyncio
async def test_update_settings_refreshes_runtime_cache(db_session: AsyncSession) -> None:
    clear_runtime_settings_cache()
    await refresh_cache(db_session)

    await update_settings(db_session, {"smtp_host": "smtp.updated.com", "smtp_from": "mail@updated.com"})
    runtime = get_runtime_settings()

    assert runtime.smtp_host == "smtp.updated.com"
    assert runtime.smtp_from == "mail@updated.com"
    assert runtime.email_enabled is True


@pytest.mark.asyncio
async def test_secret_fields_keep_existing_value(db_session: AsyncSession) -> None:
    await update_settings(db_session, {"smtp_password": "super-secret"})
    await update_settings(db_session, {"smtp_password": "••••••••"})
    await refresh_cache(db_session)
    assert get_runtime_settings().smtp_password == "super-secret"
