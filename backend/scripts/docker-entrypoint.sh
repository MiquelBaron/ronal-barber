#!/bin/sh
set -e

MODE="${1:-development}"

python -m app.db.init

if [ "$MODE" = "production" ]; then
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
