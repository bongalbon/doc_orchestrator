#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

echo "=== AI-Doc-Orchestrator (Termux) ==="

# Aller dans le dossier du script (racine projet)
cd "$(dirname "$0")"

echo "[1/4] Vérification Python..."
if ! command -v python >/dev/null 2>&1; then
  echo "Python non trouvé. Installe-le avec: pkg install python -y"
  exit 1
fi

echo "[2/4] Création/activation du venv..."
if [ ! -d ".venv" ]; then
  python -m venv .venv
fi
source .venv/bin/activate

echo "[3/4] Installation des dépendances..."
python -m pip install --upgrade pip wheel setuptools
python -m pip install -r requirements.txt

PORT="${PORT:-8501}"
HOST="${HOST:-0.0.0.0}"

echo "[4/4] Lancement FastAPI sur http://${HOST}:${PORT}"
echo "Ouvre dans le navigateur: http://127.0.0.1:${PORT}"
echo "Ou depuis un autre appareil du réseau: http://<IP_ANDROID>:${PORT}"

exec python -m uvicorn web_app:app --host "${HOST}" --port "${PORT}" --reload
