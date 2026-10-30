from rest_framework import serializers


class ScopeSerializer(serializers.Serializer):
    """Which contracts a reading runs over. Department is required: a reading over the whole country is a batch
    job, not a request."""

    department = serializers.CharField()
    signed_after = serializers.DateField(required=False)
    entity_nit = serializers.IntegerField(required=False)


class SplittingParams(ScopeSerializer):
    threshold_cop = serializers.IntegerField(min_value=1_000_000, default=50_000_000)
    window_days = serializers.IntegerField(min_value=1, max_value=365, default=30)
    min_contracts = serializers.IntegerField(min_value=2, max_value=50, default=2)


class OutlierParams(ScopeSerializer):
    min_group = serializers.IntegerField(min_value=10, default=30)
    limit = serializers.IntegerField(min_value=1, max_value=500, default=50)


# Response shapes, for the OpenAPI document (the views build plain dicts, cached as they are).
class ClusterSerializer(serializers.Serializer):
    entity_nit = serializers.IntegerField()
    entity = serializers.CharField()
    supplier = serializers.CharField()
    contract_ids = serializers.ListField(child=serializers.CharField())
    contracts = serializers.IntegerField()
    first_signed = serializers.DateTimeField()
    last_signed = serializers.DateTimeField()
    total_cop = serializers.IntegerField()
    largest_cop = serializers.IntegerField()


class SplittingResponseSerializer(serializers.Serializer):
    params = SplittingParams()
    truncated = serializers.BooleanField(help_text="True when MAX_ROWS cut the input short")
    total = serializers.IntegerField(help_text="Clusters found; at most 200 are returned")
    clusters = ClusterSerializer(many=True)


class OutlierSerializer(serializers.Serializer):
    id = serializers.CharField()
    entity = serializers.CharField()
    object = serializers.CharField()
    modality = serializers.CharField()
    contract_type = serializers.CharField()
    value_cop = serializers.IntegerField()
    url = serializers.CharField()
    group_size = serializers.IntegerField()
    z = serializers.FloatField(help_text="Modified z-score on log10(value); |z| > 3.5 is flagged")
    group_median_cop = serializers.IntegerField()


class OutliersResponseSerializer(serializers.Serializer):
    params = OutlierParams()
    truncated = serializers.BooleanField()
    outliers = OutlierSerializer(many=True)
