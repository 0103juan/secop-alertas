from rest_framework.routers import SimpleRouter

from .views import AlertViewSet, SubscriptionViewSet

router = SimpleRouter()
router.register("subscriptions", SubscriptionViewSet, basename="subscription")
router.register("alerts", AlertViewSet, basename="alert")

urlpatterns = router.urls
