from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from agents.models import Agent
from tasking.models import AgentTask, AuditLog
from tasking.permissions import IsOperatorOrReadOnly
from tasking.serializers import AgentTaskSerializer, TaskCreateSerializer
from tasking.services import active_agents_snapshot, enqueue_task, running_snapshot
from tasking.tasks import execute_agent_task


class AgentTaskViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = AgentTaskSerializer
    queryset = AgentTask.objects.select_related("requested_agent", "assigned_agent").all()
    permission_classes = [IsAuthenticated, IsOperatorOrReadOnly]

    def create(self, request, *args, **kwargs):
        create_serializer = TaskCreateSerializer(data=request.data)
        create_serializer.is_valid(raise_exception=True)
        payload = create_serializer.validated_data

        requested_agent = None
        requested_agent_id = payload.get("requested_agent_id")
        if requested_agent_id is not None:
            requested_agent = get_object_or_404(Agent, id=requested_agent_id, is_active=True)

        task = enqueue_task(
            title=payload["title"],
            prompt=payload["prompt"],
            requested_agent=requested_agent,
            timeout_seconds=payload["timeout_seconds"],
            actor=request.user,
        )
        serialized = AgentTaskSerializer(task)
        return Response(serialized.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="activity")
    def activity(self, request):
        return Response(
            {
                "running_tasks": running_snapshot(),
                "active_agents": active_agents_snapshot(),
            }
        )

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        task = self.get_object()
        if task.status in {"done", "failed", "cancelled"}:
            return Response({"detail": "Task already finished."}, status=status.HTTP_400_BAD_REQUEST)
        task.cancel_requested = True
        task.save(update_fields=["cancel_requested", "updated_at"])
        if task.celery_task_id:
            execute_agent_task.AsyncResult(task.celery_task_id).revoke(terminate=True, signal="SIGKILL")
        AuditLog.objects.create(action="task_cancel_requested", actor=request.user, task=task)
        return Response({"ok": True})

    @action(detail=True, methods=["post"], url_path="retry")
    def retry(self, request, pk=None):
        task = self.get_object()
        if task.status not in {"failed", "cancelled"}:
            return Response({"detail": "Only failed/cancelled tasks can be retried."}, status=400)
        if task.retry_count >= task.max_retries:
            return Response({"detail": "Retry limit reached."}, status=400)
        task.retry_count += 1
        task.status = "queued"
        task.cancel_requested = False
        task.error_message = ""
        task.save(update_fields=["retry_count", "status", "cancel_requested", "error_message", "updated_at"])
        job = execute_agent_task.apply_async(
            args=[task.id],
            time_limit=task.timeout_seconds,
            soft_time_limit=max(10, task.timeout_seconds - 5),
        )
        task.celery_task_id = job.id or ""
        task.save(update_fields=["celery_task_id", "updated_at"])
        AuditLog.objects.create(action="task_retried", actor=request.user, task=task, metadata={"job_id": job.id})
        return Response({"ok": True})
