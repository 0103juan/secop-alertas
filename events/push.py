"""The receiving end of the Pub/Sub push subscription.

Cloud Run's URL is public, so anyone could post here. Pub/Sub signs every push with a Google-issued OIDC token
for a service account we chose; the view accepts the call only if that token is valid, meant for this service
(audience) and issued to that account.
"""

import base64
import binascii
import json
import logging

from django.conf import settings
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from .bus import Event, dispatch

log = logging.getLogger(__name__)


def verify_push_token(authorization: str) -> dict:
    scheme, _, token = authorization.partition(" ")
    if scheme != "Bearer" or not token:
        raise PermissionError("missing bearer token")
    claims = id_token.verify_oauth2_token(token, google_requests.Request(), audience=settings.PUBSUB_PUSH_AUDIENCE)
    if claims.get("email") != settings.PUBSUB_PUSH_SERVICE_ACCOUNT or not claims.get("email_verified"):
        raise PermissionError("token was not issued to the push service account")
    return claims


@csrf_exempt
@require_POST
def pubsub_push(request: HttpRequest) -> HttpResponse:
    if not settings.PUBSUB_PUSH_AUDIENCE or not settings.PUBSUB_PUSH_SERVICE_ACCOUNT:
        return JsonResponse({"error": "push endpoint is not configured"}, status=404)
    try:
        verify_push_token(request.headers.get("Authorization", ""))
    except (PermissionError, ValueError) as error:  # google-auth raises ValueError for bad signatures and expiry
        log.warning("rejected push: %s", error)
        return JsonResponse({"error": "unauthorized"}, status=401)

    try:
        message = json.loads(request.body)["message"]
        event = Event.from_bytes(base64.b64decode(message["data"]))
    except (KeyError, ValueError, binascii.Error):
        # A malformed message will never get better; 204 acknowledges it instead of letting it loop forever.
        log.error("dropped malformed push body")
        return HttpResponse(status=204)

    dispatch(event)  # an exception here becomes a 500 and Pub/Sub retries with backoff
    return HttpResponse(status=204)
