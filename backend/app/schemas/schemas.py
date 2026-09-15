from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class ServiceIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=2000)
    price: Decimal = Field(gt=0, le=1000)
    duration_minutes: int = Field(gt=0, le=480)
    active: bool = True


class ServiceOut(ServiceIn):
    id: int
    model_config = ConfigDict(from_attributes=True)


class BarberIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=2000)
    specialties: str = Field(default="", max_length=1000)
    image_url: str = Field(default="", max_length=500)
    active: bool = True


class BarberOut(BarberIn):
    id: int
    model_config = ConfigDict(from_attributes=True)


class AppointmentIn(BaseModel):
    service_id: int = Field(gt=0)
    barber_id: int | None = Field(default=None, gt=0)
    date: date
    start_time: time
    customer_name: str = Field(min_length=2, max_length=80)
    customer_surname: str = Field(min_length=2, max_length=120)
    customer_phone: str = Field(min_length=7, max_length=40)
    customer_email: EmailStr
    privacy_accepted: bool = True

    @field_validator("privacy_accepted")
    @classmethod
    def privacy_required(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Privacy policy must be accepted")
        return value


class ManualAppointmentIn(BaseModel):
    service_id: int = Field(gt=0)
    barber_id: int | None = Field(default=None, gt=0)
    date: date
    start_time: time
    customer_name: str = Field(min_length=2, max_length=80)
    customer_surname: str = Field(min_length=2, max_length=120)
    customer_phone: str = Field(min_length=7, max_length=40)
    customer_email: EmailStr
    send_customer_email: bool = True


class AppointmentOut(BaseModel):
    id: int
    service_id: int
    barber_id: int | None
    date: date
    start_time: time
    end_time: time
    price: Decimal
    status: str
    payment_status: str
    customer_email: EmailStr
    model_config = ConfigDict(from_attributes=True)


class AppointmentByTokenOut(BaseModel):
    date: date
    start_time: time
    end_time: time
    status: str
    service_name: str
    barber_name: str | None
    customer_name: str


class CancelAppointmentIn(BaseModel):
    token: str = Field(min_length=16, max_length=64)


class HoursIn(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    active: bool = True


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=4, max_length=128)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    role: str
    barber_id: int | None = None
    barber_name: str | None = None
    model_config = ConfigDict(from_attributes=True)


class UserIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(default="barber", pattern="^(admin|barber|admin_barber)$")
    barber_id: int | None = Field(default=None, gt=0)


class MyAppointmentOut(AppointmentOut):
    customer_name: str
    customer_surname: str
    customer_phone: str
    service_name: str


class AdminAppointmentOut(MyAppointmentOut):
    barber_id: int | None
    payment_status: str


class DayOffIn(BaseModel):
    barber_id: int = Field(gt=0)
    start_date: date
    end_date: date
    reason: str = ""


class BarberDayOffIn(BaseModel):
    start_date: date
    end_date: date
    reason: str = ""


class DayOffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    barber_id: int
    start_date: date
    end_date: date
    reason: str
    created_at: datetime


class TelegramLinkOut(BaseModel):
    link: str
    expires_in_minutes: int = 60


class TelegramStatusOut(BaseModel):
    connected: bool
    bot_username: str


class SettingItemOut(BaseModel):
    key: str
    label: str
    group: str
    type: str
    value: str
    description: str = ""
    is_secret: bool = False
    has_value: bool = False
    options: list[str] | None = None


class SettingsGroupOut(BaseModel):
    id: str
    label: str


class SettingsOut(BaseModel):
    groups: list[SettingsGroupOut]
    items: list[SettingItemOut]
    bootstrap_note: str = "DATABASE_URL solo se configura en .env / Docker (requiere reinicio)."


class SettingsUpdateIn(BaseModel):
    settings: dict[str, str]


class TestEmailIn(BaseModel):
    to: EmailStr
