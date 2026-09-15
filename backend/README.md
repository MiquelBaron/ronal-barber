# Backend

FastAPI service for Ronal Barber. The application is intentionally small in Phase 1; domain models, migrations and public APIs arrive in later phases.

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Health check: `GET http://localhost:8000/api/health`
