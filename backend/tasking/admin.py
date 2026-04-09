from django.contrib import admin
from .models import AgentTask, AuditLog


@admin.register(AgentTask)
class AgentTaskAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "requested_agent", "assigned_agent", "created_at")
    list_filter = ("status",)
    search_fields = ("title", "prompt")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("action", "actor", "task", "created_at")
    list_filter = ("action",)
    search_fields = ("action",)
