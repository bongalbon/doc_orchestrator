import json
import re
from typing import List, Dict, Optional
from django.utils import timezone
from agents.models import Agent
from tasking.models import Workflow, WorkflowStep, AgentTask
from tasking.llm_router import run_llm_task

class OrchestrationManager:
    """
    Gère le workflow d'orchestration multi-agents piloté par un Manager/CEO.
    """

    def __init__(self, workflow_id: int):
        self.workflow = Workflow.objects.get(id=workflow_id)
        self.manager = self.workflow.manager_agent

    def log_step(self, step_type: str, content: str, agent: Agent = None):
        WorkflowStep.objects.create(
            workflow=self.workflow,
            step_type=step_type,
            content=content,
            agent=agent
        )

    def _get_api_key(self, provider: str) -> Optional[str]:
        from tasking.models import ProviderCredential
        if not self.workflow.user:
            return None
        cred = ProviderCredential.objects.filter(user=self.workflow.user, provider=provider, is_active=True).first()
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

        provider = "openai"
        response = run_llm_task(
            prompt=prompt,
            system_prompt=system_prompt,
            provider=provider,
            model="gpt-4o",
            api_key=self._get_api_key(provider)
        )

        # 2. Parser la réponse
        self.log_step("analysis", response)
        
        if "ACTION: RECRUIT" in response:
            self._handle_recruit(response)
        elif "ACTION: DELEGATE" in response:
            self._handle_delegate(response)
        elif "ACTION: FINISH" in response:
            self._handle_finish(response)
        else:
            # Si le format est vague, on demande au manager de clarifier
            self.log_step("analysis", "Le manager n'a pas spécifié d'action claire. Relance de la réflexion.")

    def _handle_recruit(self, text: str):
        # Extraction basique via REGEX
        try:
            name = re.search(r"name:\s*([^,]+)", text).group(1).strip()
            specialty = re.search(r"specialty:\s*([^,]+)", text).group(1).strip()
            prompt = re.search(r"prompt:\s*(.+)", text, re.DOTALL).group(1).strip()
            
            agent = Agent.objects.create(
                name=name,
                kind="sub",
                specialty=specialty,
                system_prompt=prompt,
                parent=self.manager,
                is_recruited=True
            )
            self.log_step("recruitment", f"Agent recruté : {name} ({specialty})", agent=agent)
        except Exception as e:
            self.log_step("analysis", f"Erreur lors du recrutement : {str(e)}")

    def _handle_delegate(self, text: str):
        try:
            agent_name = re.search(r"agent:\s*([^,]+)", text).group(1).strip()
            task_prompt = re.search(r"prompt:\s*(.+)", text, re.DOTALL).group(1).strip()
            
            agent = Agent.objects.filter(name=agent_name).first()
            if not agent:
                self.log_step("analysis", f"Agent '{agent_name}' non trouvé. Impossible de déléguer.")
                return

            self.workflow.status = "delegating"
            self.workflow.save()
            
            # Ici on appelle directement le LLM pour le sous-agent (ou on crée un AgentTask synchrone)
            self.log_step("delegation", f"Délégation à {agent_name} : {task_prompt}", agent=agent)
            
            provider = "ollama"
            result = run_llm_task(
                prompt=task_prompt,
                system_prompt=agent.system_prompt,
                provider=provider,
                model="llama3.3:latest",
                api_key=self._get_api_key(provider)
            )
            
            self.log_step("execution", f"Résultat de {agent_name} : {result}", agent=agent)
        except Exception as e:
            self.log_step("analysis", f"Erreur lors de la délégation : {str(e)}")

    def _handle_finish(self, text: str):
        try:
            result = re.search(r"result:\s*(.+)", text, re.DOTALL).group(1).strip()
            self.workflow.final_result = result
            self.workflow.status = "awaiting_approval"
            self.workflow.save()
            self.log_step("review", "Livrable final prêt pour approbation utilisateur.")
        except Exception as e:
            self.log_step("analysis", f"Erreur lors de la finalisation : {str(e)}")
