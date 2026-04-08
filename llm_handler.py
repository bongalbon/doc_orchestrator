"""
llm_handler.py — Orchestrateur LiteLLM pour Gemini, OpenAI et Ollama.

Détecte automatiquement Ollama local, propose les modèles cloud configurés,
et implémente les 3 agents spécialisés avec contexte RAG intégré.
"""

import os
import json
import requests
from typing import Optional, Generator

import litellm
from litellm import completion

from config import get_config

# Désactiver les logs trop verbeux de LiteLLM
litellm.suppress_debug_info = True
litellm.num_retries = 5  # Correction robuste WinError 10054
litellm.enable_http2 = False  # Crucial pour la stabilité sur Windows
litellm.request_timeout = 300  # Protection contre les coupures
os.environ["LITELLM_LOG"] = "ERROR"

from config import get_config, DATA_DIR

# ---------------------------------------------------------------------------
# Détection Ollama & Modèles
# ---------------------------------------------------------------------------

def check_ollama_status() -> tuple[bool, list[str]]:
    """
    Vérifie si Ollama est actif localement.
    """
    cfg = get_config()
    base_url = cfg.get("OLLAMA_BASE_URL", "http://localhost:11434")

    try:
        response = requests.get(f"{base_url}/api/tags", timeout=3)
        if response.status_code == 200:
            data = response.json()
            models = [m["name"] for m in data.get("models", [])]
            return True, models
    except Exception:
        pass
    return False, []

GEMINI_MODELS = {
    "🌟 Gemini 2.5 Flash-Lite": "gemini/gemini-2.5-flash-lite",
    "🌟 Gemini 2.5 Flash": "gemini/gemini-2.5-flash",
    "🌟 Gemini 2.5 Pro": "gemini/gemini-2.5-pro",
    "🚀 Gemini 3.1 Flash (Dernier)": "gemini/gemini-3.1-flash",
}

OPENAI_MODELS = {
    "🤖 GPT-4o Mini": "gpt-4o-mini",
    "🤖 GPT-4o": "gpt-4o",
    "🤖 GPT-3.5 Turbo": "gpt-3.5-turbo",
}

def get_available_llm_models() -> dict[str, str]:
    """Retourne les modèles dispos."""
    models = {}
    cfg = get_config()

    ollama_active, ollama_models = check_ollama_status()
    if ollama_active and ollama_models:
        for m in ollama_models:
            models[f"🦙 Ollama — {m}"] = f"ollama/{m}"

    if cfg.get("GEMINI_API_KEY"):
        models.update(GEMINI_MODELS)
    if cfg.get("OPENAI_API_KEY"):
        models.update(OPENAI_MODELS)

    custom = cfg.get("CUSTOM_MODEL", "")
    if custom:
        models[f"⚙️ Personnalisé : {custom}"] = custom

    if not models:
        models["⚠️ Aucun modèle disponible"] = None
    return models

def _apply_env_keys():
    """Recharge les clés API."""
    cfg = get_config()
    if cfg.get("GEMINI_API_KEY"):
        os.environ["GEMINI_API_KEY"] = cfg["GEMINI_API_KEY"]
    if cfg.get("OPENAI_API_KEY"):
        os.environ["OPENAI_API_KEY"] = cfg["OPENAI_API_KEY"]

# ---------------------------------------------------------------------------
# Agents — Persistance JSON
# ---------------------------------------------------------------------------

AGENTS_FILE = DATA_DIR / "agents.json"

