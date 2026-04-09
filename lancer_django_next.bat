@echo off
setlocal

echo [1/3] Demarrage backend Django...
start "backend-django" cmd /k "cd /d %~dp0backend && python manage.py migrate && python -m daphne -b 0.0.0.0 -p 8000 orchestrator_backend.asgi:application"

echo [2/3] Demarrage worker Celery...
start "worker-celery" cmd /k "cd /d %~dp0backend && python -m celery -A orchestrator_backend worker -l info"

echo [3/3] Demarrage frontend Next.js...
start "frontend-next" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Application disponible sur:
echo - Frontend: http://127.0.0.1:3000
echo - Backend API: http://127.0.0.1:8000/api
