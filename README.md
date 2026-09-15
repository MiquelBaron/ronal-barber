# Ronal Barber

Web premium para barbería masculina: reservas online, emails de confirmación/cancelación, recordatorios 24h, bot Telegram para barberos y panel de gestión.

## Requisitos

- Node.js 22+
- Python 3.12+
- Docker Desktop (opcional)

## Inicio rápido con Docker

```powershell
copy .env.example .env
docker compose up --build
```

Servicios:

- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- Health: http://localhost:8000/api/health
- Admin: http://localhost:5173/admin/login
- Barbero: http://localhost:5173/admin/login → redirige a `/mis-citas`

Usuarios base (creados al iniciar la BD):

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| `admin@ronalbarber.com` | `admin` | Admin |
| `barber1@ronalbarber.com` | `barber1` | Barbero |
| `barber2@ronalbarber.com` | `barber2` | Barbero |

## Funcionalidades

### Clientes (público)

- Reserva online en `/reservar`
- Email de confirmación con enlace de cancelación (`/cancelar/{token}`)
- Recordatorio automático ~24h antes (si SMTP configurado)

### Barberos (`/mis-citas`)

- Agenda con calendario
- Crear citas manuales (walk-in)
- Vincular Telegram para avisos de nuevas citas/cancelaciones

### Admin (`/admin`)

- CRUD servicios, barberos, horarios, días libres
- Gestión de citas y usuarios
- Crear citas manuales

## Configuración del sistema (panel admin)

Todos los parámetros operativos se gestionan desde **`/admin/settings`** (solo admin), estilo Odoo:

- General: URLs, CORS, nombre app
- Seguridad: JWT, contraseñas por defecto
- Email SMTP + botón de prueba
- Telegram: token, username, webhook
- Scheduler: recordatorios 24h

Los cambios se aplican **al instante** sin redeploy. Solo `DATABASE_URL` permanece en `.env` (requiere reinicio del backend).

Al primer arranque, los valores de `.env` se importan automáticamente a la base de datos como valores iniciales.

## Bot Telegram

1. Crea un bot con [@BotFather](https://t.me/BotFather)
2. Añade `TELEGRAM_BOT_TOKEN` y `TELEGRAM_BOT_USERNAME` en `.env`
3. El barbero entra en `/mis-citas` → pestaña Telegram → genera enlace
4. Abre el enlace en Telegram y pulsa Start

En desarrollo el backend usa long polling. En producción configura webhook con `TELEGRAM_WEBHOOK_SECRET`.

## Scheduler (recordatorios)

El job corre cada 15 minutos en el contenedor backend. En producción con múltiples réplicas, activa `SCHEDULER_ENABLED=true` solo en una instancia.

## Desarrollo local

Backend:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m app.db.init
uvicorn app.main:app --reload --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Tests backend:

```powershell
cd backend
pytest
```

Checks frontend:

```powershell
cd frontend
npm run typecheck
npm run lint
npm run build
```

## Migraciones Alembic

```powershell
cd backend
alembic upgrade head
```

## Arquitectura

- `frontend/src` — React SPA (Vite)
- `backend/app/services` — lógica de negocio (booking, email, telegram, notifications)
- `backend/app/templates/email` — plantillas Jinja2
- `backend/alembic` — migraciones PostgreSQL
