"""Read-only analytics over the loaded contracts. Results are cached by their parameters: the data changes once a
day, and each reading scans a whole department."""

import hashlib
import json

import pandas as pd
from django.core.cache import cache
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from contracts.models import Contract

from .outliers import find_outliers
from .splitting import COLUMNS, find_clusters

MAX_ROWS = 200_000


class ScopeSerializer(serializers.Serializer):
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


def load_frame(params: dict, columns: list[str]) -> pd.DataFrame:
    queryset = Contract.objects.filter(department__iexact=params["department"])
    if params.get("signed_after"):
        queryset = queryset.filter(signed_on__date__gte=params["signed_after"])
    if params.get("entity_nit"):
        queryset = queryset.filter(entity_nit=params["entity_nit"])
    rows = list(queryset.values_list(*columns)[:MAX_ROWS])
    frame = pd.DataFrame(rows, columns=columns)
    if "signed_on" in frame:
        frame["signed_on"] = pd.to_datetime(frame["signed_on"], utc=True)
    return frame


def cached(prefix: str, params: dict, compute):
    key = prefix + hashlib.sha256(json.dumps(params, sort_keys=True, default=str).encode()).hexdigest()
    result = cache.get(key)
    if result is None:
        result = compute()
        cache.set(key, result, timeout=600)
    return result


class SplittingView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(parameters=[SplittingParams])
    def get(self, request):
        params = SplittingParams(data=request.query_params)
        params.is_valid(raise_exception=True)
        p = params.validated_data

        def compute():
            clusters = find_clusters(load_frame(p, COLUMNS), p["threshold_cop"], p["window_days"], p["min_contracts"])
            return [
                {
                    **c.__dict__,
                    "contract_ids": list(c.contract_ids),
                    "contracts": len(c.contract_ids),
                    "first_signed": c.first_signed.isoformat(),
                    "last_signed": c.last_signed.isoformat(),
                }
                for c in clusters[:200]
            ]

        return Response({"params": p, "clusters": cached("split:", p, compute)})


class OutliersView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(parameters=[OutlierParams])
    def get(self, request):
        params = OutlierParams(data=request.query_params)
        params.is_valid(raise_exception=True)
        p = params.validated_data
        columns = ["id", "entity", "object", "modality", "contract_type", "value_cop", "url"]

        def compute():
            flagged = find_outliers(load_frame(p, columns), min_group=p["min_group"]).head(p["limit"])
            flagged = flagged.assign(z=flagged["z"].round(2))
            return json.loads(flagged.to_json(orient="records", force_ascii=False))

        return Response({"params": p, "outliers": cached("outl:", p, compute)})
