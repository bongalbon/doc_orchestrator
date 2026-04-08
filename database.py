"""
database.py — Couche de persistance : SQLite (métadonnées) + ChromaDB (RAG vectoriel).

SQLite gère les métadonnées des documents et les archives.
ChromaDB gère les embeddings pour la recherche sémantique (RAG).
"""

import sqlite3
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

from config import DB_PATH, CHROMA_DIR, get_config

# ---------------------------------------------------------------------------
# Modèle d'embedding (chargé une seule fois)
# ---------------------------------------------------------------------------
_embed_model: Optional[SentenceTransformer] = None


def get_embed_model() -> SentenceTransformer:
    """Charge le modèle sentence-transformers en lazy-loading."""
    global _embed_model
    if _embed_model is None:
        model_name = get_config()["EMBED_MODEL"]
        _embed_model = SentenceTransformer(model_name)
    return _embed_model


# ---------------------------------------------------------------------------
# ChromaDB — Client et collection
# ---------------------------------------------------------------------------
_chroma_client: Optional[chromadb.PersistentClient] = None
_chroma_collection = None


def get_chroma_collection():
    """Retourne la collection ChromaDB (crée si absente)."""
    global _chroma_client, _chroma_collection
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(
            path=str(CHROMA_DIR),
            settings=Settings(anonymized_telemetry=False),
        )
    if _chroma_collection is None:
        _chroma_collection = _chroma_client.get_or_create_collection(
            name="doc_collection",
            metadata={"hnsw:space": "cosine"},
        )
    return _chroma_collection


# ---------------------------------------------------------------------------
# SQLite — Initialisation
# ---------------------------------------------------------------------------

