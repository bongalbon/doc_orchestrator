import json
import re
import logging
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, asdict
from concurrent.futures import ThreadPoolExecutor, as_completed

from django.utils import timezone
from agents.models import Agent
from tasking.models import Workflow, WorkflowStep, AgentTask
from tasking.llm_router import run_llm_task
from tasking.realtime import broadcast_activity

logger = logging.getLogger(__name__)

@dataclass
class ParsedAction:
    action_type: str  # RECRUIT, DELEGATE, FINISH, THINK, SUMMARIZE
    params: Dict[str, Any]

class ActionParser:
    @classmethod
    def parse_actions(cls, text: str) -> List[ParsedAction]:
        """
        Extracts JSON actions from the LLM response.
        Supports both raw JSON and JSON wrapped in markdown code blocks.
        """
        actions = []
        
        # Try to find JSON block
        json_match = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
        if json_match:
            json_str = json_match.group(1)
        else:
            # Try to find something that looks like a JSON array or object
            json_match = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)
            json_str = json_match.group(1) if json_match else text

        try:
            data = json.loads(json_str)
            if isinstance(data, dict):
                data = [data]
            
            for item in data:
                action_type = item.get("action", item.get("action_type", "")).upper()
                params = item.get("params", item)
                if action_type:
                    actions.append(ParsedAction(action_type=action_type, params=params))
        except Exception as e:
            logger.error(f"Failed to parse JSON actions: {e}. Text was: {text[:200]}...")
            actions.append(ParsedAction(action_type="THINK", params={"thought": f"Parsing failed ({str(e)}), retrying..."}))
            
        return actions


