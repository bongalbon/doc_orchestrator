from rest_framework import serializers

from agents.models import Agent
from .models import AgentTask, Workflow, WorkflowStep, Notification, ProviderCredential


class ProviderCredentialSerializer(serializers.ModelSerializer):
    api_key = serializers.CharField(write_only=True)
    masked_key = serializers.SerializerMethodField()

    class Meta:
        model = ProviderCredential
        fields = ("id", "provider", "api_key", "masked_key", "is_active", "created_at", "updated_at")
        read_only_fields = ("created_at", "updated_at")

    def get_masked_key(self, obj):
        decrypted = obj.get_key()
        if not decrypted or decrypted == "ERROR_DECRYPTION_FAILED":
            return "********"
        if len(decrypted) <= 8:
            return "****" + decrypted[-2:]
        return decrypted[:4] + "...." + decrypted[-4:]

    def create(self, validated_data):
        plain_key = validated_data.pop("api_key")
        user = self.context["request"].user
        instance, _ = ProviderCredential.objects.update_or_create(
            user=user,
            provider=validated_data["provider"],
            defaults={"is_active": validated_data.get("is_active", True)}
        )
        instance.set_key(plain_key)
        instance.save()
        return instance

    def update(self, instance, validated_data):
        if "api_key" in validated_data:
            instance.set_key(validated_data.pop("api_key"))
        return super().update(instance, validated_data)


class AgentTaskSerializer(serializers.ModelSerializer):
    requested_agent_name = serializers.CharField(source="requested_agent.name", read_only=True)
    assigned_agent_name = serializers.CharField(source="assigned_agent.name", read_only=True)
    assigned_agent_id = serializers.PrimaryKeyRelatedField(
        source="assigned_agent", queryset=Agent.objects.all(),
        required=False, allow_null=True
    )
    model = serializers.CharField(source="model_name", required=False, allow_blank=True)

    class Meta:
        model = AgentTask
        fields = (
            "id",
            "title",
            "prompt",
            "provider",
            "model_name",
            "model",
            "status",
            "requested_agent",
            "requested_agent_name",
            "assigned_agent",
            "assigned_agent_id",
            "assigned_agent_name",
            "result",
            "error_message",
            "api_key",
            "is_approved",
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
    api_key = serializers.CharField(required=False, allow_blank=True, default="", write_only=True)
    requested_agent_id = serializers.IntegerField(required=False, allow_null=True)
    timeout_seconds = serializers.IntegerField(required=False, min_value=10, max_value=3600, default=180)


class WorkflowStepSerializer(serializers.ModelSerializer):
    agent_name = serializers.CharField(source="agent.name", read_only=True)

    class Meta:
        model = WorkflowStep
        fields = ("id", "step_type", "content", "agent", "agent_name", "created_at")


class WorkflowSerializer(serializers.ModelSerializer):
    steps = WorkflowStepSerializer(many=True, read_only=True)
    manager_agent_name = serializers.CharField(source="manager_agent.name", read_only=True)

    class Meta:
        model = Workflow
        fields = (
            "id",
            "title",
            "initial_prompt",
            "manager_agent",
            "manager_agent_name",
            "status",
            "final_result",
            "steps",
            "created_at",
            "updated_at",
        )


class NotificationSerializer(serializers.ModelSerializer):
    workflow_title = serializers.CharField(source="workflow.title", read_only=True)

    class Meta:
        model = Notification
        fields = ("id", "workflow", "workflow_title", "message", "status", "user_feedback", "created_at")


class WorkflowCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=180)
    prompt = serializers.CharField()
    manager_agent_id = serializers.IntegerField(required=False, allow_null=True)
