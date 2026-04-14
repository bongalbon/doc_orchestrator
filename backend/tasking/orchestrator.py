import json
import re
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
from django.utils import timezone
from agents.models import Agent
from tasking.models import Workflow, WorkflowStep, AgentTask
from tasking.llm_router import run_llm_task


@dataclass
class ParsedAction:
    action_type: str
    params: Dict[str, str]


class ActionParser:
    RECRUIT_PATTERN = re.compile(
        r"ACTION:\s*RECRUIT\s*\|\s*"
        r"name:\s*(?P<name>[^,|]+)\s*,\s*"
        r"specialty:\s*(?P<specialty>[^,|]+)\s*,\s*"
        r"prompt:\s*(?P<prompt>.+?)(?=ACTION:|$)",
        re.DOTALL | re.IGNORECASE,
    )
    DELEGATE_PATTERN = re.compile(
        r"ACTION:\s*DELEGATE\s*\|\s*"
        r"agent:\s*(?P<agent>[^,|]+)\s*,\s*"
        r"prompt:\s*(?P<prompt>.+?)(?=ACTION:|$)",
        re.DOTALL | re.IGNORECASE,
    )
    FINISH_PATTERN = re.compile(
        r"ACTION:\s*FINISH\s*\|\s*"
        r"result:\s*(?P<result>.+)",
        re.DOTALL | re.IGNORECASE,
    )

    @classmethod
    def parse(cls, text: str) -> Optional[ParsedAction]:
        text = text.strip()

        if match := cls.RECRUIT_PATTERN.search(text):
            return ParsedAction(
                action_type="RECRUIT",
                params={
                    "name": match.group("name").strip(),
                    "specialty": match.group("specialty").strip(),
                    "prompt": match.group("prompt").strip(),
                },
            )

        if match := cls.DELEGATE_PATTERN.search(text):
            return ParsedAction(
                action_type="DELEGATE",
                params={
                    "agent": match.group("agent").strip(),
                    "prompt": match.group("prompt").strip(),
                },
            )

        if match := cls.FINISH_PATTERN.search(text):
            return ParsedAction(
                action_type="FINISH",
                params={"result": match.group("result").strip()},
            )

        return None