class OrchestrationManager:
    """
    Gère le workflow d'orchestration multi-agents piloté par un Manager/CEO.
    Optimisé pour l'exécution parallèle et les sorties structurées.
    """

    def __init__(self, workflow_id: int):
        self.workflow = Workflow.objects.get(id=workflow_id)
        self.manager = self.workflow.manager_agent

    def log_step(self, step_type: str, content: str, agent: Agent = None):
        step = WorkflowStep.objects.create(
            workflow=self.workflow, step_type=step_type, content=content, agent=agent
        )
        broadcast_activity({
            "event": "step_created",
            "workflow_id": self.workflow.id,
            "step_id": step.id,
            "step_type": step_type,
            "agent_name": agent.name if agent else "Manager"
        })
        return step

    def _get_api_key(self, provider: str) -> Optional[str]:
        from tasking.models import ProviderCredential
        if not self.workflow.user:
            return None
        cred = ProviderCredential.objects.filter(
            user=self.workflow.user, provider=provider, is_active=True
        ).first()
        if not cred:
            logger.warning(f"No credential found for provider {provider} and user {self.workflow.user}")
            return None
        api_key = cred.get_key()
        if not api_key:
            logger.warning(f"API key decryption failed for provider {provider}")
        return api_key

    def run_iteration(self):
        """
        Exécute une itération de la boucle de réflexion du Manager.
        """
        # 1. Préparer le contexte (historique avec résumé si trop long)
        steps = self.workflow.steps.all().order_by('created_at')
        
        # Gestion du contexte par summarization
        history_text = ""
        summary_step = steps.filter(step_type="analysis", content__startswith="SUMMARY:").last()
        
        if summary_step:
            history_text = f"[LAST SUMMARY] {summary_step.content}\n"
            # On ajoute seulement les étapes APRES le dernier résumé
            recent_steps = steps.filter(created_at__gt=summary_step.created_at)
            history_text += "\n".join([f"[{s.step_type}] {s.content}" for s in recent_steps])
        else:
            # Si pas de résumé, on prend les 10 dernières
            if steps.count() > 10:
                recent_steps = steps.all().order_by('-created_at')[:10][::-1]
                history_text = "(... étapes précédentes omises ...)\n"
                history_text += "\n".join([f"[{s.step_type}] {s.content}" for s in recent_steps])
            else:
                history_text = "\n".join([f"[{s.step_type}] {s.content}" for s in steps])

        system_prompt = f"""{self.manager.system_prompt}

Vous êtes le CEO Orchestrateur. Votre but est de remplir la mission de l'utilisateur en déléguant à des sous-agents.
Vous devez répondre EXCLUSIVEMENT avec un bloc de code JSON contenant une liste d'actions.

ACTIONS DISPONIBLES :
1. {{"action": "RECRUIT", "params": {{"name": "Nom", "specialty": "Domaine", "prompt": "Instructions système"}}}}
2. {{"action": "DELEGATE", "params": {{"agent": "Nom", "prompt": "Instructions pour la tâche"}}}}
3. {{"action": "FINISH", "params": {{"result": "Contenu final complet en Markdown"}}}}
4. {{"action": "THINK", "params": {{"thought": "Votre réflexion interne"}}}}
5. {{"action": "SUMMARIZE", "params": {{"summary": "Résumé des avancées à ce stade"}}}}

CONSIGNES :
- Vous pouvez émettre PLUSIEURS actions DELEGATE en une seule fois.
- Utilisez SUMMARIZE si l'historique devient trop long.
- Avant chaque action importante, utilisez THINK.

FORMAT DE RÉPONSE :
```json
[
  {{"action": "THINK", "params": {{"thought": "..."}}}},
  {{"action": "DELEGATE", "params": {{"agent": "...", "prompt": "..."}}}}
]
```
"""

        prompt = f"Mission initiale : {self.workflow.initial_prompt}\n\nHistorique des étapes :\n{history_text if history_text else 'Aucune étape réalisée.'}\n\nQuelle est votre prochaine série d'actions ?"

        provider = self.workflow.default_provider or "gemini"
        model = self.workflow.default_model or "gemini-2.5-pro"

        response_text = run_llm_task(
            prompt=prompt,
            system_prompt=system_prompt,
            provider=provider,
            model=model,
            api_key=self._get_api_key(provider) if provider != "ollama" else None,
            base_url=self.workflow.ollama_url if provider == "ollama" else None,
        )

        # 2. Parser et exécuter les actions
        actions = ActionParser.parse_actions(response_text)
        
        delegations = []
        for action in actions:
            if action.action_type == "THINK":
                self.log_step("analysis", f"Réflexion : {action.params.get('thought')}")
            elif action.action_type == "SUMMARIZE":
                self.log_step("analysis", f"SUMMARY: {action.params.get('summary')}")
            elif action.action_type == "RECRUIT":
                self._handle_recruit(action.params)
            elif action.action_type == "DELEGATE":
                delegations.append(action.params)
            elif action.action_type == "FINISH":
                self._handle_finish(action.params)
                return

        if delegations:
            self._handle_parallel_delegation(delegations)

    def _handle_recruit(self, params: Dict[str, Any]):
        try:
            name = params.get("name", "").strip()
            specialty = params.get("specialty", "").strip()
            prompt = params.get("prompt", "").strip()
            if not name or not prompt: return

            # Try to get existing agent, update if exists, create if not
            agent = Agent.objects.filter(name=name).first()
            if agent:
                # Update existing agent
                agent.specialty = specialty
                agent.system_prompt = prompt
                agent.parent = self.manager
                agent.is_recruited = True
                agent.save()
                action_msg = f"Agent mis à jour : {name} ({specialty})"
            else:
                # Create new agent
                agent = Agent.objects.create(
                    name=name,
                    kind="sub",
                    specialty=specialty,
                    system_prompt=prompt,
                    parent=self.manager,
                    is_recruited=True,
                )
                action_msg = f"Agent recruté : {name} ({specialty})"

            self.log_step("recruitment", action_msg, agent=agent)
        except Exception as e:
            logger.error(f"Error in recruit: {e}")

    def _handle_parallel_delegation(self, delegation_params_list: List[Dict[str, Any]]):
        self.workflow.status = "delegating"
        self.workflow.save()

        tasks_to_run = []
        for params in delegation_params_list:
            agent_name = params.get("agent", "").strip()
            task_prompt = params.get("prompt", "").strip()
            if not agent_name or not task_prompt: continue

            agent = Agent.objects.filter(name=agent_name).first()
            if not agent:
                self.log_step("analysis", f"ERREUR : Agent '{agent_name}' introuvable.")
                continue

            self.log_step("delegation", f"Délégation à {agent_name} : {task_prompt}", agent=agent)
            tasks_to_run.append({"agent": agent, "prompt": task_prompt})

        if not tasks_to_run: return

        results = []
        sub_provider = self.workflow.default_provider or "ollama"
        sub_model = self.workflow.default_model or "llama3.3:latest"
        api_key = self._get_api_key(sub_provider) if sub_provider != "ollama" else None
        base_url = self.workflow.ollama_url if sub_provider == "ollama" else None

        def run_single_task(task_data):
            agent = task_data["agent"]
            try:
                res = run_llm_task(
                    prompt=task_data["prompt"],
                    system_prompt=agent.system_prompt,
                    provider=sub_provider,
                    model=sub_model,
                    api_key=api_key,
                    base_url=base_url,
                )
                return {"agent": agent, "result": res, "success": True}
            except Exception as e:
                return {"agent": agent, "result": str(e), "success": False}

        with ThreadPoolExecutor(max_workers=len(tasks_to_run)) as executor:
            future_to_task = {executor.submit(run_single_task, t): t for t in tasks_to_run}
            for future in as_completed(future_to_task):
                results.append(future.result())

        for res in results:
            agent = res["agent"]
            if res["success"]:
                self.log_step("execution", f"Résultat de {agent.name} : {res['result']}", agent=agent)
            else:
                self.log_step("analysis", f"ERREUR {agent.name} : {res['result']}", agent=agent)

    def _handle_finish(self, params: Dict[str, Any]):
        result = params.get("result", "").strip()
        if not result: return
        self.workflow.final_result = result
        self.workflow.status = "awaiting_approval"
        self.workflow.save()
        self.log_step("review", "Livrable final prêt.")
        broadcast_activity({"event": "workflow_completed", "workflow_id": self.workflow.id})
