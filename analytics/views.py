"""Read-only readings over the loaded contracts. They describe patterns; they do not judge any entity."""

import json
from dataclasses import asdict

from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .data import cached, load_frame
from .outliers import find_outliers
from .serializers import OutlierParams, OutliersResponseSerializer, SplittingParams, SplittingResponseSerializer
from .splitting import COLUMNS, find_clusters

MAX_CLUSTERS = 200
OUTLIER_COLUMNS = ["id", "entity", "object", "modality", "contract_type", "value_cop", "url"]


class SplittingView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(parameters=[SplittingParams], responses=SplittingResponseSerializer)
    def get(self, request):
        params = SplittingParams(data=request.query_params)
        params.is_valid(raise_exception=True)
        p = params.validated_data

        def compute():
            frame, truncated = load_frame(p, COLUMNS)
            clusters = find_clusters(frame, p["threshold_cop"], p["window_days"], p["min_contracts"])
            return {
                "truncated": truncated,
                "total": len(clusters),
                "clusters": [
                    {**asdict(c), "contract_ids": list(c.contract_ids), "contracts": len(c.contract_ids),
                     "first_signed": c.first_signed.isoformat(), "last_signed": c.last_signed.isoformat()}
                    for c in clusters[:MAX_CLUSTERS]
                ],
            }  # fmt: skip

        return Response({"params": p, **cached("split:", p, compute)})


class OutliersView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(parameters=[OutlierParams], responses=OutliersResponseSerializer)
    def get(self, request):
        params = OutlierParams(data=request.query_params)
        params.is_valid(raise_exception=True)
        p = params.validated_data

        def compute():
            frame, truncated = load_frame(p, OUTLIER_COLUMNS)
            flagged = find_outliers(frame, min_group=p["min_group"]).head(p["limit"])
            flagged = flagged.assign(z=flagged["z"].round(2))
            return {
                "truncated": truncated,
                "outliers": json.loads(flagged.to_json(orient="records", force_ascii=False)),
            }

        return Response({"params": p, **cached("outl:", p, compute)})
