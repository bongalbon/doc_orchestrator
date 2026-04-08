"""
config.py — Gestion centralisée de la configuration et des clés API.

Charge les variables depuis le fichier .env et expose des fonctions
pour les lire et les mettre à jour dynamiquement depuis l'UI Streamlit.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Chemin absolu vers le .env à la racine du projet
BASE_DIR = Path(__file__).parent.resolve()
ENV_FILE = BASE_DIR / ".env"
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = BASE_DIR / "uploads"
EXPORTS_DIR = BASE_DIR / "exports"
CHROMA_DIR = DATA_DIR / "chroma_db"
DB_PATH = DATA_DIR / "documents.db"

# Créer les dossiers nécessaires au démarrage
for d in [DATA_DIR, UPLOADS_DIR, EXPORTS_DIR, CHROMA_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Charger les variables d'environnement
load_dotenv(ENV_FILE)


def get_config() -> dict:
    """Retourne la configuration courante depuis les variables d'environnement."""
    return {
        "GEMINI_API_KEY": os.getenv("GEMINI_API_KEY", ""),
        "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY", ""),
        "OLLAMA_BASE_URL": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        "DEFAULT_PROVIDER": os.getenv("DEFAULT_PROVIDER", "gemini"),
        "DEFAULT_MODEL": os.getenv("DEFAULT_MODEL", "gemini/gemini-2.5-flash-lite-preview-06-17"),
        "CUSTOM_MODEL": os.getenv("CUSTOM_MODEL", ""),
        "EMBED_MODEL": os.getenv("EMBED_MODEL", "all-MiniLM-L6-v2"),
        "APP_LANGUAGE": os.getenv("APP_LANGUAGE", "fr"),
    }


def save_config(updates: dict) -> bool:
    """
    Sauvegarde les paires clé=valeur dans le fichier .env.
    Met à jour les variables existantes ou les ajoute si absentes.
    Recharge ensuite les variables dans l'environnement courant.
    
    Args:
        updates: dict de clé → valeur à persister.
    
    Returns:
        True si la sauvegarde réussit.
    """
    # Lire le contenu actuel du .env
    existing_lines: list[str] = []
    if ENV_FILE.exists():
        existing_lines = ENV_FILE.read_text(encoding="utf-8").splitlines()

    # Construire un dict des lignes existantes
    env_dict: dict[str, str] = {}
    for line in existing_lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key, _, val = stripped.partition("=")
            env_dict[key.strip()] = val.strip()

    # Appliquer les mises à jour
    env_dict.update({k: v for k, v in updates.items() if v is not None})

    # Réécrire le fichier .env proprement
    lines = [f"{k}={v}" for k, v in env_dict.items()]
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Recharger dans l'environnement courant
    load_dotenv(ENV_FILE, override=True)

    # Mettre à jour os.environ directement pour la session en cours
    for k, v in updates.items():
        if v:
            os.environ[k] = v

    return True


def get_available_models() -> dict:
    """
    Retourne les modèles disponibles selon les clés configurées.
    Utilisé pour peupler les selectbox de l'UI.
    """
    models = {}
    cfg = get_config()

    if cfg["GEMINI_API_KEY"]:
        models["🌟 Gemini 1.5 Flash (gratuit)"] = "gemini/gemini-1.5-flash"
        models["🌟 Gemini 1.5 Pro"] = "gemini/gemini-1.5-pro"
        models["🌟 Gemini 2.0 Flash (payant)"] = "gemini/gemini-2.0-flash"

    if cfg["OPENAI_API_KEY"]:
        models["🤖 GPT-4o Mini"] = "gpt-4o-mini"
        models["🤖 GPT-4o"] = "gpt-4o"
        models["🤖 GPT-3.5 Turbo"] = "gpt-3.5-turbo"

    if not models:
        models["⚠️ Aucun modèle cloud configuré"] = None

    return models
