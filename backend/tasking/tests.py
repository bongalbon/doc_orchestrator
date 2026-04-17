from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from datetime import timedelta

from .models import AgentTask, AuditLog, Workflow, WorkflowStep, Notification, ProviderCredential
from agents.models import Agent


class AgentTaskModelTest(TestCase):
    """Tests pour le modèle AgentTask"""

    def setUp(self):
        """Configuration initiale pour chaque test"""
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.agent = Agent.objects.create(
            name="Test Agent",
            kind="sub",
            specialty="Testing"
        )

    def test_task_creation(self):
        """Test de création d'une tâche de base"""
        task = AgentTask.objects.create(
            title="Test Task",
            prompt="This is a test prompt",
            requested_agent=self.agent
        )

        self.assertEqual(task.title, "Test Task")
        self.assertEqual(task.prompt, "This is a test prompt")
        self.assertEqual(task.requested_agent, self.agent)
        self.assertEqual(task.status, "queued")  # valeur par défaut
        self.assertEqual(task.provider, "ollama")  # valeur par défaut
        self.assertFalse(task.is_approved)  # valeur par défaut
        self.assertEqual(task.timeout_seconds, 180)  # valeur par défaut
        self.assertEqual(task.max_retries, 2)  # valeur par défaut

    def test_task_str_representation(self):
        """Test de la représentation string de la tâche (si définie)"""
        # Comme AgentTask n'a pas de __str__ défini, on teste juste sa création
        task = AgentTask.objects.create(
            title="Test Task",
            prompt="Test prompt"
        )
        self.assertIsNotNone(task)

    def test_task_status_choices(self):
        """Test que seuls les statuts valides sont acceptés"""
        for status_choice, _ in AgentTask.STATUS_CHOICES:
            task = AgentTask.objects.create(
                title=f"Task {status_choice}",
                prompt="Test prompt",
                status=status_choice
            )
            self.assertEqual(task.status, status_choice)

    def test_task_mark_methods(self):
        """Test des méthodes de changement de statut"""
        task = AgentTask.objects.create(
            title="Test Task",
            prompt="Test prompt"
        )

        # Test mark_running
        task.mark_running()
        self.assertEqual(task.status, "running")
        self.assertIsNotNone(task.started_at)

        # Test mark_done
        task.mark_done("Task completed successfully")
        self.assertEqual(task.status, "done")
        self.assertEqual(task.result, "Task completed successfully")
        self.assertIsNotNone(task.finished_at)
        self.assertEqual(task.error_message, "")

        # Créer une nouvelle tâche pour tester mark_failed
        task2 = AgentTask.objects.create(
            title="Test Task 2",
            prompt="Test prompt"
        )
        task2.mark_failed("Something went wrong")
        self.assertEqual(task2.status, "failed")
        self.assertEqual(task2.error_message, "Something went wrong")
        self.assertIsNotNone(task2.finished_at)

        # Créer une nouvelle tâche pour tester mark_cancelled
        task3 = AgentTask.objects.create(
            title="Test Task 3",
            prompt="Test prompt"
        )
        task3.mark_cancelled()
        self.assertEqual(task3.status, "cancelled")
        self.assertEqual(task3.error_message, "Cancelled by user.")
        self.assertIsNotNone(task3.finished_at)

    def test_task_relationships(self):
        """Test des relations avec d'autres modèles"""
        # Test de la relation avec Agent (requested_agent)
        task = AgentTask.objects.create(
            title="Test Task",
            prompt="Test prompt",
            requested_agent=self.agent
        )
        self.assertEqual(task.requested_agent, self.agent)
        self.assertIn(task, self.agent.requested_tasks.all())

        # Test de la relation avec Agent (assigned_agent)
        task2 = AgentTask.objects.create(
            title="Test Task 2",
            prompt="Test prompt",
            assigned_agent=self.agent
        )
        self.assertEqual(task2.assigned_agent, self.agent)
        self.assertIn(task2, self.agent.assigned_tasks.all())

    def test_task_timing_fields(self):
        """Test des champs de timing"""
        now = timezone.now()
        task = AgentTask.objects.create(
            title="Timing Test Task",
            prompt="Test prompt",
            started_at=now,
            finished_at=now + timedelta(hours=1)
        )

        self.assertEqual(task.started_at, now)
        self.assertEqual(task.finished_at, now + timedelta(hours=1))
        self.assertIsNotNone(task.created_at)
        self.assertIsNotNone(task.updated_at)


