from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

api_v1 = [
    path("", include("accounts.urls")),
    path("", include("contracts.urls")),
    path("", include("alerts.urls")),
    path("", include("analytics.urls")),
]

urlpatterns = [
    path("", TemplateView.as_view(template_name="home.html"), name="home"),
    path("api/v1/", include(api_v1)),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("", include("events.urls")),
    path("admin/", admin.site.urls),
]
