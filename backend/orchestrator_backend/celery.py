import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "orchestrator_backend.settings")

app = Celery("orchestrator_backend")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
