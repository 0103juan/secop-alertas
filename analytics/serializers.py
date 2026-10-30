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
