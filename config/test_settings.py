"""Settings for the test suite: the real ones, with a throwaway key and a fast password hasher."""

import os

os.environ.setdefault("SECRET_KEY", "test-only-key-0123456789-abcdefghijklmnopqrstuvwxyz")

from config.settings import *  # noqa: E402, F403

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # PBKDF2 costs ~0.3 s per user; tests make many
