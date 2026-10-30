import os

from django.core.wsgi import get_wsgi_application
from django.urls import resolve

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
application = get_wsgi_application()

# Import the URLconf, and with it every view, DRF and pandas/SciPy, while the container starts (gunicorn --preload
# runs this before it opens the port, so the startup probe waits for it), not on the first visitor's request.
resolve("/")
