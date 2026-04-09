@echo off
echo 1. Arret des containers et nettoyage...
docker compose down

echo.
echo 2. Mise a jour de la configuration et demarrage...
docker compose up -d

echo.
echo 3. Application des migrations Django...
docker compose exec backend python manage.py makemigrations tasking
docker compose exec backend python manage.py migrate tasking

echo.
echo 4. Redemarrage des services...
docker compose restart

echo.
echo TOUT EST PRET ! 
echo Si le frontend a toujours un probleme de permission :
echo Lancez 'docker compose down -v' puis relancez ce script.
echo Verifiez l'interface sur http://localhost:3001
pause
