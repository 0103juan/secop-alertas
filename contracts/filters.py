from django.contrib.postgres.search import SearchQuery, SearchVector
from django_filters import rest_framework as filters

from .models import Contract


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
        # The same expression as the GIN index, so Postgres can use it.
        return queryset.annotate(document=SearchVector("object", config="spanish")).filter(
            document=SearchQuery(value, config="spanish", search_type="websearch")
        )
