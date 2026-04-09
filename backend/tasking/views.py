import io
import os
import urllib.request
import json
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from docx import Document
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from openpyxl import Workbook
from tasking.realtime import broadcast_activity
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
    mixins.UpdateModelMixin,
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
            provider=payload["provider"],
            model_name=payload["model_name"],
            api_key=payload.get("api_key", ""),
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
        task.mark_cancelled() # Sets status to 'cancelled' and saves
        
        if task.celery_task_id:
            try:
                execute_agent_task.AsyncResult(task.celery_task_id).revoke(terminate=True, signal="SIGKILL")
            except Exception:
                pass
                
        AuditLog.objects.create(action="task_cancel_requested", actor=request.user, task=task)
        broadcast_activity({"event": "task_cancelled", "task_id": task.id})
        
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

    @action(detail=False, methods=["get"], url_path="ollama-models")
    def ollama_models(self, request):
        ollama_url = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
        try:
            with urllib.request.urlopen(f"{ollama_url}/api/tags", timeout=3) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    models = [m["name"] for m in data.get("models", [])]
                    return Response({"models": models})
        except Exception as e:
            return Response({"models": [], "error": str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"models": []})

    @action(detail=True, methods=["get"], url_path="export/(?P<format>docx|pdf|xlsx)")
    def export_document(self, request, pk=None, format=None):
        task = self.get_object()
        content = task.result or "Aucun contenu généré."
        buffer = io.BytesIO()
        
        if format == "docx":
            doc = Document()
            doc.add_heading(task.title, 0)
            doc.add_paragraph(content)
            doc.save(buffer)
            filename = f"export_{pk}.docx"
            content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif format == "pdf":
            p = canvas.Canvas(buffer, pagesize=A4)
            width, height = A4
            p.setFont("Helvetica", 12)
            p.drawString(50, height - 50, task.title)
            textobject = p.beginText(50, height - 70)
            # Basic line splitting for simplicity
            for line in content.split("\n"):
                if len(line) > 90: # Very basic wrap
                    for i in range(0, len(line), 90):
                        textobject.textLine(line[i:i+90])
                else:
                    textobject.textLine(line)
            p.drawText(textobject)
            p.showPage()
            p.save()
            filename = f"export_{pk}.pdf"
            content_type = "application/pdf"
        elif format == "xlsx":
            wb = Workbook()
            ws = wb.active
            ws.title = "Resultat"
            ws.append(["Titre", task.title])
            ws.append(["Date", task.finished_at.strftime("%Y-%m-%d") if task.finished_at else ""])
            ws.append([])
            ws.append(["Contenu:"])
            for line in content.split("\n"):
                ws.append([line])
            wb.save(buffer)
            filename = f"export_{pk}.xlsx"
            content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        
        buffer.seek(0)
        return FileResponse(buffer, as_attachment=True, filename=filename, content_type=content_type)
