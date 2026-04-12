from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from agents.models import Agent


def choose_assigned_agent(prompt: str, requested_agent):
    from agents.models import Agent

    if requested_agent is None:
        primary = Agent.objects.filter(kind="primary", is_active=True).first()
        if primary:
            return primary
        return Agent.objects.create(
            name="Main Orchestrator",
            kind="primary",
            specialty="routing",
            system_prompt="You are the main coordinator agent.",
            is_active=True,
        )

    if requested_agent.kind == "sub":
        return requested_agent

    subs = Agent.objects.filter(parent=requested_agent, is_active=True)
    if not subs.exists():
        return requested_agent

    prompt_lc = prompt.lower()
    scored = []
    for sub in subs:
        score = 0
        if sub.specialty:
            tokens = [t.strip() for t in sub.specialty.lower().split(",") if t.strip()]
            score = sum(1 for token in tokens if token in prompt_lc)
        scored.append((score, sub))
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1] if scored else subs.first()


def enqueue_task(
    title: str,
    prompt: str,
    requested_agent,
    timeout_seconds: int,
    actor=None,
    provider: str = "ollama",
    model_name: str = "",
    api_key: str = "",
    ollama_url: str = "",
) -> "AgentTask":
    from tasking.models import AgentTask, AuditLog, ProviderCredential
    from tasking.tasks import execute_agent_task

    # Handle automatic API Key retrieval from stored credentials
    effective_api_key = api_key
    if not effective_api_key and actor:
        storage = ProviderCredential.objects.filter(user=actor, provider=provider, is_active=True).first()
        if storage:
            effective_api_key = storage.get_key()

    assigned_agent = choose_assigned_agent(prompt=prompt, requested_agent=requested_agent)
    task = AgentTask.objects.create(
        title=title,
        prompt=prompt,
        requested_agent=requested_agent,
        assigned_agent=assigned_agent,
        provider=provider,
        model_name=model_name,
        api_key=effective_api_key,
        ollama_url=ollama_url,
        status="queued",
        timeout_seconds=timeout_seconds,
    )
    job = execute_agent_task.apply_async(
        args=[task.id],
        time_limit=timeout_seconds,
        soft_time_limit=max(10, timeout_seconds - 5),
    )
    task.celery_task_id = job.id or ""
    task.save(update_fields=["celery_task_id", "updated_at"])
    AuditLog.objects.create(action="task_created", actor=actor, task=task, metadata={"queue_job_id": job.id})
    return task


def running_snapshot() -> list[dict]:
    from tasking.models import AgentTask, Workflow

    active_tasks = AgentTask.objects.filter(status="running").select_related("assigned_agent")
    active_workflows = Workflow.objects.filter(status__in=["thinking", "delegating", "reviewing"]).select_related("manager_agent")
    
    snapshot = []
    
    for row in active_tasks:
        snapshot.append({
            "id": row.id,
            "type": "task",
            "agent_name": row.assigned_agent.name if row.assigned_agent else "Unassigned",
            "title": row.title,
            "status": row.status,
        })
        
    for row in active_workflows:
        snapshot.append({
            "id": row.id,
            "type": "workflow",
            "agent_name": row.manager_agent.name if row.manager_agent else "CEO",
            "title": row.title,
            "status": row.status,
        })
        
    return snapshot


def active_agents_snapshot() -> list[str]:
    from tasking.models import AgentTask, Workflow

    running_tasks = AgentTask.objects.filter(status="running").select_related("assigned_agent")
    running_wf = Workflow.objects.filter(status__in=["thinking", "delegating", "reviewing"]).select_related("manager_agent")
    
    agents = {t.assigned_agent.name for t in running_tasks if t.assigned_agent}
    agents.update({w.manager_agent.name for w in running_wf if w.manager_agent})
    
    return sorted(list(agents))


def start_workflow(
    title: str,
    prompt: str,
    manager_agent_id: int | None = None,
    user: "User" = None,
    provider: str = "",
    model_name: str = "",
    ollama_url: str = "",
) -> "Workflow":
    from tasking.models import Workflow, AuditLog
    from agents.models import Agent

    manager = None
    if manager_agent_id:
        manager = Agent.objects.filter(id=manager_agent_id).first()
    
    if not manager:
        manager = Agent.objects.filter(kind="primary", is_active=True).first()
        if not manager:
            manager = Agent.objects.create(
                name="CEO Manager",
                kind="primary",
                specialty="management, orchestration",
                system_prompt="You are the CEO of the agent team. You orchestrate tasks.",
            )

    workflow = Workflow.objects.create(
        title=title,
        user=user,
        initial_prompt=prompt,
        manager_agent=manager,
        status="thinking",
        default_provider=provider,
        default_model=model_name,
        ollama_url=ollama_url
    )
    
    from tasking.tasks import run_workflow_orchestration
    job = run_workflow_orchestration.apply_async(args=[workflow.id])
    workflow.celery_task_id = job.id or ""
    workflow.save(update_fields=["celery_task_id"])
    
    AuditLog.objects.create(action="workflow_started", actor=user, metadata={"workflow_id": workflow.id, "job_id": job.id})
    return workflow
