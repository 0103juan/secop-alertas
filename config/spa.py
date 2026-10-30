"""Serving the Angular client from the same origin as the API.

WhiteNoise serves the built files (WHITENOISE_ROOT) at the site root, with long cache headers for the hashed ones.
Every other path that is not the API, the admin or an internal endpoint is a client-side route, so it gets
index.html and Angular's router takes it from there. Same origin means no CORS and a SameSite=Strict cookie works.
Without a build (tests, a backend-only checkout) the plain HTML page in templates/home.html is served instead.
"""

from functools import cache

from django.conf import settings
from django.http import HttpRequest, HttpResponse
from django.shortcuts import render


@cache
def _index() -> bytes | None:
    index = settings.FRONTEND_BUILD / "index.html"
    return index.read_bytes() if index.is_file() else None


def spa(request: HttpRequest) -> HttpResponse:
    page = _index()
    if page is None:
        return render(request, "home.html")
    response = HttpResponse(page, content_type="text/html; charset=utf-8")
    response["Cache-Control"] = "no-cache"  # index.html must be revalidated so a deploy is picked up at once
    return response