DEFAULT_AGENTS = {
    "Secrétaire": {
        "icon": "✍️",
        "description": "Rédige des lettres formelles, courriers officiels et correspondances administratives.",
        "system_prompt": """Tu es un(e) secrétaire de direction expert(e) en rédaction administrative française.
Tu rédiges des courriers formels, lettres officielles et correspondances professionnelles.
Tes documents respectent strictement les normes françaises : objet, date, formule de politesse adaptée.
Tu utilises un langage soutenu, précis et sans fautes.
Structure toujours tes documents en Markdown avec des titres clairs.""",
        "doc_types": ["Lettre formelle", "Courrier administratif", "Note de service", "Convocation"],
    },
    "Analyste": {
        "icon": "📊",
        "description": "Produit des rapports structurés, synthèses et analyses documentaires.",
        "system_prompt": """Tu es un(e) analyste expert(e) en traitement documentaire et rédaction de rapports.
Tu analyses les documents fournis et produis des synthèses structurées, objectives et détaillées.
Tes rapports incluent : résumé exécutif, points clés, analyse critique et recommandations.
Tu cites les sources et structures ton document avec des titres Markdown hiérarchiques.
Ton style est professionnel, analytique et factuel.""",
        "doc_types": ["Rapport d'analyse", "Synthèse", "Compte-rendu", "Fiche de synthèse"],
    },
    "Juriste": {
        "icon": "⚖️",
        "description": "Rédige des PV, délibérations, contrats et documents légaux.",
        "system_prompt": """Tu es un(e) juriste expert(e) en droit administratif et rédaction de documents légaux français.
Tu rédiges des procès-verbaux (PV), délibérations, contrats et actes administratifs.
Tes documents respectent les formulations légales françaises, incluent les mentions obligatoires
und sont structurés selon les standards juridiques en vigueur.
Tu utilises un vocabulaire juridique précis et formel.
Structure systématiquement avec des numérotations et des articles en Markdown.""",
        "doc_types": ["Procès-verbal (PV)", "Délibération", "Contrat", "Acte administratif"],
    },
}

