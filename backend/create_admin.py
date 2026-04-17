import os
import django

# Configuration de l'environnement Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "orchestrator_backend.settings")
django.setup()

from django.contrib.auth.models import User, Group

def create_admin():
    username = 'admin'
    password = 'admin'
    
    u, created = User.objects.get_or_create(username=username)
    u.set_password(password)
    u.is_superuser = True
    u.is_staff = True
    u.save()
    
    # S'assurer que le groupe 'manager' existe et l'assigner
    group, _ = Group.objects.get_or_create(name='manager')
    u.groups.add(group)
    
    if created:
        print(f"Utilisateur '{username}' créé avec succès.")
    else:
        print(f"Utilisateur '{username}' mis à jour avec succès.")

if __name__ == "__main__":
    create_admin()
