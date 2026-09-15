import logging
from datetime import date, time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.services.settings_store import get_runtime_settings
from app.models.models import Appointment, Barber, Service

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "email"
env = Environment(loader=FileSystemLoader(TEMPLATE_DIR), autoescape=select_autoescape(["html", "xml"]))


def _format_date(day: date) -> str:
    return day.strftime("%d/%m/%Y")


def _format_time(value: time) -> str:
    return value.strftime("%H:%M")


def _render(template_name: str, **context: object) -> tuple[str, str]:
    settings = get_runtime_settings()
    context.setdefault("shop_name", settings.app_name)
    context.setdefault("public_base_url", settings.public_base_url)
    html = env.get_template(f"{template_name}.html").render(**context)
    text = env.get_template(f"{template_name}.txt").render(**context)
    return html, text


async def _send_email(to: str, subject: str, html: str, text: str) -> bool:
    settings = get_runtime_settings()
    if not settings.email_enabled:
        logger.info("Email disabled; would send to %s: %s", to, subject)
        return False

    message = MIMEMultipart("alternative")
    message["From"] = settings.smtp_from
    message["To"] = to
    message["Subject"] = subject
    message.attach(MIMEText(text, "plain", "utf-8"))
    message.attach(MIMEText(html, "html", "utf-8"))

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user or None,
            password=settings.smtp_password or None,
            start_tls=settings.smtp_use_tls,
        )
        logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False


def _cancel_url(token: str) -> str:
    return f"{get_runtime_settings().public_base_url}/cancelar/{token}"


async def send_test_email(to: str) -> bool:
    settings = get_runtime_settings()
    html = f"<p>Email de prueba desde <strong>{settings.app_name}</strong>.</p><p>SMTP configurado correctamente.</p>"
    text = f"Email de prueba desde {settings.app_name}. SMTP configurado correctamente."
    return await _send_email(to, f"Prueba SMTP — {settings.app_name}", html, text)


async def send_booking_confirmation(
    appointment: Appointment,
    service: Service,
    barber: Barber,
) -> bool:
    if not appointment.cancel_token:
        return False

    html, text = _render(
        "booking_confirmation",
        customer_name=appointment.customer_name,
        service_name=service.name,
        barber_name=barber.name,
        date=_format_date(appointment.date),
        start_time=_format_time(appointment.start_time),
        end_time=_format_time(appointment.end_time),
        price=str(appointment.price),
        cancel_url=_cancel_url(appointment.cancel_token),
    )
    return await _send_email(
        appointment.customer_email,
        f"Confirmación de cita — Ronal Barber",
        html,
        text,
    )


async def send_cancellation_confirmation(appointment: Appointment, service: Service | None) -> bool:
    html, text = _render(
        "cancellation_confirmation",
        customer_name=appointment.customer_name,
        service_name=service.name if service else "Servicio",
        date=_format_date(appointment.date),
        start_time=_format_time(appointment.start_time),
    )
    return await _send_email(
        appointment.customer_email,
        f"Cita cancelada — Ronal Barber",
        html,
        text,
    )


async def send_reminder_24h(
    appointment: Appointment,
    service: Service,
    barber: Barber | None,
) -> bool:
    if not appointment.cancel_token:
        return False

    html, text = _render(
        "reminder_24h",
        customer_name=appointment.customer_name,
        service_name=service.name,
        barber_name=barber.name if barber else "Tu barbero",
        date=_format_date(appointment.date),
        start_time=_format_time(appointment.start_time),
        cancel_url=_cancel_url(appointment.cancel_token),
    )
    return await _send_email(
        appointment.customer_email,
        f"Recordatorio: tu cita mañana — Ronal Barber",
        html,
        text,
    )
