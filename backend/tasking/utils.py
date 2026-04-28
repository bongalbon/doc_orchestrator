import os
import base64
import hashlib
import logging
from cryptography.fernet import Fernet
from django.conf import settings

logger = logging.getLogger(__name__)

class KeyEncryption:
    """
    Service de chiffrement pour les clés API.
    Utilise DJANGO_ENCRYPTION_KEY si disponible, sinon se replie sur SECRET_KEY.
    """
    @staticmethod
    def _get_fernet():
        # Utiliser une clé dédiée en priorité pour découpler de la SECRET_KEY Django
        master_key = os.getenv("DJANGO_ENCRYPTION_KEY", settings.SECRET_KEY)
        key_source = master_key.encode()
        # Dérivation déterministe d'une clé de 32 octets pour Fernet
        key_32 = hashlib.sha256(key_source).digest()
        key_base64 = base64.urlsafe_b64encode(key_32)
        return Fernet(key_base64)

    @classmethod
    def encrypt(cls, plain_text: str) -> str:
        if not plain_text:
            return ""
        try:
            f = cls._get_fernet()
            return f.encrypt(plain_text.encode()).decode()
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise ValueError("Erreur lors du chiffrement des données sensibles.")

    @classmethod
    def decrypt(cls, encrypted_text: str) -> str:
        if not encrypted_text:
            return ""
        try:
            f = cls._get_fernet()
            return f.decrypt(encrypted_text.encode()).decode()
        except Exception as e:
            logger.warning(f"Decryption failed: {e} - encrypted_text length: {len(encrypted_text)}")
            return "ERROR_DECRYPTION_FAILED"
