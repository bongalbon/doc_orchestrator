import os
import django
import sys
from pathlib import Path

# Setup django
BASE_DIR = Path(os.getcwd()) / "backend"
sys.path.append(str(BASE_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "orchestrator_backend.settings")

# Force SQLite for tests
import django.conf
from django.conf import settings

# Pre-configure settings before django.setup()
if not settings.configured:
    os.environ["POSTGRES_DB"] = "" # Clear it to force fallback to sqlite in settings.py
    # Alternatively, we can just let settings.py load and then override
    
django.setup()

from tasking.models import Workflow, AgentTask, WorkflowStep
from agents.models import Agent
from tasking.orchestrator import OrchestrationManager
from django.contrib.auth.models import User

def test_orchestrator():
    # 1. Setup data
    user, _ = User.objects.get_or_create(username="testuser")
    manager_agent, _ = Agent.objects.get_or_create(
        name="CEO",
        defaults={"system_prompt": "You are a CEO.", "kind": "manager"}
    )
    
    workflow = Workflow.objects.create(
        title="Test Workflow",
        initial_prompt="Create a simple report about AI.",
        manager_agent=manager_agent,
        user=user
    )
    
    print(f"Workflow created: {workflow.id}")
    
    manager = OrchestrationManager(workflow.id)
    print("Orchestrator ready.")

if __name__ == "__main__":
    test_orchestrator()
