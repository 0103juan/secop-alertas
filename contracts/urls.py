from rest_framework.routers import SimpleRouter

from .views import ContractViewSet

router = SimpleRouter()
router.register("contracts", ContractViewSet)

urlpatterns = router.urls
