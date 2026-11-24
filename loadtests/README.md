# Load tests (k6)

Pruebas de carga contra la API de Ronal Barber.

**Target por defecto:** `https://ronalbarber504.com`

## Requisitos

- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) instalado localmente **o** Docker
- Credenciales staff válidas en el entorno (smoke/load con auth)
- Servicios, barberos y horarios configurados en el target

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `API_BASE_URL` | `https://ronalbarber504.com` | URL base del sitio/API (sin barra final) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | _(ver `.env.example`)_ | Login admin en smoke test |
| `BARBER_EMAIL` / `BARBER_PASSWORD` | _(ver `.env.example`)_ | Login barbero en load test |
| `SERVICE_ID` / `BARBER_ID` | `1` / `1` | IDs usados en availability/booking |
| `BOOKING_DAYS_AHEAD` | `14` | Días mínimos hacia adelante para buscar slot libre |
| `BOOKING_DATE` / `BOOKING_TIME` | _(auto)_ | Forzar fecha/hora concreta |
| `CONCURRENT_VUS` | `50` | VUs en test de concurrencia |
| `TURNSTILE_TOKEN` | `loadtest` | Token enviado en `POST /api/appointments` (solo válido con claves de prueba always-pass de Cloudflare) |

Copia `.env.example`, rellena credenciales reales y exporta las variables, o pásalas con `-e`:

```powershell
$env:API_BASE_URL = "https://ronalbarber504.com"
$env:ADMIN_EMAIL = "tu-admin@ronalbarber504.com"
$env:ADMIN_PASSWORD = "..."
k6 run loadtests/smoke.js
```

## Escenarios

### Smoke (`smoke.js`)

1 VU, 1 iteración. Comprueba endpoints públicos, login admin, listado de citas y **una** reserva real (201).

```powershell
k6 run loadtests/smoke.js
```

### Load progresivo (`load.js`)

Ramp-up: **10 → 25 → 50 → 100 VUs** (~8 min). Mezcla lecturas públicas, availability y sesiones autenticadas de barbero.

```powershell
k6 run loadtests/load.js
```

### Concurrencia de reservas (`booking-concurrency.js`)

`CONCURRENT_VUS` usuarios intentan reservar **el mismo slot** a la vez.

**Resultado esperado:** exactamente **1× HTTP 201** y **(N−1)× HTTP 409** con `"Appointment slot is no longer available"`.

```powershell
$env:CONCURRENT_VUS = "50"
k6 run loadtests/booking-concurrency.js
```

> `smoke.js` y `booking-concurrency.js` **crean citas reales** en la base de datos del target. En producción conviene cancelarlas después o usar un slot lejano (`BOOKING_DAYS_AHEAD`).
>
> Empieza con `CONCURRENT_VUS` bajo (10–20) y sube si el entorno aguanta.
>
> **Turnstile:** k6 no puede resolver el widget. Para smoke/concurrency de escritura, usa temporalmente las [claves de prueba always-pass](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) en el servidor (`TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`) o el POST de reserva devolverá **403**. `load.js` (solo lecturas + auth) no se ve afectado.

## Ejecución con Docker

```powershell
docker run --rm -i `
  -v "${PWD}/loadtests:/loadtests" `
  -e API_BASE_URL=https://ronalbarber504.com `
  -e ADMIN_EMAIL=tu-admin@ronalbarber504.com `
  -e ADMIN_PASSWORD=... `
  grafana/k6 run /loadtests/smoke.js
```

## Local / otro entorno

```powershell
$env:API_BASE_URL = "http://localhost:8000"
k6 run loadtests/smoke.js
```

Ajusta `SERVICE_ID`, `BARBER_ID` y credenciales según el entorno.

## Métricas y thresholds

| Test | http_req_failed | p95 / p99 | Otros |
|------|-----------------|-----------|-------|
| smoke | `< 1%` | `< 2s` / `< 3s` | checks `> 99%` |
| load | `< 5%` | `< 1.5s` / `< 3s` | checks `> 95%` |
| concurrency | `0%` (201/409 son OK) | `< 3s` / `< 5s` | `booking_success == 1`, `booking_conflict == N−1` |

## Estructura

```
loadtests/
├── smoke.js
├── load.js
├── booking-concurrency.js
├── lib/
│   ├── config.js
│   ├── auth.js
│   ├── booking.js
│   ├── dates.js
│   ├── http.js
│   └── thresholds.js
└── README.md
```
