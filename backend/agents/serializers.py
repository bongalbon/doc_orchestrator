from rest_framework import serializers

from .models import Agent


class AgentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Agent
        fields = (
            "id",
            "name",
            "kind",
            "specialty",
            "system_prompt",
            "parent",
            "is_recruited",
            "is_active",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        kind = attrs.get("kind", getattr(self.instance, "kind", "sub"))
        parent = attrs.get("parent", getattr(self.instance, "parent", None))
        if kind == "primary" and parent is not None:
            raise serializers.ValidationError("A primary agent cannot have a parent.")
        return attrs
