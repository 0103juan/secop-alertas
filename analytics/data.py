"""Loading the rows a reading needs, and caching what it computes."""

import hashlib
import json
from collections.abc import Callable
from datetime import datetime, time

import pandas as pd
from django.core.cache import cache
from django.utils.timezone import get_default_timezone

from contracts.models import Contract

MAX_ROWS = 200_000  # about 60 MB of DataFrame for the widest reading; above that it belongs in a batch job
CACHE_SECONDS = 600  # the data changes once a day; ten minutes bounds how stale a reading can be after a load


def load_frame(params: dict, columns: list[str]) -> tuple[pd.DataFrame, bool]:
    """Returns the rows and whether MAX_ROWS cut them short, so the response can say so instead of hiding it.

    Only the needed columns are fetched (`values_list`), straight into tuples: no model instances are built, which is
    most of the cost of reading 36,000 rows through the ORM.
    """
    queryset = Contract.objects.filter(department__iexact=params["department"])  # contract_department_signed
    if params.get("signed_after"):
        # A comparison on the column, not `signed_on__date`: wrapping the column in DATE() would hide it from the index.
        start = datetime.combine(params["signed_after"], time.min, tzinfo=get_default_timezone())
        queryset = queryset.filter(signed_on__gte=start)
    if params.get("entity_nit"):
        queryset = queryset.filter(entity_nit=params["entity_nit"])  # contract_entity_signed
    rows = list(queryset.values_list(*columns)[: MAX_ROWS + 1])
    truncated = len(rows) > MAX_ROWS
    frame = pd.DataFrame(rows[:MAX_ROWS], columns=columns)
    if "signed_on" in frame:
        frame["signed_on"] = pd.to_datetime(frame["signed_on"], utc=True)
    return frame, truncated


def cached(prefix: str, params: dict, compute: Callable[[], dict]) -> dict:
    key = prefix + hashlib.sha256(json.dumps(params, sort_keys=True, default=str).encode()).hexdigest()
    result = cache.get(key)
    if result is None:
        result = compute()
        cache.set(key, result, timeout=CACHE_SECONDS)
    return result