def get_db_connection() -> sqlite3.Connection:
    """Retourne une connexion SQLite avec row_factory configuré."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    """Crée les tables SQLite si elles n'existent pas."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS documents (
            id          TEXT PRIMARY KEY,
            nom         TEXT NOT NULL,
            type_fichier TEXT NOT NULL,
            chemin      TEXT NOT NULL,
            resume      TEXT,
            nb_pages    INTEGER DEFAULT 0,
            langue      TEXT DEFAULT 'fr',
            tags        TEXT DEFAULT '[]',
            taille_kb   REAL DEFAULT 0,
            date_ajout  TEXT NOT NULL,
            indexe      INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS archives (
            id              TEXT PRIMARY KEY,
            type_doc        TEXT NOT NULL,
            titre           TEXT NOT NULL,
            contenu_md      TEXT NOT NULL,
            agent_utilise   TEXT,
            modele_utilise  TEXT,
            docs_sources    TEXT DEFAULT '[]',
            statut          TEXT DEFAULT 'brouillon',
            date_creation   TEXT NOT NULL,
            date_validation TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(date_ajout);
        CREATE INDEX IF NOT EXISTS idx_archives_date ON archives(date_creation);
        CREATE INDEX IF NOT EXISTS idx_archives_statut ON archives(statut);
    """)

    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# SQLite — Documents
# ---------------------------------------------------------------------------

def add_document(nom: str, type_fichier: str, chemin: str,
                 resume: str = "", nb_pages: int = 0,
                 langue: str = "fr", tags: list = None,
                 taille_kb: float = 0) -> str:
    """Insère un nouveau document et retourne son ID."""
    doc_id = str(uuid.uuid4())
    conn = get_db_connection()
    conn.execute(
        """INSERT INTO documents
           (id, nom, type_fichier, chemin, resume, nb_pages, langue, tags, taille_kb, date_ajout, indexe)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)""",
        (doc_id, nom, type_fichier, chemin,
         resume, nb_pages, langue,
         json.dumps(tags or []), taille_kb,
         datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()
    return doc_id


def get_all_documents() -> list[dict]:
    """Retourne tous les documents triés par date décroissante."""
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT * FROM documents ORDER BY date_ajout DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_document(doc_id: str) -> Optional[dict]:
    """Retourne un document par son ID."""
    conn = get_db_connection()
    row = conn.execute(
        "SELECT * FROM documents WHERE id = ?", (doc_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def mark_document_indexed(doc_id: str):
    """Marque un document comme indexé dans ChromaDB."""
    conn = get_db_connection()
    conn.execute("UPDATE documents SET indexe = 1 WHERE id = ?", (doc_id,))
    conn.commit()
    conn.close()


def delete_document(doc_id: str):
    """Supprime un document de SQLite et de ChromaDB."""
    conn = get_db_connection()
    conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    conn.close()
    # Supprimer aussi de ChromaDB
    try:
        col = get_chroma_collection()
        col.delete(where={"doc_id": doc_id})
    except Exception:
        pass


def get_stats() -> dict:
    """Retourne les statistiques globales de la base."""
    conn = get_db_connection()
    nb_docs = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    nb_archives = conn.execute("SELECT COUNT(*) FROM archives").fetchone()[0]
    nb_valides = conn.execute(
        "SELECT COUNT(*) FROM archives WHERE statut = 'validé'"
    ).fetchone()[0]
    nb_brouillons = conn.execute(
        "SELECT COUNT(*) FROM archives WHERE statut = 'brouillon'"
    ).fetchone()[0]
    taille_totale = conn.execute(
        "SELECT COALESCE(SUM(taille_kb), 0) FROM documents"
    ).fetchone()[0]
    types = conn.execute(
        "SELECT type_fichier, COUNT(*) as nb FROM documents GROUP BY type_fichier"
    ).fetchall()
    conn.close()

    return {
        "nb_documents": nb_docs,
        "nb_archives": nb_archives,
        "nb_valides": nb_valides,
        "nb_brouillons": nb_brouillons,
        "taille_totale_kb": round(taille_totale, 2),
        "types": {r["type_fichier"]: r["nb"] for r in types},
    }


# ---------------------------------------------------------------------------
# SQLite — Archives
# ---------------------------------------------------------------------------

def add_archive(type_doc: str, titre: str, contenu_md: str,
                agent_utilise: str = "", modele_utilise: str = "",
                docs_sources: list = None) -> str:
    """Insère un document généré dans les archives."""
    arch_id = str(uuid.uuid4())
    conn = get_db_connection()
    conn.execute(
        """INSERT INTO archives
           (id, type_doc, titre, contenu_md, agent_utilise, modele_utilise,
            docs_sources, statut, date_creation)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'brouillon', ?)""",
        (arch_id, type_doc, titre, contenu_md,
         agent_utilise, modele_utilise,
         json.dumps(docs_sources or []),
         datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()
    return arch_id


def get_all_archives(statut: str = None) -> list[dict]:
    """Retourne les archives, filtrées par statut si précisé."""
    conn = get_db_connection()
    if statut:
        rows = conn.execute(
            "SELECT * FROM archives WHERE statut = ? ORDER BY date_creation DESC",
            (statut,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM archives ORDER BY date_creation DESC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_archive(arch_id: str) -> Optional[dict]:
    """Retourne une archive par son ID."""
    conn = get_db_connection()
    row = conn.execute(
        "SELECT * FROM archives WHERE id = ?", (arch_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def validate_archive(arch_id: str):
    """Passe une archive au statut 'validé'."""
    conn = get_db_connection()
    conn.execute(
        "UPDATE archives SET statut = 'validé', date_validation = ? WHERE id = ?",
        (datetime.now().isoformat(), arch_id)
    )
    conn.commit()
    conn.close()


def delete_archive(arch_id: str):
    """Supprime une archive."""
    conn = get_db_connection()
    conn.execute("DELETE FROM archives WHERE id = ?", (arch_id,))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# ChromaDB — Indexation et recherche sémantique
# ---------------------------------------------------------------------------

def index_document_chunks(doc_id: str, doc_name: str,
                           chunks: list[str], metadatas: list[dict] = None):
    """
    Indexe des chunks de texte dans ChromaDB avec leurs embeddings.
    
    Args:
        doc_id: ID du document source (SQLite)
        doc_name: Nom du fichier
        chunks: Liste de segments de texte
        metadatas: Métadonnées additionnelles par chunk
    """
    if not chunks:
        return

    model = get_embed_model()
    embeddings = model.encode(chunks, show_progress_bar=False).tolist()

    col = get_chroma_collection()

    ids = [f"{doc_id}__chunk_{i}" for i in range(len(chunks))]
    metas = []
    for i, chunk in enumerate(chunks):
        meta = {
            "doc_id": doc_id,
            "doc_name": doc_name,
            "chunk_index": i,
        }
        if metadatas and i < len(metadatas):
            meta.update(metadatas[i])
        metas.append(meta)

    # Ajouter ou mettre à jour (upsert)
    col.upsert(
        ids=ids,
        embeddings=embeddings,
        documents=chunks,
        metadatas=metas,
    )

    mark_document_indexed(doc_id)


def semantic_search(query: str, n_results: int = 5,
                    doc_id_filter: str = None) -> list[dict]:
    """
    Recherche sémantique dans les documents indexés.
    
    Args:
        query: Question ou mots-clés
        n_results: Nombre de résultats max
        doc_id_filter: Filtrer sur un document spécifique
    
    Returns:
        Liste de chunks triés par pertinence avec métadonnées
    """
    model = get_embed_model()
    query_embedding = model.encode([query]).tolist()

    col = get_chroma_collection()

    where_filter = None
    if doc_id_filter:
        where_filter = {"doc_id": doc_id_filter}

    try:
        results = col.query(
            query_embeddings=query_embedding,
            n_results=min(n_results, col.count() or 1),
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )
    except Exception:
        return []

    output = []
    if results and results["documents"]:
        for i, doc_text in enumerate(results["documents"][0]):
            output.append({
                "text": doc_text,
                "metadata": results["metadatas"][0][i],
                "score": 1 - results["distances"][0][i],  # cosine → similarity
            })

    return output


def split_text_into_chunks(text: str, chunk_size: int = 800,
                            overlap: int = 100) -> list[str]:
    """
    Découpe un texte en chunks avec chevauchement pour le RAG.
    
    Args:
        text: Texte source
        chunk_size: Taille max de chaque chunk en caractères
        overlap: Chevauchement entre chunks consécutifs
    
    Returns:
        Liste de chunks texte
    """
    if not text:
        return []

    text = text.strip()
    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]

        # Couper proprement sur une phrase ou un espace
        if end < len(text):
            last_period = max(
                chunk.rfind(". "),
                chunk.rfind("\n"),
                chunk.rfind("! "),
                chunk.rfind("? "),
            )
            if last_period > chunk_size // 2:
                chunk = chunk[: last_period + 1]
                end = start + last_period + 1

        chunks.append(chunk.strip())
        start = end - overlap

    return [c for c in chunks if len(c) > 30]


# ---------------------------------------------------------------------------
# Initialisation au chargement du module
# ---------------------------------------------------------------------------
init_database()
