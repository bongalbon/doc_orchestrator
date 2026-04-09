FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend /app/backend
COPY .env /app/.env

WORKDIR /app/backend
RUN python manage.py collectstatic --noinput || true

EXPOSE 8008
CMD ["sh", "-c", "python manage.py migrate && daphne -b 0.0.0.0 -p 8008 orchestrator_backend.asgi:application"]
