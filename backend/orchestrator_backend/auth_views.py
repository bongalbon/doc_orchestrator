from django.contrib.auth.models import Group, User
from rest_framework import permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from tasking.models import AuditLog


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def register(request):
    username = request.data.get("username", "").strip()
    password = request.data.get("password", "")
    role = request.data.get("role", "operator")
    if not username or not password:
        return Response({"detail": "username and password required"}, status=400)
    if User.objects.filter(username=username).exists():
        return Response({"detail": "username already exists"}, status=400)
    user = User.objects.create_user(username=username, password=password)
    group, _ = Group.objects.get_or_create(name=role)
    user.groups.add(group)
    token, _ = Token.objects.get_or_create(user=user)
    refresh = RefreshToken.for_user(user)
    return Response(
        {
            "token": token.key,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "username": user.username,
            "role": role,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def login(request):
    username = request.data.get("username", "").strip()
    password = request.data.get("password", "")
    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({"detail": "invalid credentials"}, status=400)
    if not user.check_password(password):
        return Response({"detail": "invalid credentials"}, status=400)
    token, _ = Token.objects.get_or_create(user=user)
    refresh = RefreshToken.for_user(user)
    role = user.groups.first().name if user.groups.exists() else "operator"
    return Response(
        {
            "token": token.key,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "username": user.username,
            "role": role,
        }
    )


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def users_roles(request):
    if not (request.user.is_superuser or request.user.groups.filter(name__in=["manager"]).exists()):
        return Response({"detail": "forbidden"}, status=403)
    users = User.objects.all().order_by("username")
    payload = []
    for user in users:
        payload.append(
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "is_superuser": user.is_superuser,
                "roles": list(user.groups.values_list("name", flat=True)),
            }
        )
    return Response({"users": payload})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def set_user_role(request, user_id: int):
    if not (request.user.is_superuser or request.user.groups.filter(name__in=["manager"]).exists()):
        return Response({"detail": "forbidden"}, status=403)
    role = request.data.get("role", "").strip()
    if not role:
        return Response({"detail": "role required"}, status=400)
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({"detail": "user not found"}, status=404)
    group, _ = Group.objects.get_or_create(name=role)
    user.groups.clear()
    user.groups.add(group)
    AuditLog.objects.create(action="role_updated", actor=request.user, metadata={"user_id": user.id, "role": role})
    return Response({"ok": True})


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def audit_logs(request):
    if not (request.user.is_superuser or request.user.groups.filter(name__in=["manager"]).exists()):
        return Response({"detail": "forbidden"}, status=403)
    logs = AuditLog.objects.select_related("actor", "task").all()[:200]
    return Response(
        {
            "logs": [
                {
                    "id": row.id,
                    "action": row.action,
                    "actor": row.actor.username if row.actor else None,
                    "task_id": row.task_id,
                    "metadata": row.metadata,
                    "created_at": row.created_at,
                }
                for row in logs
            ]
        }
    )
