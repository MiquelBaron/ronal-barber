# Ronal Barber

Web premium para barbería masculina: reservas online, emails de confirmación/cancelación, recordatorios nocturnos del día siguiente, bot Telegram para barberos y panel de gestión.

## Requisitos

- Docker Desktop (recomendado)
- Node.js 22+ y Python 3.13+ (desarrollo local sin Docker)

## Entornos Docker

### Development

Cómodo para desarrollar: hot reload, Vite dev server, seed de usuarios de prueba, PostgreSQL en `localhost:5432`.

```powershell
copy .env.example .env
docker compose -f docker-compose.dev.yml up --build
```

Equivalente (compatibilidad):

```powershell
docker compose up --build
```

Servicios:

- Frontend (Vite): http://localhost:5173
- Backend (Uvicorn `--reload`): http://localhost:8000
- PostgreSQL: `localhost:5432`

Usuarios de prueba (se recrean/resetean en cada init del backend):

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| `admin@ronalbarber.com` | `admin` | Admin |
| `barber1@ronalbarber.com` | `barber1` | Barbero jefe |
| `barber2@ronalbarber.com` | `barber2` | Barbero |

### Production

Stack endurecido: frontend compilado + Nginx, Uvicorn sin reload, PostgreSQL solo en red interna, JWT obligatorio.

```powershell
copy .env.prod.example .env
# Edita .env con secrets reales (JWT, POSTGRES_PASSWORD, URLs, bootstrap admin)
docker compose -f docker-compose.prod.yml up -d --build
```

Servicios:

- Frontend (Nginx): http://localhost (puerto `HTTP_PORT`, default 80)
- Backend: solo red interna Docker (proxy vía Nginx en `/api` y `/uploads`)
- PostgreSQL: **no** expuesto al host

**Primer arranque en production**

1. Define `JWT_SECRET` (≥32 caracteres, aleatorio).
2. Define `POSTGRES_PASSWORD`, `FRONTEND_ORIGIN`, `PUBLIC_BASE_URL`.
3. Si la BD está vacía, define `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` (≥12 caracteres).
4. Arranca el stack. Tras crear el admin inicial, puedes vaciar las variables `BOOTSTRAP_*`.
5. Reiniciar contenedores **no** resetea passwords existentes.

Generar JWT secret (PowerShell):

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

## Funcionalidades

### Clientes (público)

- Reserva online en `/reservar`
- Email de confirmación con enlace de cancelación (`/cancelar/{token}`)
- Recordatorio automático cada noche (21:00 por defecto) para las citas del día siguiente (si SMTP configurado)

### Staff (`/admin`)

- Panel según rol: admin, barbero jefe, barbero
- CRUD servicios, barberos, horarios, días libres (según permisos)
- Gestión de citas, Telegram, configuración (solo admin)

## Configuración del sistema (panel admin)

Parámetros operativos en **`/admin/settings`** (solo admin). Los cambios se aplican al instante. Solo `DATABASE_URL` permanece en variables de entorno.

## Desarrollo local (sin Docker)

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

## Tests y calidad

```powershell
cd backend
pytest

cd frontend
npm run typecheck
npm run build
```

## Migraciones Alembic

```powershell
cd backend
alembic upgrade head
```

## Arquitectura

| Ruta | Descripción |
|------|-------------|
| `docker-compose.dev.yml` | Development |
| `docker-compose.prod.yml` | Production |
| `backend/Dockerfile.dev` / `Dockerfile.prod` | Imágenes backend |
| `frontend/Dockerfile.dev` / `Dockerfile.prod` | Imágenes frontend |
| `frontend/nginx.conf` | Proxy Nginx production |
| `backend/app/core/production.py` | Validación arranque production |
