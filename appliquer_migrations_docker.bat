@echo off
echo Application des migrations...
docker compose exec backend python manage.py makemigrations tasking
docker compose exec backend python manage.py migrate tasking
echo Termine.
pause
