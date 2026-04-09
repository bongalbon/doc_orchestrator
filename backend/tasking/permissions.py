from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsOperatorOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(name__in=["operator", "manager"]).exists()
