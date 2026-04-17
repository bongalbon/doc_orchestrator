# Guide de test pour Doc Orchestrator

## Exécution des tests

Ce projet utilise le framework de test intégré de Django.

### Exécuter tous les tests

```bash
# Depuis la racine du projet
cd backend
python manage.py test
```

### Exécuter des tests spécifiques

```bash
# Tests des agents uniquement
python manage.py test agents

# Tests du tasking uniquement
python manage.py test tasking

# Tests d'une classe de test spécifique
python manage.py test agents.AgentModelTest

# Tests d'une méthode de test spécifique
python manage.py test agents.AgentModelTest.test_agent_creation
```

### Couverture de tests

Pour obtenir un rapport de couverture de tests (nécessite l'installation de `coverage`):

```bash
# Installation de l'outil de couverture
pip install coverage

# Exécution des tests avec couverture
coverage run manage.py test

# Génération du rapport
coverage report

# Pour un rapport HTML détaillé
coverage html
# Puis ouvrez htmlcov/index.html dans votre navigateur
```

## Conventions de test suivies

1. **Organization** : Un fichier de tests par application (`agents/tests.py`, `tasking/tests.py`)
2. **Nommage** : Les classes de tests portent le nom du modèle qu'elles testent suivi de "Test"
3. **Méthodes de test** : Chaque méthode teste un aspect spécifique et commence par "test_"
4. **setUp()** : Utilisé pour préparer les données communes à plusieurs tests
5. **Isolation** : Chaque test doit être indépendant et laisser la base de données dans l'état où il l'a trouvée

## Bonnes pratiques observées

- Tests unitaires pour les modèles (comportement, relations, contraintes)
- Tests d'intégration pour les API (vérification des réponses HTTP)
- Utilisation de jeux de données de test réalistes mais simples
- Vérification explicite des valeurs attendues plutôt que des déductions
- Tests des cas limites et des valeurs par défaut
- Tests des relations entre modèles
- Tests des méthodes personnalisées du modèle

## À venir

À mesure que le projet évolue, considérez l'ajout de :

1. Tests de bout en bout pour les flux utilisateur critiques
2. Tests de performance pour les opérations potentiellement lourdes
3. Tests de sécurité pour vérifier l'absence de vulnérabilités courantes
4. Tests de la logique métier complexe (algorithmes de délégation, scoring, etc.)