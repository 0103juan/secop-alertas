from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from alerts.api import AlertViewSet, RegisterView, SubscriptionViewSet
from analytics.api import OutliersView, SplittingView
from contracts.api import ContractViewSet
from events.views import pubsub_push

router = DefaultRouter()
router.register("contracts", ContractViewSet)
router.register("subscriptions", SubscriptionViewSet, basename="subscription")
router.register("alerts", AlertViewSet, basename="alert")


api_v1 = [
    path("", include(router.urls)),
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/token/", TokenObtainPairView.as_view(), name="token"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("analytics/splitting/", SplittingView.as_view(), name="splitting"),
    path("analytics/outliers/", OutliersView.as_view(), name="outliers"),
]

urlpatterns = [
    path("", TemplateView.as_view(template_name="home.html"), name="home"),
    path("api/v1/", include(api_v1)),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("internal/events/pubsub", pubsub_push, name="pubsub-push"),
    path("admin/", admin.site.urls),
]
