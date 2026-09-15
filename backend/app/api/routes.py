from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import email as email_service
from app.services.settings_store import GROUP_LABELS, get_settings_for_admin, get_runtime_settings, update_settings
from app.core.security import (
    create_access_token,
    get_current_user,
    hash_password,
    is_limited_barber,
    require_admin,
    require_admin_or_barber,
    require_barber,
    require_shop_manager,
    set_auth_cookie,
    verify_password,
)
from app.db.session import get_db
from app.models.models import Appointment, Barber, BusinessHours, DayOff, Service, User
from app.schemas.schemas import (
    AdminAppointmentOut,
    AppointmentByTokenOut,
    AppointmentIn,
    AppointmentOut,
    BarberDayOffIn,
    BarberIn,
    BarberOut,
    CancelAppointmentIn,
    DayOffIn,
    DayOffOut,
    HoursIn,
    LoginIn,
    ManualAppointmentIn,
    MyAppointmentOut,
    ServiceIn,
    ServiceOut,
    SettingItemOut,
    SettingsGroupOut,
    SettingsOut,
    SettingsUpdateIn,
    TelegramLinkOut,
    TelegramStatusOut,
    TestEmailIn,
    UserIn,
    UserOut,
)
from app.services import appointments as appointments_service
from app.services import booking as booking_service
from app.services import notifications as notifications_service
from app.services import telegram as telegram_service
from app.telegram.bot import handle_update

router = APIRouter(prefix="/api")


@router.post("/auth/login", response_model=UserOut)
async def login(payload: LoginIn, response: Response, db: AsyncSession = Depends(get_db)) -> User:
    user = await db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    set_auth_cookie(response, create_access_token(user))
    if user.barber_id is not None:
        barber = await db.get(Barber, user.barber_id)
        setattr(user, "barber_name", barber.name if barber else None)
    return user


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    response.delete_cookie("access_token")


