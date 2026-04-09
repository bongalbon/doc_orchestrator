import time

from celery import shared_task

from tasking.llm_router import run_llm_task
from tasking.models import AgentTask
from tasking.realtime import broadcast_activity


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 2})
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

    result = run_llm_task(
        prompt=task.prompt,
        system_prompt=(
            task.assigned_agent.system_prompt
            if task.assigned_agent and task.assigned_agent.system_prompt
            else "You are a specialist assistant."
        ),
        provider=task.provider,
        model=task.model_name,
    )
    task.mark_done(result)
    broadcast_activity({"event": "task_done", "task_id": task.id})
    return "done"
