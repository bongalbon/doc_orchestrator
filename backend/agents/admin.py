from django.contrib import admin
from .models import Agent


@admin.register(Agent)
class AgentAdmin(admin.ModelAdmin):
    list_display = ("name", "kind", "specialty", "parent", "is_active")
    list_filter = ("kind", "is_active")
    search_fields = ("name", "specialty")