@router.get("/auth/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("/admin/users", response_model=list[UserOut])
async def get_users(_: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> list[User]:
    return list((await db.scalars(select(User).order_by(User.email))).all())


@router.post("/admin/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserIn, _: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> User:
    if await db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "User already exists")
    if payload.role in {"barber", "admin_barber"} and payload.barber_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Barber users require barber_id")
    if payload.barber_id is not None:
        barber = await db.get(Barber, payload.barber_id)
        if barber is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Barber not found")
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        barber_id=payload.barber_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> None:
    if user_id == current_user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete your own account")
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    await db.delete(user)
    await db.commit()


@router.get("/appointments/mine", response_model=list[MyAppointmentOut])
async def my_appointments(user: User = Depends(require_barber), db: AsyncSession = Depends(get_db)) -> list[dict[str, object]]:
    return await appointments_service.get_barber_appointments(db, user.barber_id)


@router.post("/payments/mock")
async def mock_payment() -> dict[str, str]:
    return {"status": "paid", "provider": "mock", "reference": f"mock_{uuid4().hex[:12]}"}


@router.get("/admin/appointments", response_model=list[AdminAppointmentOut])
async def admin_appointments(_: User = Depends(require_admin_or_barber), db: AsyncSession = Depends(get_db)) -> list[dict[str, object]]:
    return await appointments_service.get_all_appointments(db)


@router.patch("/admin/appointments/{appointment_id}/status", response_model=AppointmentOut)
async def update_appointment_status(
    appointment_id: int,
    new_status: str = Query(..., pattern="^(pending|confirmed|cancelled|completed)$"),
    user: User = Depends(require_admin_or_barber),
    db: AsyncSession = Depends(get_db),
) -> Appointment:
    item = await db.get(Appointment, appointment_id)
    if item is None:
        raise HTTPException(404, "Appointment not found")
    if is_limited_barber(user) and item.barber_id != user.barber_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")
    item.status = new_status
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ronal-barber-api"}


@router.get("/services", response_model=list[ServiceOut])
async def get_services(db: AsyncSession = Depends(get_db), include_inactive: bool = False) -> list[Service]:
    query = select(Service).order_by(Service.id)
    if not include_inactive:
        query = query.where(Service.active.is_(True))
    return list((await db.scalars(query)).all())


@router.get("/services/{service_id}", response_model=ServiceOut)
async def get_service(service_id: int, db: AsyncSession = Depends(get_db)) -> Service:
    item = await db.get(Service, service_id)
    if item is None:
        raise HTTPException(404, "Service not found")
    return item


@router.post("/services", response_model=ServiceOut, status_code=status.HTTP_201_CREATED)
async def create_service(payload: ServiceIn, _: User = Depends(require_shop_manager), db: AsyncSession = Depends(get_db)) -> Service:
    item = Service(**payload.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/services/{service_id}", response_model=ServiceOut)
async def update_service(service_id: int, payload: ServiceIn, _: User = Depends(require_shop_manager), db: AsyncSession = Depends(get_db)) -> Service:
    item = await db.get(Service, service_id)
    if item is None:
        raise HTTPException(404, "Service not found")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service(service_id: int, _: User = Depends(require_shop_manager), db: AsyncSession = Depends(get_db)) -> None:
    item = await db.get(Service, service_id)
    if item is None:
        raise HTTPException(404, "Service not found")
    await db.delete(item)
    await db.commit()


@router.get("/barbers", response_model=list[BarberOut])
async def get_barbers(db: AsyncSession = Depends(get_db), include_inactive: bool = False) -> list[Barber]:
    query = select(Barber).order_by(Barber.id)
    if not include_inactive:
        query = query.where(Barber.active.is_(True))
    return list((await db.scalars(query)).all())


@router.get("/barbers/{barber_id}", response_model=BarberOut)
async def get_barber(barber_id: int, db: AsyncSession = Depends(get_db)) -> Barber:
    item = await db.get(Barber, barber_id)
    if item is None or not item.active:
        raise HTTPException(404, "Barber not found")
    return item


@router.post("/barbers", response_model=BarberOut, status_code=status.HTTP_201_CREATED)
async def create_barber(payload: BarberIn, _: User = Depends(require_shop_manager), db: AsyncSession = Depends(get_db)) -> Barber:
    item = Barber(**payload.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/barbers/{barber_id}", response_model=BarberOut)
async def update_barber(barber_id: int, payload: BarberIn, _: User = Depends(require_shop_manager), db: AsyncSession = Depends(get_db)) -> Barber:
    item = await db.get(Barber, barber_id)
    if item is None:
        raise HTTPException(404, "Barber not found")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/barbers/{barber_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_barber(barber_id: int, _: User = Depends(require_shop_manager), db: AsyncSession = Depends(get_db)) -> None:
    item = await db.get(Barber, barber_id)
    if item is None:
        raise HTTPException(404, "Barber not found")
    await db.delete(item)
    await db.commit()


@router.get("/hours")
async def get_hours(db: AsyncSession = Depends(get_db)) -> list[HoursIn]:
    return list((await db.scalars(select(BusinessHours).order_by(BusinessHours.day_of_week, BusinessHours.start_time))).all())


@router.put("/hours")
async def replace_hours(payload: list[HoursIn], _: User = Depends(require_shop_manager), db: AsyncSession = Depends(get_db)) -> list[HoursIn]:
    await db.execute(delete(BusinessHours))
    db.add_all([BusinessHours(**item.model_dump()) for item in payload if item.start_time < item.end_time])
    await db.commit()
    return await get_hours(db)


@router.get("/availability")
async def availability(
    service_id: int = Query(gt=0),
    date: date = Query(...),
    barber_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
) -> dict[str, list[str]]:
    slots = await booking_service.get_availability_slots(db, service_id, date, barber_id)
    return {"slots": slots}


@router.post("/appointments", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
async def create_appointment(payload: AppointmentIn, db: AsyncSession = Depends(get_db)) -> Appointment:
    appointment, service, barber = await booking_service.create_appointment(
        db,
        service_id=payload.service_id,
        barber_id=payload.barber_id,
        day=payload.date,
        start_time=payload.start_time,
        customer_name=payload.customer_name,
        customer_surname=payload.customer_surname,
        customer_phone=payload.customer_phone,
        customer_email=str(payload.customer_email),
    )
    await notifications_service.on_appointment_created(db, appointment, service, barber)
    return appointment


@router.post("/appointments/manual", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
async def create_manual_appointment(
    payload: ManualAppointmentIn,
    user: User = Depends(require_admin_or_barber),
    db: AsyncSession = Depends(get_db),
) -> Appointment:
    forced_barber_id = user.barber_id if is_limited_barber(user) else payload.barber_id
    if forced_barber_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "barber_id is required")

    appointment, service, barber = await booking_service.create_appointment(
        db,
        service_id=payload.service_id,
        barber_id=forced_barber_id,
        day=payload.date,
        start_time=payload.start_time,
        customer_name=payload.customer_name,
        customer_surname=payload.customer_surname,
        customer_phone=payload.customer_phone,
        customer_email=str(payload.customer_email),
        forced_barber_id=forced_barber_id,
    )
    await notifications_service.on_appointment_created(
        db,
        appointment,
        service,
        barber,
        send_customer_email=payload.send_customer_email,
    )
    return appointment


@router.get("/appointments/by-token/{token}", response_model=AppointmentByTokenOut)
async def get_appointment_by_token(token: str, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    return await booking_service.get_appointment_by_token(db, token)


@router.post("/appointments/cancel", response_model=AppointmentOut)
async def cancel_appointment(payload: CancelAppointmentIn, db: AsyncSession = Depends(get_db)) -> Appointment:
    appointment, service, barber = await booking_service.cancel_appointment_by_token(db, payload.token)
    await notifications_service.on_appointment_cancelled(db, appointment, service, barber)
    return appointment


@router.get("/appointments/{appointment_id}", response_model=AppointmentOut)
async def get_appointment(
    appointment_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Appointment:
    if not await appointments_service.user_can_view_appointment(db, user, appointment_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")
    item = await db.get(Appointment, appointment_id)
    if item is None:
        raise HTTPException(404, "Appointment not found")
    return item


@router.get("/days-off", response_model=list[DayOffOut])
async def get_days_off(
    db: AsyncSession = Depends(get_db),
    barber_id: int | None = Query(default=None, gt=0),
) -> list[DayOff]:
    query = select(DayOff).order_by(DayOff.start_date)
    if barber_id is not None:
        query = query.where(DayOff.barber_id == barber_id)
    return list((await db.scalars(query)).all())


@router.post("/days-off", response_model=DayOffOut, status_code=status.HTTP_201_CREATED)
async def create_day_off(payload: DayOffIn, _: User = Depends(require_shop_manager), db: AsyncSession = Depends(get_db)) -> DayOff:
    if payload.start_date > payload.end_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Start date must be before or equal to end date")
    barber = await db.get(Barber, payload.barber_id)
    if barber is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Barber not found")
    item = DayOff(**payload.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.post("/days-off/mine", response_model=DayOffOut, status_code=status.HTTP_201_CREATED)
async def create_my_day_off(payload: BarberDayOffIn, user: User = Depends(require_barber), db: AsyncSession = Depends(get_db)) -> DayOff:
    if payload.start_date > payload.end_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Start date must be before or equal to end date")
    item = DayOff(
        barber_id=user.barber_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        reason=payload.reason,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/days-off/{day_off_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_day_off(day_off_id: int, _: User = Depends(require_shop_manager), db: AsyncSession = Depends(get_db)) -> None:
    item = await db.get(DayOff, day_off_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Day off not found")
    await db.delete(item)
    await db.commit()


@router.delete("/days-off/mine/{day_off_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_day_off(day_off_id: int, user: User = Depends(require_barber), db: AsyncSession = Depends(get_db)) -> None:
    item = await db.get(DayOff, day_off_id)
    if item is None or item.barber_id != user.barber_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Day off not found")
    await db.delete(item)
    await db.commit()


@router.get("/barber/telegram/status", response_model=TelegramStatusOut)
async def telegram_status(_: User = Depends(require_barber), db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    settings = get_runtime_settings()
    barber = await db.get(Barber, _.barber_id)
    return {"connected": bool(barber and barber.telegram_chat_id), "bot_username": settings.telegram_bot_username}


@router.post("/barber/telegram/link", response_model=TelegramLinkOut)
async def telegram_link(user: User = Depends(require_barber), db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    settings = get_runtime_settings()
    barber = await db.get(Barber, user.barber_id)
    if barber is None:
        raise HTTPException(404, "Barber not found")
    token = await telegram_service.generate_telegram_link_token(db, barber)
    link = f"https://t.me/{settings.telegram_bot_username}?start={token}"
    return {"link": link, "expires_in_minutes": 60}


@router.post("/telegram/webhook")
async def telegram_webhook(request: Request) -> dict[str, bool]:
    settings = get_runtime_settings()
    if settings.telegram_webhook_secret:
        secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
        if secret != settings.telegram_webhook_secret:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid webhook secret")
    update = await request.json()
    await handle_update(update)
    return {"ok": True}


@router.get("/admin/settings", response_model=SettingsOut)
async def admin_get_settings(_: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    items = await get_settings_for_admin(db)
    groups = [SettingsGroupOut(id=group_id, label=label) for group_id, label in GROUP_LABELS.items()]
    return {"groups": groups, "items": items}


@router.put("/admin/settings", response_model=SettingsOut)
async def admin_update_settings(
    payload: SettingsUpdateIn,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    await update_settings(db, payload.settings)
    items = await get_settings_for_admin(db)
    groups = [SettingsGroupOut(id=group_id, label=label) for group_id, label in GROUP_LABELS.items()]
    return {"groups": groups, "items": items}


@router.post("/admin/settings/test-email")
async def admin_test_email(payload: TestEmailIn, _: User = Depends(require_admin)) -> dict[str, str]:
    sent = await email_service.send_test_email(str(payload.to))
    if not sent:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se pudo enviar el email. Revisa la configuración SMTP.")
    return {"status": "ok", "message": f"Email de prueba enviado a {payload.to}"}
