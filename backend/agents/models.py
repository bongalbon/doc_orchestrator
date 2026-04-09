from django.db import models


class Agent(models.Model):
    AGENT_KIND_CHOICES = (
        ("primary", "Primary"),
        ("sub", "Sub Agent"),
    )

    name = models.CharField(max_length=120, unique=True)
    kind = models.CharField(max_length=20, choices=AGENT_KIND_CHOICES, default="sub")
    specialty = models.CharField(max_length=180, blank=True)
    system_prompt = models.TextField(blank=True)
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="sub_agents",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return f"{self.name} ({self.kind})"