def load_agents() -> dict:
    """Charge les agents depuis le fichier JSON ou utilise les valeurs par défaut."""
    if AGENTS_FILE.exists():
        try:
            return json.loads(AGENTS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return DEFAULT_AGENTS
    return DEFAULT_AGENTS

def save_agents(agents: dict):
    """Sauvegarde les agents dans le fichier JSON."""
    AGENTS_FILE.write_text(json.dumps(agents, indent=4, ensure_ascii=False), encoding="utf-8")

AGENTS = load_agents()


# ---------------------------------------------------------------------------
# Classe principale LLMHandler
# ---------------------------------------------------------------------------

class LLMHandler:
    """Gestionnaire central des appels LLM via LiteLLM."""

    def __init__(self):
        _apply_env_keys()

    def reload_keys(self):
        """Recharge les clés API (après modification dans Paramètres)."""
        _apply_env_keys()

    def generate(
        self,
        prompt: str,
        model: str,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 4096,
        stream: bool = False,
    ) -> str | Generator:
        """
        Appel LLM générique via LiteLLM.

        Args:
            prompt: Message utilisateur
            model: Identifiant LiteLLM (ex: 'gemini/gemini-1.5-flash')
            system_prompt: Instructions système
            temperature: Créativité (0=déterministe, 1=créatif)
            max_tokens: Limite de tokens en sortie
            stream: Si True, retourne un générateur (streaming)

        Returns:
            str (texte complet) ou Generator (streaming)
        """
        _apply_env_keys()

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        # Configuration Ollama spécifique
        extra_kwargs = {}
        if model and model.startswith("ollama/"):
            cfg = get_config()
            extra_kwargs["api_base"] = cfg.get("OLLAMA_BASE_URL", "http://localhost:11434")

        try:
            response = completion(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream,
                **extra_kwargs,
            )

            if stream:
                return response  # Generator pour st.write_stream

            return response.choices[0].message.content or ""

        except Exception as e:
            error_msg = str(e)

            # Quota / Rate limit (429)
            if "429" in error_msg or "RateLimitError" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
                if "limit: 0" in error_msg or "free_tier" in error_msg:
                    raise ValueError(
                        f"⛔ Le modèle **{model}** n'est pas disponible sur le tier gratuit (quota = 0).\n\n"
                        "👉 **Solution** : Utilisez **Gemini 2.5 Flash Lite** dans le sélecteur de modèle."
                    )
                import re as _re
                retry_match = _re.search(r"retry\s+in\s+([\d.]+)s", error_msg, _re.IGNORECASE)
                retry_delay = retry_match.group(1) if retry_match else "quelques secondes"
                raise ValueError(
                    f"⏳ Quota temporairement dépassé — Patientez **{retry_delay}s** et réessayez.\n\n"
                    "💡 Conseil : Le tier gratuit Gemini est limité à ~15 requêtes/minute."
                )

            # Modèle introuvable (404 NOT_FOUND)
            if "404" in error_msg or "NOT_FOUND" in error_msg or "NotFoundError" in error_msg:
                raise ValueError(
                    f"🔍 Modèle **{model}** introuvable ou déprécié sur votre clé API.\n\n"
                    "👉 **Solutions** :\n"
                    "- Utilisez **Gemini 2.5 Flash Lite** ou **Gemini 2.5 Flash** (modèles actifs 2026)\n"
                    "- Ou saisissez un identifiant personnalisé dans ⚙️ Paramètres → Modèle personnalisé"
                )

            # Authentification
            if "API key" in error_msg or "auth" in error_msg.lower() or "401" in error_msg:
                raise ValueError(
                    "❌ Clé API invalide ou manquante. "
                    "Vérifiez vos clés dans ⚙️ Paramètres."
                )

            raise RuntimeError(f"Erreur LLM ({model}): {error_msg}")

    def generate_with_rag(
        self,
        user_request: str,
        agent_name: str,
        model: str,
        doc_type: str,
        context_chunks: list[dict] = None,
        custom_instructions: str = "",
        temperature: float = 0.7,
    ) -> str:
        """
        Génère un document en intégrant le contexte RAG des documents indexés.
        """
        agents = load_agents()
        agent = agents.get(agent_name, agents.get("Secrétaire", {}))
        system_prompt = agent.get("system_prompt", "")

        # Construire le bloc de contexte RAG
        context_block = ""
        if context_chunks:
            context_parts = []
            for i, chunk in enumerate(context_chunks[:5], 1):
                doc_name = chunk.get("metadata", {}).get("doc_name", "Document")
                score = chunk.get("score", 0)
                context_parts.append(
                    f"**[Source {i} — {doc_name} (pertinence: {score:.0%})]**\n"
                    f"{chunk['text']}"
                )
            context_block = (
                "\n\n---\n## CONTEXTE DOCUMENTAIRE (extraits pertinents)\n\n"
                + "\n\n".join(context_parts)
                + "\n\n---\n"
            )

        # Construire le prompt complet
        prompt = f"""
## MISSION
Génère un document de type **{doc_type}** en Markdown complet et professionnel.

## DEMANDE DE L'UTILISATEUR
{user_request}

{context_block}

## INSTRUCTIONS SUPPLÉMENTAIRES
{custom_instructions if custom_instructions else "Aucune instruction supplémentaire."}

## FORMAT ATTENDU
- Document **complet** en Markdown (titres, sections, contenu détaillé)
- Inclure : date du jour, références appropriées, formules adaptées au type de document
- Style professionnel adapté à l'agent {agent_name}
- Langue : Français
"""

        return self.generate(
            prompt=prompt,
            model=model,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=4096,
        )

    def describe_image(self, image_b64: str, mime_type: str = "jpeg",
                       model: str = None) -> str:
        """
        Décrit le contenu d'une image via un LLM vision.
        Utilisé pour l'extraction de texte depuis des images.
        """
        if model is None:
            cfg = get_config()
            if cfg.get("GEMINI_API_KEY"):
                model = "gemini/gemini-1.5-flash"
            elif cfg.get("OPENAI_API_KEY"):
                model = "gpt-4o-mini"
            else:
                return ""

        _apply_env_keys()

        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/{mime_type};base64,{image_b64}"
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "Extrait et transcris tout le texte visible dans cette image. "
                            "Si c'est un document, reproduis sa structure. "
                            "Si c'est une photo, décris son contenu détaillé. "
                            "Réponds uniquement avec le contenu extrait, sans commentaire."
                        ),
                    },
                ],
            }
        ]

        try:
            response = completion(model=model, messages=messages, max_tokens=2048)
            return response.choices[0].message.content or ""
        except Exception:
            return ""

    def test_connection(self, model: str) -> tuple[bool, str]:
        """
        Teste la connexion à un modèle LLM.

        Returns:
            (success: bool, message: str)
        """
        try:
            result = self.generate(
                prompt="Réponds uniquement 'OK' pour confirmer que tu fonctionnes.",
                model=model,
                max_tokens=10,
                temperature=0,
            )
            return True, f"✅ Connexion réussie — Réponse : {result.strip()}"
        except ValueError as e:
            # Erreur métier (quota, auth) — message déjà formaté
            return False, str(e)
        except RuntimeError as e:
            return False, str(e)
        except Exception as e:
            return False, f"❌ Erreur inattendue : {str(e)}"
