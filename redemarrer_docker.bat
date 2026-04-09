@echo off
echo Mise a jour de la configuration et redemarrage...
docker compose up -d --remove-orphans
echo Configuration appliquee et containers prets.
pause
