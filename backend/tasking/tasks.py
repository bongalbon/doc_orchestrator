import time
import logging
from celery import shared_task
from tasking.llm_router import run_llm_task
from tasking.models import AgentTask
from tasking.realtime import broadcast_activity

logger = logging.getLogger(__name__)

@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3}, time_limit=600)
def execute_agent_task(self, task_id: int):
    try:
        task = AgentTask.objects.select_related("assigned_agent", "requested_agent").get(id=task_id)
    except AgentTask.DoesNotExist:
        logger.error(f"Task {task_id} not found.")
        return "not_found"

    if task.cancel_requested:
        task.mark_cancelled()
        return "cancelled"

    task.celery_task_id = self.request.id or ""
    task.mark_running()
    broadcast_activity({"event": "task_running", "task_id": task.id})

    try:
        # Tentative d'exécution
        result = run_llm_task(
            prompt=task.prompt,
            system_prompt=(
                task.assigned_agent.system_prompt
                if task.assigned_agent and task.assigned_agent.system_prompt
                else "You are a specialist assistant."
            ),
            provider=task.provider,
            model=task.model_name,
            api_key=task.api_key,
            base_url=task.ollama_url,
        )
        task.mark_done(result)
        broadcast_activity({"event": "task_done", "task_id": task.id})
    except Exception as e:
        # En cas d'erreur, on logue et on laisse Celery gérer le retry
        error_msg = str(e)
        logger.warning(f"Task {task_id} failed: {error_msg}. Retry {self.request.retries}/3")
        
        if self.request.retries >= self.max_retries:
            task.mark_failed(f"Max retries reached. Last error: {error_msg}")
            broadcast_activity({"event": "task_failed", "task_id": task.id, "error": error_msg})
        
        raise e # Relancer pour déclencher le retry Celery
        
    return "done"


@shared_task(bind=True, time_limit=1200) # Augmenté à 20 min pour les gros workflows
def run_workflow_orchestration(self, workflow_id: int):
    from tasking.models import Workflow, Notification
    from tasking.orchestrator import OrchestrationManager
    from django.contrib.auth.models import User

    try:
        workflow = Workflow.objects.get(id=workflow_id)
    except Workflow.DoesNotExist:
        return "not_found"

    manager = OrchestrationManager(workflow_id)
    max_iterations = 15 # Augmenté pour plus de complexité
    iteration = 0

    try:
        while workflow.status not in ["completed", "failed", "awaiting_approval"] and iteration < max_iterations:
            workflow.refresh_from_db(fields=["cancel_requested", "status"])
            if workflow.cancel_requested:
                workflow.status = "failed"
                workflow.final_result = "Orchestration annulée."
                workflow.save(update_fields=["status", "final_result", "updated_at"])
                broadcast_activity({"event": "workflow_cancelled", "workflow_id": workflow.id})
                return "cancelled"

            manager.run_iteration()
            workflow.refresh_from_db()
            iteration += 1

        if iteration >= max_iterations and workflow.status not in ["completed", "awaiting_approval"]:
            workflow.status = "failed"
            workflow.error_message = "Nombre maximum d'itérations atteint."
            workflow.save(update_fields=["status", "error_message", "updated_at"])

        if workflow.status == "awaiting_approval":
            user = workflow.user or User.objects.filter(is_superuser=True).first()
            if user:
                Notification.objects.create(
                    workflow=workflow,
                    user=user,
                    message=f"Le workflow '{workflow.title}' attend votre validation."
                )
                broadcast_activity({"event": "notification_created", "workflow_id": workflow.id})

    except Exception as e:
        logger.exception(f"Workflow {workflow_id} failed with exception")
        workflow.status = "failed"
        workflow.error_message = str(e)
        workflow.save(update_fields=["status", "error_message", "updated_at"])
        broadcast_activity({"event": "workflow_failed", "workflow_id": workflow.id, "error": str(e)})
        raise e

    return "workflow_completed"
