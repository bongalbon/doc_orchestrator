import os
from cryptography.fernet import Fernet
from django.conf import settings
import base64
import hashlib

class KeyEncryption:
    @staticmethod
    def _get_fernet():
        # Derive a 32-byte key from Django's SECRET_KEY
        key_source = settings.SECRET_KEY.encode()
        key_32 = hashlib.sha256(key_source).digest()
        key_base64 = base64.urlsafe_b64encode(key_32)
        return Fernet(key_base64)

    @classmethod
    def encrypt(cls, plain_text: str) -> str:
        if not plain_text:
            return ""
        f = cls._get_fernet()
        return f.encrypt(plain_text.encode()).decode()

    @classmethod
    def decrypt(cls, encrypted_text: str) -> str:
        if not encrypted_text:
            return ""
        try:
            f = cls._get_fernet()
            return f.decrypt(encrypted_text.encode()).decode()
        except Exception:
            return "ERROR_DECRYPTION_FAILED"
