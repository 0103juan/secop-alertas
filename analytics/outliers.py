"""Contracts whose value is far from what is usual for contracts of the same kind.

Contract values span six orders of magnitude and are heavily skewed, so the mean and standard deviation are pulled
by the very values we want to find. Instead, per (modality, contract type):

- work on log10(value), where the spread is roughly symmetric;
- centre on the median and scale by the median absolute deviation (scipy, scaled to match a normal's sigma);
- flag |modified z| > 3.5, the cut-off Iglewicz and Hoaglin recommend.

A group with fewer than `min_group` contracts has no meaningful "usual" and is skipped. One pass of grouping plus
a median per group: O(n log n).
"""

import numpy as np
import pandas as pd
from scipy import stats

CUTOFF = 3.5


def find_outliers(frame: pd.DataFrame, min_group: int = 30, cutoff: float = CUTOFF) -> pd.DataFrame:
    frame = frame.dropna(subset=["value_cop"])
    frame = frame[frame["value_cop"] > 0].copy()
    if frame.empty:
        return frame.assign(z=[], group_median_cop=[])
    frame["log_value"] = np.log10(frame["value_cop"].astype(float))
    keys = ["modality", "contract_type"]
    grouped = frame.groupby(keys)["log_value"]
    frame["group_size"] = grouped.transform("size")
    frame["median"] = grouped.transform("median")
    frame["mad"] = grouped.transform(lambda s: stats.median_abs_deviation(s, scale="normal"))
    frame = frame[(frame["group_size"] >= min_group) & (frame["mad"] > 0)]
    frame["z"] = (frame["log_value"] - frame["median"]) / frame["mad"]
    frame["group_median_cop"] = np.round(10 ** frame["median"]).astype(np.int64)
    flagged = frame[frame["z"].abs() > cutoff]
    return flagged.sort_values("z", key=np.abs, ascending=False).drop(columns=["log_value", "median", "mad"])
