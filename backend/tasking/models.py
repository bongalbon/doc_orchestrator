from django.db import models
from django.utils import timezone

from agents.models import Agent


class AgentTask(models.Model):
    STATUS_CHOICES = (
        ("queued", "Queued"),
        ("running", "Running"),
        ("done", "Done"),
        ("failed", "Failed"),
        ("cancelled", "Cancelled"),
    )

    title = models.CharField(max_length=180)
    prompt = models.TextField()
    provider = models.CharField(max_length=40, default="ollama")
    model_name = models.CharField(max_length=160, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="queued")
    requested_agent = models.ForeignKey(
        Agent, null=True, blank=True, on_delete=models.SET_NULL, related_name="requested_tasks"
    )
    assigned_agent = models.ForeignKey(
        Agent, null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_tasks"
    )
    result = models.TextField(blank=True)
    error_message = models.TextField(blank=True)
    api_key = models.CharField(max_length=255, blank=True, null=True)
    is_approved = models.BooleanField(default=False)
    celery_task_id = models.CharField(max_length=120, blank=True)
    timeout_seconds = models.PositiveIntegerField(default=180)
    max_retries = models.PositiveIntegerField(default=2)
    retry_count = models.PositiveIntegerField(default=0)
    cancel_requested = models.BooleanField(default=False)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def mark_running(self):
        self.status = "running"
        self.started_at = timezone.now()
        self.save(update_fields=["status", "started_at", "updated_at"])

    def mark_done(self, result: str):
        self.status = "done"
        self.result = result
        self.finished_at = timezone.now()
        self.error_message = ""
        self.save(update_fields=["status", "result", "finished_at", "error_message", "updated_at"])

    def mark_failed(self, error_message: str):
        self.status = "failed"
        self.error_message = error_message
        self.finished_at = timezone.now()
        self.save(update_fields=["status", "error_message", "finished_at", "updated_at"])

    def mark_cancelled(self):
        self.status = "cancelled"
        self.finished_at = timezone.now()
        self.error_message = "Cancelled by user."
        self.save(update_fields=["status", "finished_at", "error_message", "updated_at"])


class AuditLog(models.Model):
    action = models.CharField(max_length=80)
    actor = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL)
    task = models.ForeignKey(AgentTask, null=True, blank=True, on_delete=models.SET_NULL)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
