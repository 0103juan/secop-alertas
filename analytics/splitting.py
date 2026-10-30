"""Possible contract splitting ("fraccionamiento"): one entity signs several contracts with the same supplier within a
short window, each below a threshold, that together reach it. Splitting a purchase to stay under a procurement
threshold is what the law forbids; this only finds the pattern in the data, it does not decide intent.

Algorithm, for n contracts:

1. Sort by (entity, supplier, date): O(n log n).
2. Inside each group the dates are sorted, so for every contract i the last contract within `window_days` is found
   by binary search (`np.searchsorted`): O(log n) each, all n at once over a packed (group, time) key.
3. The sum of any run i..j is a difference of prefix sums: O(1).
4. Runs are reported only when maximal, i.e. not contained in the run reported before, so one burst of contracts
   comes out once and not once per starting contract.

Total O(n log n) time and O(n) memory, against O(n^2) for comparing every pair. `brute_force` below is that
quadratic version; the tests run both on random data and require the same answer.
"""

from dataclasses import dataclass
from datetime import datetime

import numpy as np
import pandas as pd

# ponytail: the packed key fits 900,000 (entity, supplier) groups over 300 years in an int64; past that, sort by
# (group, date) with np.lexsort and search per group.
GROUP_SPAN = 10**13  # milliseconds, about 317 years
MAX_GROUPS = 900_000

COLUMNS = ["id", "entity_nit", "entity", "supplier_doc", "supplier", "signed_on", "value_cop"]


@dataclass(frozen=True)
class Cluster:
    entity_nit: int
    entity: str
    supplier: str
    contract_ids: tuple[str, ...]
    first_signed: datetime
    last_signed: datetime
    total_cop: int
    largest_cop: int


def find_clusters(frame: pd.DataFrame, threshold: int, window_days: int, min_contracts: int = 2) -> list[Cluster]:
    frame = frame.dropna(subset=["entity_nit", "supplier_doc", "signed_on", "value_cop"])
    frame = frame[(frame["value_cop"] > 0) & (frame["value_cop"] < threshold) & (frame["supplier_doc"] != "")]
    if frame.empty:
        return []
    frame = frame.sort_values(["entity_nit", "supplier_doc", "signed_on", "id"], kind="stable").reset_index(drop=True)

    # One sorted key for every group at once: group number in the high digits, milliseconds in the low ones. A
    # window never crosses into the next group, so one searchsorted over all n rows replaces a loop over groups.
    group = frame.groupby(["entity_nit", "supplier_doc"], sort=False).ngroup().to_numpy(dtype=np.int64)
    millis = frame["signed_on"].to_numpy(dtype="datetime64[ms]").astype(np.int64)
    millis -= millis.min()
    if group[-1] >= MAX_GROUPS or millis.max() >= GROUP_SPAN:
        raise ValueError("too many groups or too long a period for the packed key")
    key = group * GROUP_SPAN + millis
    ends = np.searchsorted(key, key + window_days * 86_400_000, side="right")  # one past the window, inclusive
    starts = np.arange(len(key))
    prefix = np.concatenate(([0], np.cumsum(frame["value_cop"].to_numpy(dtype=np.int64))))

    qualifies = (ends - starts >= min_contracts) & (prefix[ends] - prefix[starts] >= threshold)
    candidates = starts[qualifies]
    # ends never decrease inside a group, so a run is contained in the one reported before it exactly when it is in
    # the same group and has the same end. Keep the first of each.
    candidate_ends, candidate_groups = ends[candidates], group[candidates]
    first = np.ones(len(candidates), dtype=bool)
    first[1:] = (candidate_ends[1:] != candidate_ends[:-1]) | (candidate_groups[1:] != candidate_groups[:-1])

    clusters = [_cluster(frame.iloc[s:e]) for s, e in zip(candidates[first], candidate_ends[first], strict=True)]
    return sorted(clusters, key=lambda c: -c.total_cop)


def _cluster(rows: pd.DataFrame) -> Cluster:
    first = rows.iloc[0]
    return Cluster(
        entity_nit=int(first["entity_nit"]),
        entity=first["entity"],
        supplier=first["supplier"],
        contract_ids=tuple(rows["id"]),
        first_signed=rows["signed_on"].iloc[0].to_pydatetime(),
        last_signed=rows["signed_on"].iloc[-1].to_pydatetime(),
        total_cop=int(rows["value_cop"].sum()),
        largest_cop=int(rows["value_cop"].max()),
    )


def brute_force(frame: pd.DataFrame, threshold: int, window_days: int, min_contracts: int = 2) -> set[tuple[str, ...]]:
    """The O(n^2) reference: for each contract, scan forward over every later one. Only for tests."""
    frame = frame.dropna(subset=["entity_nit", "supplier_doc", "signed_on", "value_cop"])
    frame = frame[(frame["value_cop"] > 0) & (frame["value_cop"] < threshold) & (frame["supplier_doc"] != "")]
    frame = frame.sort_values(["entity_nit", "supplier_doc", "signed_on", "id"], kind="stable")
    found = set()
    for _, group in frame.groupby(["entity_nit", "supplier_doc"], sort=False):
        rows = list(group.itertuples(index=False))
        reported_end = 0
        for i, row in enumerate(rows):
            j = i
            while j < len(rows) and rows[j].signed_on - row.signed_on <= pd.Timedelta(days=window_days):
                j += 1
            if j <= reported_end:
                continue
            if j - i >= min_contracts and sum(r.value_cop for r in rows[i:j]) >= threshold:
                found.add(tuple(r.id for r in rows[i:j]))
                reported_end = j
    return found
