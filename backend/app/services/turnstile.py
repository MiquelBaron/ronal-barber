"""Cloudflare Turnstile verification for public bookings."""

from __future__ import annotations

import logging

import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings

logger = logging.getLogger(__name__)

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

# Cloudflare published always-pass test secret (no real hostname on fake tokens).
_DUMMY_ALWAYS_PASS_SECRETS = frozenset(
    {
        "1x0000000000000000000000000000000AA",
        "2x0000000000000000000000000000000AA",
        "3x0000000000000000000000000000000AA",
    }
)


def _expected_hostnames() -> set[str]:
    settings = get_settings()
    hosts = {
        host.strip().lower()
        for host in settings.turnstile_expected_hostnames.split(",")
        if host.strip()
    }
    if not settings.is_production:
        hosts.add("localhost")
    return hosts


def _client_ip(request_client_host: str | None, forwarded_for: str | None) -> str | None:
    if forwarded_for:
        first = forwarded_for.split(",")[0].strip()
        if first:
            return first
    return request_client_host


async def verify_turnstile_token(
    token: str,
    *,
    remote_ip: str | None = None,
) -> None:
    settings = get_settings()
    secret = settings.turnstile_secret_key.strip()

    if not secret:
        if settings.is_production:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Captcha verification failed",
            )
        return

    if not token.strip():
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Captcha verification failed")

    data: dict[str, str] = {"secret": secret, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(SITEVERIFY_URL, data=data)
            response.raise_for_status()
            payload = response.json()
    except Exception:
        logger.exception("Turnstile siteverify request failed")
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Captcha verification failed") from None

    if not payload.get("success"):
        logger.info("Turnstile verification rejected: %s", payload.get("error-codes"))
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Captcha verification failed")

    if secret in _DUMMY_ALWAYS_PASS_SECRETS:
        return

    hostname = str(payload.get("hostname") or "").strip().lower()
    allowed = _expected_hostnames()
    if hostname not in allowed:
        logger.info("Turnstile hostname mismatch: %s not in %s", hostname, allowed)
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Captcha verification failed")


def resolve_remote_ip(request_client_host: str | None, forwarded_for: str | None) -> str | None:
    return _client_ip(request_client_host, forwarded_for)