class AuditLogModelTest(TestCase):
    """Tests pour le modèle AuditLog"""

    def setUp(self):
        """Configuration initiale pour chaque test"""
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.agent = Agent.objects.create(
            name="Test Agent",
            kind="sub"
        )
        self.task = AgentTask.objects.create(
            title="Test Task",
            prompt="Test prompt",
            requested_agent=self.agent
        )

    def test_audit_log_creation(self):
        """Test de création d'un log d'audit"""
        audit_log = AuditLog.objects.create(
            action="task_created",
            actor=self.user,
            task=self.task,
            metadata={"task_id": self.task.id, "source": "test"}
        )

        self.assertEqual(audit_log.action, "task_created")
        self.assertEqual(audit_log.actor, self.user)
        self.assertEqual(audit_log.task, self.task)
        self.assertEqual(audit_log.metadata["task_id"], self.task.id)
        self.assertIsNotNone(audit_log.created_at)

    def test_audit_log_without_task(self):
        """Test de création d'un log d'audit sans tâche associée"""
        audit_log = AuditLog.objects.create(
            action="user_login",
            actor=self.user,
            metadata={"ip_address": "127.0.0.1"}
        )

        self.assertEqual(audit_log.action, "user_login")
        self.assertEqual(audit_log.actor, self.user)
        self.assertIsNone(audit_log.task)
        self.assertEqual(audit_log.metadata["ip_address"], "127.0.0.1")


class WorkflowModelTest(TestCase):
    """Tests pour le modèle Workflow"""

    def setUp(self):
        """Configuration initiale pour chaque test"""
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.manager_agent = Agent.objects.create(
            name="Manager Agent",
            kind="primary",
            specialty="Management"
        )

    def test_workflow_creation(self):
        """Test de création d'un workflow"""
        workflow = Workflow.objects.create(
            title="Test Workflow",
            user=self.user,
            initial_prompt="This is a test workflow",
            manager_agent=self.manager_agent
        )

        self.assertEqual(workflow.title, "Test Workflow")
        self.assertEqual(workflow.user, self.user)
        self.assertEqual(workflow.initial_prompt, "This is a test workflow")
        self.assertEqual(workflow.manager_agent, self.manager_agent)
        self.assertEqual(workflow.status, "thinking")  # valeur par défaut
        self.assertIsNotNone(workflow.created_at)
        self.assertIsNotNone(workflow.updated_at)

    def test_workflow_status_choices(self):
        """Test que seuls les statuts de workflow valides sont acceptés"""
        for status_choice, _ in Workflow.STATUS_CHOICES:
            workflow = Workflow.objects.create(
                title=f"Workflow {status_choice}",
                user=self.user,
                initial_prompt="Test prompt",
                manager_agent=self.manager_agent,
                status=status_choice
            )
            self.assertEqual(workflow.status, status_choice)

    def test_workflow_relationships(self):
        """Test des relations du workflow"""
        workflow = Workflow.objects.create(
            title="Test Workflow",
            user=self.user,
            initial_prompt="Test prompt",
            manager_agent=self.manager_agent
        )

        # Test relation avec User
        self.assertEqual(workflow.user, self.user)
        self.assertIn(workflow, self.user.workflows.all())

        # Test relation avec Agent (manager)
        self.assertEqual(workflow.manager_agent, self.manager_agent)
        self.assertIn(workflow, self.manager_agent.managed_workflows.all())

    def test_workflow_steps_relationship(self):
        """Test de la relation avec WorkflowStep"""
        workflow = Workflow.objects.create(
            title="Test Workflow",
            user=self.user,
            initial_prompt="Test prompt",
            manager_agent=self.manager_agent
        )

        step = WorkflowStep.objects.create(
            workflow=workflow,
            step_type="analysis",
            content="Initial analysis"
        )

        self.assertEqual(step.workflow, workflow)
        self.assertIn(step, workflow.steps.all())


class ProviderCredentialModelTest(TestCase):
    """Tests pour le modèle ProviderCredential"""

    def setUp(self):
        """Configuration initiale pour chaque test"""
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_provider_credential_creation(self):
        """Test de création d'un credential de fournisseur"""
        credential = ProviderCredential.objects.create(
            user=self.user,
            provider="openai",
            api_key_encrypted="encrypted_key_here"
        )

        self.assertEqual(credential.user, self.user)
        self.assertEqual(credential.provider, "openai")
        self.assertEqual(credential.api_key_encrypted, "encrypted_key_here")
        self.assertTrue(credential.is_active)  # valeur par défaut
        self.assertIsNotNone(credential.created_at)
        self.assertIsNotNone(credential.updated_at)

    def test_provider_credential_unique_together(self):
        """Test que l'utilisateur et le fournisseur doivent être uniques ensemble"""
        ProviderCredential.objects.create(
            user=self.user,
            provider="openai",
            api_key_encrypted="first_key"
        )

        # Tenter de créer un deuxième credential pour le même utilisateur et fournisseur devrait échouer
        with self.assertRaises(Exception):
            ProviderCredential.objects.create(
                user=self.user,
                provider="openai",
                api_key_encrypted="second_key"
            )

        # Mais on devrait pouvoir créer un credential avec un autre fournisseur pour le même utilisateur
        credential2 = ProviderCredential.objects.create(
            user=self.user,
            provider="anthropic",
            api_key_encrypted="another_key"
        )
        self.assertEqual(credential2.provider, "anthropic")

    def test_provider_credential_str_representation(self):
        """Test de la représentation string du credential"""
        credential = ProviderCredential.objects.create(
            user=self.user,
            provider="test_provider",
            api_key_encrypted="test_key"
        )

        expected_str = f"{self.user.username} - test_provider"
        self.assertEqual(str(credential), expected_str)