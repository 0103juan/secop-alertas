from django.db import connection
from django.http import JsonResponse


class HealthCheckMiddleware:
    """Answers the platform's probes before anything else runs.

    Cloud Run probes the container from inside the instance with `Host: 127.0.0.1`. Host validation (rightly)
    rejects that, so the probes are answered here, first in the chain, and every other request still goes through
    ALLOWED_HOSTS.

    - `/healthz` is liveness: the process serves requests. It does not touch the database, so a Postgres hiccup does
      not get every instance restarted at once.
    - `/readyz` is readiness: the database answers too.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == "/healthz":
            return JsonResponse({"status": "ok"})
        if request.path == "/readyz":
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT 1")
            except Exception as error:  # any driver error means "not ready"; the probe only needs the status code
                return JsonResponse({"status": "unavailable", "error": type(error).__name__}, status=503)
            return JsonResponse({"status": "ok"})
        return self.get_response(request)
