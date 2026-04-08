# 🤖 AI-Doc-Orchestrator

Plateforme intelligente de gestion documentaire — Compatible **Windows 11** et **Android (Termux)**.

> Orchestrez vos LLMs (Gemini, OpenAI, Ollama), indexez vos documents et générez des courriers, PV et rapports professionnels en quelques clics.

---

## ✨ Fonctionnalités

| Page | Description |
|------|-------------|
| 🏠 Dashboard | Statistiques, statut des connexions LLM |
| 📥 Ingestion | Upload PDF/Word/Images, indexation sémantique (RAG) |
| ✍️ Studio | Génération avec agents IA (Secrétaire / Analyste / Juriste) |
| 📁 Archives | Recherche sémantique, validation, export PDF/DOCX |
| ⚙️ Paramètres | Clés API, URL Ollama, modèle d'embedding |

---

## 🚀 Installation & Lancement

### ✅ Nouveau mode recommandé : FastAPI UI

```powershell
cd C:\apps_ctd\doc_orchestrator
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn web_app:app --reload --host 127.0.0.1 --port 8501
```

Puis ouvrir [http://localhost:8501](http://localhost:8501)

> Base produit actuelle : `web_app.py` (FastAPI + UI web).

#### Lancement rapide Windows (script)

```powershell
cd C:\apps_ctd\doc_orchestrator
lancer_fastapi.bat
```

### 🪟 Windows 11 (PowerShell)

#### Prérequis
- Python 3.10+ : https://python.org/downloads
- (Optionnel) Ollama : https://ollama.ai

#### 1. Créer et activer l'environnement virtuel

```powershell
cd C:\apps_ctd\doc_orchestrator
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

> Si erreur de politique : `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

#### 2. Installer les dépendances

```powershell
pip install --upgrade pip
pip install -r requirements.txt
```

#### 3. Lancer l'application

```powershell
uvicorn web_app:app --reload --host 127.0.0.1 --port 8501
```

L'application s'ouvre automatiquement sur `http://localhost:8501`

#### 4. (Optionnel) Lancer Ollama avec un modèle local

```powershell
# Dans un autre terminal PowerShell
ollama pull mistral
ollama serve
```

---

### 🤖 Android — Termux (sans root)

#### Prérequis

```bash
# Mettre à jour Termux
pkg update && pkg upgrade -y

# Installer Python et les dépendances système
pkg install python python-pip libxml2 libxslt clang -y
```

#### 1. Cloner / copier le projet

```bash
mkdir -p ~/doc_orchestrator
cd ~/doc_orchestrator
# Copier les fichiers du projet ici
```

#### 2. Créer l'environnement virtuel

```bash
python -m venv .venv
source .venv/bin/activate
```

#### 3. Installer les dépendances

> ⚠️ Sur Termux, `sentence-transformers` et `chromadb` peuvent nécessiter quelques minutes.

```bash
pip install --upgrade pip wheel setuptools
pip install -r requirements.txt
```

#### 4. Lancer l'application

```bash
uvicorn web_app:app --reload --host 0.0.0.0 --port 8501
```

#### Lancement rapide Termux (script)

```bash
cd ~/doc_orchestrator
chmod +x lancer_termux.sh
./lancer_termux.sh
```

Variables optionnelles :

```bash
HOST=0.0.0.0 PORT=8600 ./lancer_termux.sh
```

Accédez à l'app depuis le navigateur Termux ou depuis votre PC sur le réseau local :
`http://[IP_ANDROID]:8501`

#### Trouver l'IP Android

```bash
ip addr show wlan0 | grep 'inet '
```

---

## 🔑 Configuration des Clés API

**Ne jamais mettre les clés directement dans le terminal.**

1. Lancez l'application
2. Allez dans **⚙️ Paramètres** → **🔑 Clés API**
3. Saisissez votre clé Gemini et/ou OpenAI
4. Cliquez **💾 Sauvegarder**

Les clés sont stockées dans le fichier `.env` local (listé dans `.gitignore`).

### Obtenir une clé Gemini gratuite

1. Rendez-vous sur https://aistudio.google.com/app/apikey
2. Créez un projet Google Cloud (gratuit)
3. Générez une clé API
4. Copiez-la dans l'application

---

## 📁 Structure du projet

```
doc_orchestrator/
├── web_app.py          # API FastAPI + interface web (point d'entrée)
├── lancer_fastapi.bat  # Lancement rapide FastAPI (Windows)
├── lancer_termux.sh    # Lancement rapide FastAPI (Termux)
├── web/
│   ├── templates/
│   │   └── index.html  # UI web
│   └── static/
│       ├── app.js      # Logique front
│       └── styles.css  # Styles UI
├── llm_handler.py      # Orchestrateur LiteLLM
├── database.py         # SQLite + ChromaDB (RAG)
├── doc_processor.py    # Extraction PDF/DOCX/Images
├── doc_generator.py    # Génération PDF/DOCX depuis Markdown
├── config.py           # Configuration centralisée
├── requirements.txt    # Dépendances Python
├── .env                # Clés API (auto-généré, ne pas committer)
├── .gitignore
├── data/
│   ├── documents.db    # Base SQLite
│   └── chroma_db/      # Vecteurs ChromaDB
├── uploads/            # Fichiers uploadés
└── exports/            # Documents générés
```

---

## 🦙 Mode Offline avec Ollama

```bash
# Télécharger un modèle (à faire une seule fois)
ollama pull mistral          # 4GB — bon équilibre
ollama pull llama3.2:3b      # 2GB — rapide, léger
ollama pull phi3:mini        # 2.3GB — excellent pour les docs

# Démarrer Ollama
ollama serve
```

L'application détecte automatiquement Ollama et affiche les modèles disponibles.

---

## 🧠 Modèles d'Embedding recommandés

| Modèle | Taille | Langues | Usage |
|--------|--------|---------|-------|
| `all-MiniLM-L6-v2` | 90 MB | EN | Rapide, Termux |
| `all-MiniLM-L12-v2` | 130 MB | EN | Bon équilibre |
| `paraphrase-multilingual-MiniLM-L12-v2` | 470 MB | FR/EN/AR/+ | **Recommandé pour le français** |

Configurable dans **⚙️ Paramètres** → **🧠 Embeddings**.

---

## ⚠️ Dépannage

### Erreur `ExecutionPolicy` (Windows)
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Erreur `chromadb` sur Termux
```bash
pip install chromadb --no-build-isolation
```

### Erreur `sentence-transformers` sur Termux
```bash
pkg install openblas -y
pip install sentence-transformers --no-deps
pip install transformers torch tqdm numpy scikit-learn scipy huggingface-hub
```

### Port 8501 déjà utilisé
```bash
uvicorn web_app:app --reload --host 0.0.0.0 --port 8502
```

### Réinitialiser la base de données
```bash
rm -rf data/
python -c "from database import init_database; init_database(); print('OK')"
```

---

## 📄 Licence

Usage personnel et professionnel libre. Attribution appréciée.
