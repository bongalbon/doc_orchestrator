from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Agent
from .serializers import AgentSerializer
from tasking.models import AuditLog
from tasking.permissions import IsOperatorOrReadOnly


class AgentViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = AgentSerializer
    queryset = Agent.objects.all().order_by("kind", "name")
    permission_classes = [IsAuthenticated, IsOperatorOrReadOnly]

    def perform_create(self, serializer):
        agent = serializer.save()
        AuditLog.objects.create(action="agent_created", actor=self.request.user, metadata={"agent_id": agent.id})
