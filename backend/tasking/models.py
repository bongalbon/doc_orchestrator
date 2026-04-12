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


class Workflow(models.Model):
    STATUS_CHOICES = (
        ("thinking", "Manager Thinking"),
        ("delegating", "Delegating Tasks"),
        ("reviewing", "Reviewing Results"),
        ("awaiting_approval", "Awaiting User Approval"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    )

    title = models.CharField(max_length=180)
    user = models.ForeignKey("auth.User", on_delete=models.CASCADE, related_name="workflows", null=True, blank=True)
    initial_prompt = models.TextField()
    manager_agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="managed_workflows")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="thinking")
    final_result = models.TextField(blank=True)
    error_message = models.TextField(blank=True)
    celery_task_id = models.CharField(max_length=120, blank=True)
    cancel_requested = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)


class WorkflowStep(models.Model):
    STEP_TYPES = (
        ("analysis", "Manager Analysis"),
        ("recruitment", "Agent Recruitment"),
        ("delegation", "Task Delegation"),
        ("execution", "Agent Execution"),
        ("review", "Manager Review"),
    )

    workflow = models.ForeignKey(Workflow, on_delete=models.CASCADE, related_name="steps")
    agent = models.ForeignKey(Agent, null=True, blank=True, on_delete=models.SET_NULL)
    step_type = models.CharField(max_length=20, choices=STEP_TYPES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at",)


class Notification(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("read", "Read"),
    )

    workflow = models.ForeignKey(Workflow, on_delete=models.CASCADE, related_name="notifications")
    user = models.ForeignKey("auth.User", on_delete=models.CASCADE, related_name="workflow_notifications")
    message = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    user_feedback = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class ProviderCredential(models.Model):
    user = models.ForeignKey("auth.User", on_delete=models.CASCADE, related_name="provider_credentials")
    provider = models.CharField(max_length=40)  # e.g. 'gemini', 'openai', 'anthropic', 'ollama', 'grok'
    api_key_encrypted = models.TextField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "provider")
        ordering = ("provider",)

    def __str__(self):
        return f"{self.user.username} - {self.provider}"

    def set_key(self, plain_key: str):
        from .utils import KeyEncryption
        self.api_key_encrypted = KeyEncryption.encrypt(plain_key)

    def get_key(self) -> str:
        from .utils import KeyEncryption
        return KeyEncryption.decrypt(self.api_key_encrypted)
