from datetime import datetime, timedelta, timezone

from fastapi import Cookie, Depends, HTTPException, Response, status
from jose import JWTError, jwt
from pwdlib import PasswordHash
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.services.settings_store import get_runtime_settings
from app.db.session import get_db
from app.models.models import Barber, User

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def create_access_token(user: User) -> str:
    expires = datetime.now(timezone.utc) + timedelta(hours=8)
    claims = {"sub": str(user.id), "role": user.role, "exp": expires}
    return jwt.encode(claims, get_runtime_settings().jwt_secret, algorithm="HS256")


def set_auth_cookie(response: Response, token: str) -> None:
    settings = get_runtime_settings()
    response.set_cookie(
        "access_token",
        token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=28800,
    )


async def get_current_user(access_token: str | None = Cookie(default=None), db: AsyncSession = Depends(get_db)) -> User:
    if not access_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    try:
        payload = jwt.decode(access_token, get_runtime_settings().jwt_secret, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, TypeError, ValueError) as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid authentication") from error

    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid authentication")

    if user.barber_id is not None:
        barber = await db.get(Barber, user.barber_id)
        setattr(user, "barber_name", barber.name if barber else None)

    return user


BARBER_ROLES = frozenset({"barber", "admin_barber"})
SHOP_MANAGER_ROLES = frozenset({"admin", "admin_barber"})


def is_barber_role(user: User) -> bool:
    return user.role in BARBER_ROLES and user.barber_id is not None


def is_shop_manager(user: User) -> bool:
    return user.role in SHOP_MANAGER_ROLES


def is_limited_barber(user: User) -> bool:
    return user.role == "barber" and user.barber_id is not None


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


async def require_shop_manager(user: User = Depends(get_current_user)) -> User:
    if not is_shop_manager(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Shop manager access required")
    return user


async def require_barber(user: User = Depends(get_current_user)) -> User:
    if not is_barber_role(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Barber access required")
    return user


async def require_admin_or_barber(user: User = Depends(get_current_user)) -> User:
    if user.role == "admin":
        return user
    if is_barber_role(user):
        return user
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin or barber access required")
