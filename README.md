# AI Doc Orchestrator V2

Stack cible migree et nettoyee:

- Backend: Django + DRF + Celery + Redis + Channels (WebSocket)
- Frontend: Next.js (React)
- Dev DB: SQLite
- Prod DB: PostgreSQL (Docker)

## V2 production-grade

- File de jobs distribuee: Celery + Redis
- Live updates sans polling: WebSocket (`/ws/activity/`)
- Delegation intelligente:
  - agent principal
  - sous-agents illimites
  - scoring simple par specialite
- Controle de taches:
  - create
  - cancel
  - retry
  - timeout par tache
- Auth/roles:
  - token auth DRF
  - groupes `manager`, `operator`, `viewer`
- Audit logs:
  - creation agent
  - creation task
  - cancel
  - retry

## Arborescence

```text
doc_orchestrator/
├── backend/
│   ├── manage.py
│   ├── Dockerfile
│   ├── agents/
│   ├── tasking/
│   └── orchestrator_backend/
├── frontend/
│   ├── Dockerfile
│   └── src/app/
├── docker-compose.yml
├── requirements.txt
└── lancer_django_next.bat
```

## API

Base: `http://127.0.0.1:8000/api`

Auth:

- `POST /api/auth/register/`
- `POST /api/auth/login/`

Agents:

- `GET /api/agents/`
- `POST /api/agents/`

Tasks:

- `GET /api/tasks/`
- `POST /api/tasks/`
- `GET /api/tasks/activity/`
- `POST /api/tasks/{id}/cancel/`
- `POST /api/tasks/{id}/retry/`

WebSocket:

- `ws://127.0.0.1:8000/ws/activity/`

## Lancement local

Prerequis:

- Python 3.12+
- Node 22+
- Redis local (ou Docker)

### Backend

```powershell
cd C:\apps_ctd\doc_orchestrator
pip install -r requirements.txt
cd backend
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

### Worker Celery (autre terminal)

```powershell
cd C:\apps_ctd\doc_orchestrator\backend
python -m celery -A orchestrator_backend worker -l info
```

### Frontend (autre terminal)

```powershell
cd C:\apps_ctd\doc_orchestrator\frontend
npm install
npm run dev
```

## Docker production

```powershell
cd C:\apps_ctd\doc_orchestrator
docker compose up --build
```

Services:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api
- Redis: localhost:6379
- PostgreSQL: localhost:5432
