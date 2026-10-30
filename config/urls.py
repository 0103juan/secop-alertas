from django.contrib import admin
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from .spa import spa

api_v1 = [
    path("", include("accounts.urls")),
    path("", include("contracts.urls")),
    path("", include("alerts.urls")),
    path("", include("analytics.urls")),
]

urlpatterns = [
    path("api/v1/", include(api_v1)),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("", include("events.urls")),
    path("admin/", admin.site.urls),
    # Everything else is a route of the Angular client, except missing asset files: a missing bundle must be a 404, not
    # index.html with a 200 that the browser then fails to run. Only asset extensions count: SECOP ids have dots too.
    re_path(
        r"^(?!api/|admin/|static/|internal/)(?!.*\.(?:js|mjs|css|map|ico|png|svg|jpe?g|webp|woff2?|txt|json)/?$).*$",
        spa,
        name="home",
    ),
]
