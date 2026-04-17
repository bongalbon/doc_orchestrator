import os
from django.contrib.auth.models import Group, User
from django.conf import settings
from django.utils import timezone
from django.db import connection
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


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def health_check(request):
    """
    Simple health check endpoint for container orchestration and monitoring.
    Returns 200 OK if the service is running, 503 if there are issues.
    """
    # Vérifications de base de la santé
    health_status = {
        "status": "ok",
        "service": "doc_orchestrator_backend",
        "timestamp": timezone.now().isoformat(),
        "version": "2.0.0",  # À mettre à jour selon votre stratégie de versionnement
        "checks": {}
    }

    overall_status = True

    # Vérifier la connexion à la base de données
    try:
        from django.db import connection
        cursor = connection.cursor()
        cursor.execute("SELECT 1")
        row = cursor.fetchone()
        if row is None or row[0] != 1:
            health_status["checks"]["database"] = {"status": "fail", "message": "Database query failed"}
            overall_status = False
        else:
            health_status["checks"]["database"] = {"status": "ok", "message": "Database connection successful"}
    except Exception as e:
        health_status["checks"]["database"] = {"status": "fail", "message": f"Database connection error: {str(e)}"}
        overall_status = False

    # Vérifier la connexion à Redis (optionnel, car peut ne pas être configuré en dev)
    try:
        import redis
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/1")
        redis_conn = redis.from_url(redis_url, socket_connect_timeout=2)
        redis_conn.ping()
        health_status["checks"]["redis"] = {"status": "ok", "message": "Redis connection successful"}
    except Exception as e:
        # En développement, Redis peut ne pas être obligatoire, donc on ne fail pas forcément
        if not settings.DEBUG:
            health_status["checks"]["redis"] = {"status": "fail", "message": f"Redis connection error: {str(e)}"}
            overall_status = False
        else:
            health_status["checks"]["redis"] = {"status": "warning", "message": f"Redis not available (dev mode): {str(e)}"}

    # Déterminer le code de statut HTTP
    if overall_status:
        return Response(health_status, status=status.HTTP_200_OK)
    else:
        health_status["status"] = "error"
        return Response(health_status, status=status.HTTP_503_SERVICE_UNAVAILABLE)
