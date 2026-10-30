from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework import viewsets
from rest_framework.permissions import AllowAny

from .filters import ContractFilter
from .models import Contract
from .serializers import ContractSerializer


@method_decorator(cache_page(60), name="list")
class ContractViewSet(viewsets.ReadOnlyModelViewSet):
    """Public and read-only. Cursor pagination keeps deep pages as cheap as the first one: it seeks on the
    (signed_on, id) index instead of scanning and discarding OFFSET rows."""

    queryset = Contract.objects.all()
    serializer_class = ContractSerializer
    filterset_class = ContractFilter
    ordering_fields = ["signed_on", "value_cop"]
    ordering = ["-signed_on", "id"]
    permission_classes = [AllowAny]
