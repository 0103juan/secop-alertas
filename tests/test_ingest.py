from datetime import UTC, datetime

import httpx
import pytest

from contracts.events import CONTRACTS_CHANGED
from contracts.ingestion import ContractIngestor
from contracts.models import Contract, IngestCursor
from contracts.sources import SocrataSource, parse_row
from events.models import OutboxEvent


def raw(id_, updated="2026-03-01T10:00:00.000", value="1000", **extra):
    return {
        "id_contrato": id_,
        "nombre_entidad": "Gobernación del Cauca",
        "nit_entidad": "891580016",
        "departamento": "Cauca",
        "objeto_del_contrato": "Suministro de alimentos",
        "valor_del_contrato": value,
        "documento_proveedor": "123",
        "proveedor_adjudicado": "Proveedor",
        "fecha_de_firma": "2026-02-01T08:00:00",
        "ultima_actualizacion": updated,
        "urlproceso": {"url": "https://example.org"},
        **extra,
    }


class ListSource:
    def __init__(self, *pages):
        self.pages_ = [[parse_row(r) for r in page] for page in pages]
        self.asked_since = []

    def pages(self, where, since):
        self.asked_since.append(since)
        yield from self.pages_


class Recorder:
    def __init__(self):
        self.events = []

    def publish(self, event):
        self.events.append(event)


def test_parse_row_cleans_numbers_and_skips_rows_without_object():
    row = parse_row(raw("A", value="1.5e6", nit_entidad="no reporta"))
    assert row.value_cop == 1_500_000 and row.entity_nit is None and row.url == "https://example.org"
    assert row.signed_on.utcoffset() is not None  # naive Bogotá time made aware
    assert parse_row(raw("B", objeto_del_contrato="  ")) is None
    assert parse_row({"objeto_del_contrato": "x"}) is None


@pytest.mark.django_db
def test_second_run_announces_only_what_changed_and_resumes_from_the_cursor():
    bus = Recorder()
    first = ContractIngestor(ListSource([raw("A"), raw("B"), raw("A")]), bus).run("slice")
    assert (first.seen, first.changed) == (3, 2)
    assert Contract.objects.count() == 2
    assert bus.events[0].name == CONTRACTS_CHANGED and sorted(bus.events[0].payload["ids"]) == ["A", "B"]

    source = ListSource([raw("A"), raw("B", updated="2026-03-05T09:00:00", value="2000")])
    second = ContractIngestor(source, bus).run("slice")
    assert second.changed == 1 and bus.events[-1].payload["ids"] == ["B"]
    assert Contract.objects.get(pk="B").value_cop == 2000
    assert source.asked_since[0] == datetime(2026, 3, 1, 15, tzinfo=UTC)  # 10:00 Bogotá
    cursor = IngestCursor.objects.get(pk="slice")
    assert cursor.last_updated_at == datetime(2026, 3, 5, 14, tzinfo=UTC) and cursor.runs == 2


def test_socrata_source_pages_until_a_short_page_and_retries_server_errors(monkeypatch):
    monkeypatch.setattr("contracts.sources.time.sleep", lambda s: None)
    calls = []

    def handler(request):
        calls.append(dict(request.url.params))
        if len(calls) == 1:
            return httpx.Response(503)
        offset = int(request.url.params["$offset"])
        return httpx.Response(200, json=[raw(f"{offset}-{i}") for i in range(2 if offset == 0 else 1)])

    source = SocrataSource(
        "https://example.org/r.json", page_size=2, client=httpx.Client(transport=httpx.MockTransport(handler))
    )
    pages = list(source.pages("departamento='Cauca'", since=datetime(2026, 3, 1, tzinfo=UTC)))
    assert [len(p) for p in pages] == [2, 1]
    assert "ultima_actualizacion >= '2026-02-28T19:00:00'" in calls[-1]["$where"]
    assert len(calls) == 3  # one 503 retried, then two pages


def test_client_errors_are_not_retried():
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(400)))
    with pytest.raises(httpx.HTTPStatusError):
        list(SocrataSource("https://example.org/r.json", client=client).pages("x", None))


class FailingBus:
    def publish(self, event):
        raise ConnectionError("Pub/Sub is down")


@pytest.mark.django_db
def test_an_event_that_could_not_be_published_is_sent_by_the_next_run():
    with pytest.raises(ConnectionError):
        ContractIngestor(ListSource([raw("A")]), FailingBus()).run("slice")
    assert Contract.objects.filter(pk="A").exists()  # the data is committed, and so is its event

    bus = Recorder()
    ContractIngestor(ListSource([]), bus).run("slice")
    assert [e.payload["ids"] for e in bus.events] == [["A"]]
    assert not OutboxEvent.objects.filter(published_at__isnull=True).exists()
