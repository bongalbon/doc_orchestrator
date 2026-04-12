"""
URL configuration for orchestrator_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from agents.views import AgentViewSet
from orchestrator_backend.auth_views import audit_logs, login, register, set_user_role, users_roles
from tasking.views import AgentTaskViewSet, WorkflowViewSet, NotificationViewSet, CredentialViewSet

router = DefaultRouter()
router.register("agents", AgentViewSet, basename="agents")
router.register("tasks", AgentTaskViewSet, basename="tasks")
router.register("workflows", WorkflowViewSet, basename="workflows")
router.register("notifications", NotificationViewSet, basename="notifications")
router.register("credentials", CredentialViewSet, basename="credentials")

urlpatterns = [
    path('admin/', admin.site.urls),
    path("api/", include(router.urls)),
    path("api/auth/register/", register),
    path("api/auth/login/", login),
    path("api/auth/refresh/", TokenRefreshView.as_view()),
    path("api/admin/users/", users_roles),
    path("api/admin/users/<int:user_id>/role/", set_user_role),
    path("api/admin/audit/", audit_logs),
]
