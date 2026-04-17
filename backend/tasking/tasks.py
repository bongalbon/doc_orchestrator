import time

from celery import shared_task

from tasking.llm_router import run_llm_task
from tasking.models import AgentTask
from tasking.realtime import broadcast_activity


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 2}, time_limit=600)  # 10 minutes pour permettre les réponses LLM longues
def execute_agent_task(self, task_id: int):
    task = AgentTask.objects.select_related("assigned_agent", "requested_agent").get(id=task_id)
    if task.cancel_requested:
        task.mark_cancelled()
        return "cancelled"

    task.celery_task_id = self.request.id or ""
    task.mark_running()
    task.save(update_fields=["celery_task_id", "updated_at"])
    broadcast_activity({"event": "task_running", "task_id": task.id})

    # Short cooperative cancellation window before calling the LLM.
    for _ in range(2):
        time.sleep(1)
        task.refresh_from_db(fields=["cancel_requested", "status"])
        if task.cancel_requested:
            task.mark_cancelled()
            broadcast_activity({"event": "task_cancelled", "task_id": task.id})
            return "cancelled"

    try:
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
        task.status = "FAILED"
        task.result = f"Error: {str(e)}"
        task.save(update_fields=["status", "result", "updated_at"])
        broadcast_activity({"event": "task_failed", "task_id": task.id, "error": str(e)})
        raise e
        
    return "done"


@shared_task(bind=True, time_limit=120)  # 2 minutes suffisent pour l'orchestration
def run_workflow_orchestration(self, workflow_id: int):
    from tasking.models import Workflow, Notification
    from tasking.orchestrator import OrchestrationManager
    from django.contrib.auth.models import User

    workflow = Workflow.objects.get(id=workflow_id)
    manager = OrchestrationManager(workflow_id)

    max_iterations = 10
    iteration = 0

    try:
        while workflow.status not in ["completed", "failed", "awaiting_approval"] and iteration < max_iterations:
            # Check for cancellation at each step
            workflow.refresh_from_db(fields=["cancel_requested", "status"])
            if workflow.cancel_requested:
                workflow.status = "failed"
                workflow.final_result = "Orchestration annulée par l'utilisateur."
                workflow.save(update_fields=["status", "final_result", "updated_at"])
                broadcast_activity({"event": "workflow_cancelled", "workflow_id": workflow.id})
                return "cancelled"

            manager.run_iteration()
            workflow.refresh_from_db()
            iteration += 1

        if workflow.status == "awaiting_approval":
            # Créer une notification pour l'utilisateur
            user = workflow.user or User.objects.filter(is_superuser=True).first()
            if user:
                Notification.objects.create(
                    workflow=workflow,
                    user=user,
                    message=f"Le Manager a terminé le travail sur : {workflow.title}. En attente de votre validation."
                )
                broadcast_activity({"event": "notification_created", "workflow_id": workflow.id})

    except Exception as e:
        workflow.status = "failed"
        workflow.error_message = str(e)
        workflow.save(update_fields=["status", "error_message", "updated_at"])
        broadcast_activity({"event": "workflow_failed", "workflow_id": workflow.id, "error": str(e)})
        raise e

    return "workflow_step_completed"
