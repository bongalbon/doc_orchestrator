from django.contrib.auth.models import Group, User
from rest_framework import permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response


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
    return Response({"token": token.key, "username": user.username, "role": role}, status=status.HTTP_201_CREATED)


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
    role = user.groups.first().name if user.groups.exists() else "operator"
    return Response({"token": token.key, "username": user.username, "role": role})