class OrchestrationManager:
    """
    Gère le workflow d'orchestration multi-agents piloté par un Manager/CEO.
    """

    def __init__(self, workflow_id: int):
        self.workflow = Workflow.objects.get(id=workflow_id)
        self.manager = self.workflow.manager_agent

    def log_step(self, step_type: str, content: str, agent: Agent = None):
        WorkflowStep.objects.create(
            workflow=self.workflow, step_type=step_type, content=content, agent=agent
        )

    def _get_api_key(self, provider: str) -> Optional[str]:
        from tasking.models import ProviderCredential

        if not self.workflow.user:
            return None
        cred = ProviderCredential.objects.filter(
            user=self.workflow.user, provider=provider, is_active=True
        ).first()
        return cred.get_key() if cred else None

    def run_iteration(self):
        """
        Exécute une itération de la boucle de réflexion du Manager.
        """
        # 1. Préparer le contexte (historique des étapes précédentes)
        history = self.workflow.steps.all()
        history_text = "\n".join([f"[{s.step_type}] {s.content}" for s in history])

        system_prompt = f"""{self.manager.system_prompt}

Vous êtes le CEO Orchestrateur. Votre but est de remplir la mission de l'utilisateur en déléguant à des sous-agents.
Vous avez le pouvoir de :
1. **RECRUTER** : Créer un nouvel agent spécialisé s'il n'existe pas.
2. **DÉLÉGUER** : Envoyer une tâche à un agent existant.
3. **RÉVISER** : Demander une correction si un résultat est insatisfaisant.
4. **TERMINER** : Fournir le livrable final quand tout est prêt.

FORMAT DE RÉPONSE ATTENDU (Utilisez EXACTEMENT ces balises) :
- THOUGHT: [Votre réflexion interne]
- ACTION: RECRUIT | name: [nom], specialty: [domaine], prompt: [instructions système]
- ACTION: DELEGATE | agent: [nom], prompt: [votre demande]
- ACTION: FINISH | result: [le document final complet en Markdown]
"""

        prompt = f"Mission initiale : {self.workflow.initial_prompt}\n\nHistorique :\n{history_text if history_text else 'Aucune étape réalisée.'}\n\nQuelle est votre prochaine action ?"

        # On utilise le provider et modèle choisis par l'utilisateur, ou Gemini par défaut
        provider = self.workflow.default_provider or "gemini"
        model = self.workflow.default_model or "gemini-2.0-flash"

        response = run_llm_task(
            prompt=prompt,
            system_prompt=system_prompt,
            provider=provider,
            model=model,
            api_key=self._get_api_key(provider) if provider != "ollama" else None,
            base_url=self.workflow.ollama_url if provider == "ollama" else None,
        )

        # 2. Parser la réponse
        self.log_step("analysis", response)

        action = ActionParser.parse(response)
        if action is None:
            self.log_step(
                "analysis",
                "Le manager n'a pas spécifié d'action claire. Relance de la réflexion.",
            )
            return

        if action.action_type == "RECRUIT":
            self._handle_recruit(action.params)
        elif action.action_type == "DELEGATE":
            self._handle_delegate(action.params)
        elif action.action_type == "FINISH":
            self._handle_finish(action.params)

    def _handle_recruit(self, params: Dict[str, str]):
        try:
            name = params.get("name", "").strip()
            specialty = params.get("specialty", "").strip()
            prompt = params.get("prompt", "").strip()

            if not name or not prompt:
                self.log_step("analysis", "Paramètres de recrutement incomplets.")
                return

            agent = Agent.objects.create(
                name=name,
                kind="sub",
                specialty=specialty,
                system_prompt=prompt,
                parent=self.manager,
                is_recruited=True,
            )
            self.log_step(
                "recruitment", f"Agent recruté : {name} ({specialty})", agent=agent
            )
        except Exception as e:
            self.log_step("analysis", f"Erreur lors du recrutement : {str(e)}")

    def _handle_delegate(self, params: Dict[str, str]):
        try:
            agent_name = params.get("agent", "").strip()
            task_prompt = params.get("prompt", "").strip()

            if not agent_name or not task_prompt:
                self.log_step("analysis", "Paramètres de délégation incomplets.")
                return

            agent = Agent.objects.filter(name=agent_name).first()
            if not agent:
                self.log_step(
                    "analysis",
                    f"Agent '{agent_name}' non trouvé. Impossible de déléguer.",
                )
                return

            self.workflow.status = "delegating"
            self.workflow.save()

            self.log_step(
                "delegation", f"Délégation à {agent_name} : {task_prompt}", agent=agent
            )

            sub_provider = self.workflow.default_provider or "ollama"
            sub_model = self.workflow.default_model or "llama3.3:latest"

            result = run_llm_task(
                prompt=task_prompt,
                system_prompt=agent.system_prompt,
                provider=sub_provider,
                model=sub_model,
                api_key=self._get_api_key(sub_provider)
                if sub_provider != "ollama"
                else None,
                base_url=self.workflow.ollama_url if sub_provider == "ollama" else None,
            )

            self.log_step(
                "execution", f"Résultat de {agent_name} : {result}", agent=agent
            )
        except Exception as e:
            self.log_step("analysis", f"Erreur lors de la délégation : {str(e)}")

    def _handle_finish(self, params: Dict[str, str]):
        try:
            result = params.get("result", "").strip()
            if not result:
                self.log_step("analysis", "Résultat manquant pour finalisation.")
                return

            self.workflow.final_result = result
            self.workflow.status = "awaiting_approval"
            self.workflow.save()
            self.log_step("review", "Livrable final prêt pour approbation utilisateur.")
        except Exception as e:
            self.log_step("analysis", f"Erreur lors de la finalisation : {str(e)}")
