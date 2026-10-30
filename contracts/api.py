from django.contrib.postgres.search import SearchQuery, SearchVector
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django_filters import rest_framework as filters
from rest_framework import serializers, viewsets
from rest_framework.permissions import AllowAny

from .models import Contract


class ContractSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contract
        exclude = ["supplier_doc"]  # used to group, never shown


class ContractFilter(filters.FilterSet):
    q = filters.CharFilter(method="search", label="Full-text search over the object (Spanish)")
    signed_after = filters.IsoDateTimeFilter(field_name="signed_on", lookup_expr="gte")
    signed_before = filters.IsoDateTimeFilter(field_name="signed_on", lookup_expr="lt")
    min_value = filters.NumberFilter(field_name="value_cop", lookup_expr="gte")
    max_value = filters.NumberFilter(field_name="value_cop", lookup_expr="lte")
    department = filters.CharFilter(field_name="department", lookup_expr="iexact")
    modality = filters.CharFilter(field_name="modality", lookup_expr="iexact")

    class Meta:
        model = Contract
        fields = ["entity_nit", "department", "modality", "status"]

    def search(self, queryset, name, value):
        # The expression is the same as the GIN index's, so Postgres can use the index.
        return queryset.annotate(document=SearchVector("object", config="spanish")).filter(
            document=SearchQuery(value, config="spanish", search_type="websearch")
        )


@method_decorator(cache_page(60), name="list")
class ContractViewSet(viewsets.ReadOnlyModelViewSet):
    """Public, read-only. Cursor pagination keeps deep pages as cheap as the first one (no OFFSET scans)."""

    queryset = Contract.objects.all()
    serializer_class = ContractSerializer
    filterset_class = ContractFilter
    ordering_fields = ["signed_on", "value_cop"]
    ordering = ["-signed_on", "id"]
    permission_classes = [AllowAny]
