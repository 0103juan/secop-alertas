import random
from datetime import UTC, datetime, timedelta

import numpy as np
import pandas as pd

from analytics.outliers import find_outliers
from analytics.splitting import COLUMNS, brute_force, find_clusters

from .conftest import make_contract

DAY0 = datetime(2026, 1, 1, tzinfo=UTC)


def frame(rows):
    df = pd.DataFrame(rows, columns=COLUMNS)
    df["signed_on"] = pd.to_datetime(df["signed_on"], utc=True)
    return df


def row(id_, day, value, nit=1, doc="A"):
    return (id_, nit, "Entidad", doc, "Proveedor " + doc, DAY0 + timedelta(days=day), value)


def test_three_contracts_in_a_month_that_add_up_to_the_threshold():
    rows = [row("a", 0, 20), row("b", 10, 20), row("c", 29, 10), row("d", 90, 40)]
    clusters = find_clusters(frame(rows), threshold=50, window_days=30)
    assert [c.contract_ids for c in clusters] == [("a", "b", "c")]
    assert clusters[0].total_cop == 50 and clusters[0].largest_cop == 20


def test_boundaries_window_is_inclusive_and_contracts_at_the_threshold_do_not_count():
    assert find_clusters(frame([row("a", 0, 30), row("b", 30, 30)]), 50, 30)  # exactly 30 days apart
    assert not find_clusters(frame([row("a", 0, 30), row("b", 31, 30)]), 50, 30)
    assert not find_clusters(frame([row("a", 0, 50), row("b", 1, 10)]), 50, 30)  # 50 is not below 50


def test_other_entities_and_suppliers_do_not_mix():
    rows = [row("a", 0, 30, doc="A"), row("b", 1, 30, doc="B"), row("c", 2, 30, nit=2, doc="A")]
    assert find_clusters(frame(rows), 50, 30) == []


def test_matches_the_quadratic_reference_on_random_data():
    rng = random.Random(11)
    for _ in range(30):
        rows = [
            row(f"c{i}", rng.randint(0, 200), rng.randint(1, 60), nit=rng.randint(1, 3), doc=rng.choice("ABC"))
            for i in range(rng.randint(0, 80))
        ]
        df = frame(rows)
        threshold, window = rng.choice([40, 80, 120]), rng.choice([7, 30, 60])
        assert {c.contract_ids for c in find_clusters(df, threshold, window)} == brute_force(df, threshold, window)


def test_outliers_are_found_on_a_log_scale_per_group():
    rng = np.random.default_rng(3)
    values = np.round(10 ** rng.normal(7, 0.2, 200)).astype(int).tolist()  # around 10 million
    rows = [
        {"id": f"n{i}", "modality": "Directa", "contract_type": "Servicios", "value_cop": v}
        for i, v in enumerate(values)
    ]
    rows += [
        {"id": "huge", "modality": "Directa", "contract_type": "Servicios", "value_cop": 9_000_000_000},
        {"id": "tiny", "modality": "Directa", "contract_type": "Servicios", "value_cop": 50_000},
        {"id": "alone", "modality": "Licitación", "contract_type": "Obra", "value_cop": 9_000_000_000},
    ]
    flagged = find_outliers(pd.DataFrame(rows), min_group=30)
    assert set(flagged["id"]) == {"huge", "tiny"}  # "alone" has no group to compare with
    assert flagged.iloc[0]["id"] == "huge" and flagged.iloc[0]["z"] > 3.5


def test_splitting_endpoint_reads_the_database(api, contract):
    for day in (0, 5, 12):
        contract(signed_on=DAY0 + timedelta(days=day), value_cop=20_000_000, supplier_doc="777")
    contract(signed_on=DAY0, value_cop=20_000_000, supplier_doc="888")
    body = api.get("/api/v1/analytics/splitting/", {"department": "cauca", "threshold_cop": 50_000_000}).json()
    assert len(body["clusters"]) == 1
    cluster = body["clusters"][0]
    assert cluster["contracts"] == 3 and cluster["total_cop"] == 60_000_000 and "supplier_doc" not in cluster


def test_analytics_validate_their_parameters(api, db):
    response = api.get("/api/v1/analytics/splitting/", {"department": "Cauca", "window_days": 0})
    assert response.status_code == 400 and "window_days" in response.json()
    assert api.get("/api/v1/analytics/outliers/").status_code == 400  # department is required


def test_contracts_search_filters_and_hides_the_supplier_document(api, contract):
    make_contract(object="Construcción del puente sobre el río Cauca", value_cop=900_000_000)
    make_contract(object="Suministro de papelería", value_cop=1_000_000)
    body = api.get("/api/v1/contracts/", {"q": "puentes", "min_value": 100_000_000}).json()
    assert [c["object"] for c in body["results"]] == ["Construcción del puente sobre el río Cauca"]
    assert "supplier_doc" not in body["results"][0] and "next" in body


def test_a_contract_is_found_by_its_secop_id_which_has_dots(api, contract):
    found = make_contract(id="CO1.PCCNTR.9025726")
    body = api.get(f"/api/v1/contracts/{found.id}/").json()
    assert body["id"] == "CO1.PCCNTR.9025726" and "supplier_doc" not in body
