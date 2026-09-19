# Load tests (k6)

Pruebas de carga para la API de Ronal Barber antes de producción.

## Requisitos

- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) instalado localmente **o** Docker
- API en marcha con datos seed (servicios, barberos, horarios)

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `API_BASE_URL` | `http://localhost:8000` | URL base del backend |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | credenciales dev | Login admin en smoke test |
| `BARBER_EMAIL` / `BARBER_PASSWORD` | credenciales dev | Login barbero en load test |
| `SERVICE_ID` / `BARBER_ID` | `1` / `1` | IDs usados en availability/booking |
| `BOOKING_DAYS_AHEAD` | `14` | Días mínimos hacia adelante para buscar slot libre |
| `BOOKING_DATE` / `BOOKING_TIME` | _(auto)_ | Forzar fecha/hora concreta |
| `CONCURRENT_VUS` | `50` | VUs en test de concurrencia |

Copia `.env.example` y exporta las variables antes de ejecutar, o pásalas con `-e`:

```powershell
$env:API_BASE_URL = "http://localhost:8000"
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

> El test crea una cita real en la base de datos. Ejecútalo contra dev/staging, no producción.
>
> En dev con un solo worker Uvicorn, valores muy altos de `CONCURRENT_VUS` pueden provocar `connection refused` transitorios. Empieza con 10–20 VUs y sube en staging.

## Ejecución con Docker

```powershell
docker run --rm -i `
  -v "${PWD}/loadtests:/loadtests" `
  -e API_BASE_URL=http://host.docker.internal:8000 `
  grafana/k6 run /loadtests/smoke.js
```

En Linux/macOS sustituye `host.docker.internal` por la IP del host si hace falta.

## Staging

Apunta `API_BASE_URL` al backend de staging (sin barra final):

```powershell
$env:API_BASE_URL = "https://staging.tudominio.com"
$env:ADMIN_EMAIL = "tu-admin@staging.com"
$env:ADMIN_PASSWORD = "..."
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
