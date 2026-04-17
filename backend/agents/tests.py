from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from django.urls import reverse

from .models import Agent


class AgentModelTest(TestCase):
    """Tests pour le modèle Agent"""

    def setUp(self):
        """Configuration initiale pour chaque test"""
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_agent_creation(self):
        """Test de création d'un agent de base"""
        agent = Agent.objects.create(
            name="Test Agent",
            specialty="Testing",
            system_prompt="You are a test agent"
        )

        self.assertEqual(agent.name, "Test Agent")
        self.assertEqual(agent.kind, "sub")  # valeur par défaut
        self.assertEqual(agent.specialty, "Testing")
        self.assertEqual(agent.system_prompt, "You are a test agent")
        self.assertTrue(agent.is_active)  # valeur par défaut
        self.assertFalse(agent.is_recruited)  # valeur par défaut

    def test_agent_str_representation(self):
        """Test de la représentation string de l'agent"""
        agent = Agent.objects.create(
            name="Test Agent",
            kind="primary"
        )

        expected_str = "Test Agent (Primary)"
        self.assertEqual(str(agent), expected_str)

    def test_agent_kind_choices(self):
        """Test que seuls les types d'agents valides sont acceptés"""
        # Test avec un type valide
        agent_valid = Agent.objects.create(
            name="Valid Agent",
            kind="primary"
        )
        self.assertEqual(agent_valid.kind, "primary")

        # Test avec l'autre type valide
        agent_valid2 = Agent.objects.create(
            name="Valid Agent 2",
            kind="sub"
        )
        self.assertEqual(agent_valid2.kind, "sub")

    def test_agent_hierarchy(self):
        """Test de la hiérarchie des agents (parent-enfant)"""
        parent_agent = Agent.objects.create(
            name="Parent Agent",
            kind="primary"
        )

        child_agent = Agent.objects.create(
            name="Child Agent",
            kind="sub",
            parent=parent_agent
        )

        self.assertEqual(child_agent.parent, parent_agent)
        self.assertIn(child_agent, parent_agent.sub_agents.all())

    def test_agent_unique_name(self):
        """Test que le nom de l'agent doit être unique"""
        Agent.objects.create(
            name="Unique Agent",
            kind="sub"
        )

        # Tenter de créer un deuxième agent avec le même nom devrait échouer
        with self.assertRaises(Exception):
            Agent.objects.create(
                name="Unique Agent",
                kind="primary"
            )


class AgentAPITest(TestCase):
    """Tests pour l'API des agents"""

    def setUp(self):
        """Configuration initiale pour chaque test"""
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)

        self.agent_data = {
            'name': 'API Test Agent',
            'kind': 'sub',
            'specialty': 'API Testing',
            'system_prompt': 'You are an API test agent'
        }

    def test_create_agent(self):
        """Test de création d'agent via l'API"""
        url = reverse('agent-list')  # Nécessite que les URLs soient nommées
        response = self.client.post(url, self.agent_data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Agent.objects.count(), 1)
        self.assertEqual(Agent.objects.get().name, 'API Test Agent')

    def test_list_agents(self):
        """Test de liste des agents via l'API"""
        # Créer quelques agents de test
        Agent.objects.create(name='Agent 1', kind='sub')
        Agent.objects.create(name='Agent 2', kind='primary')

        url = reverse('agent-list')
        response = self.client.get(url, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_retrieve_agent(self):
        """Test de récupération d'un agent spécifique via l'API"""
        agent = Agent.objects.create(
            name='Retrieve Test Agent',
            kind='sub'
        )

        url = reverse('agent-detail', kwargs={'pk': agent.pk})
        response = self.client.get(url, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Retrieve Test Agent')

    def test_update_agent(self):
        """Test de mise à jour d'un agent via l'API"""
        agent = Agent.objects.create(
            name='Original Name',
            kind='sub'
        )

        url = reverse('agent-detail', kwargs={'pk': agent.pk})
        updated_data = {
            'name': 'Updated Name',
            'kind': 'sub',
            'specialty': 'Updated Specialty'
        }

        response = self.client.put(url, updated_data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        agent.refresh_from_db()
        self.assertEqual(agent.name, 'Updated Name')
        self.assertEqual(agent.specialty, 'Updated Specialty')

    def test_delete_agent(self):
        """Test de suppression d'un agent via l'API"""
        agent = Agent.objects.create(
            name='To Delete Agent',
            kind='sub'
        )

        url = reverse('agent-detail', kwargs={'pk': agent.pk})
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Agent.objects.count(), 0)

    def test_unauthenticated_access_denied(self):
        """Test que l'accès non authentifié est refusé"""
        self.client.force_authenticate(user=None)  # Déauthentifier

        url = reverse('agent-list')
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)