from rest_framework import serializers

from .models import AgentTask


class AgentTaskSerializer(serializers.ModelSerializer):
    requested_agent_name = serializers.CharField(source="requested_agent.name", read_only=True)
    assigned_agent_name = serializers.CharField(source="assigned_agent.name", read_only=True)

    class Meta:
        model = AgentTask
        fields = (
            "id",
            "title",
            "prompt",
            "provider",
            "model_name",
            "status",
            "requested_agent",
            "requested_agent_name",
            "assigned_agent",
            "assigned_agent_name",
            "result",
            "error_message",
            "celery_task_id",
            "timeout_seconds",
            "max_retries",
            "retry_count",
            "cancel_requested",
            "started_at",
            "finished_at",
            "created_at",
            "updated_at",
        )


class TaskCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=180)
    prompt = serializers.CharField()
    provider = serializers.ChoiceField(
        choices=["ollama", "openai", "gemini", "grok", "anthropic"],
        required=False,
        default="ollama",
    )
    model_name = serializers.CharField(required=False, allow_blank=True, default="")
    requested_agent_id = serializers.IntegerField(required=False, allow_null=True)
    timeout_seconds = serializers.IntegerField(required=False, min_value=10, max_value=3600, default=180)
