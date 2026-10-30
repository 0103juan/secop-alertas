"""Where contracts come from. The ingestion depends on the `ContractSource` port, not on HTTP, so tests hand it a
list and production hands it `SocrataSource` (datos.gov.co runs Socrata)."""

import time
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

import httpx
from django.utils.dateparse import parse_datetime
from django.utils.timezone import get_default_timezone, is_naive, make_aware

FIELDS = (
    "id_contrato",
    "nombre_entidad",
    "nit_entidad",
    "departamento",
    "ciudad",
    "tipo_de_contrato",
    "modalidad_de_contratacion",
    "estado_contrato",
    "objeto_del_contrato",
    "proveedor_adjudicado",
    "documento_proveedor",
    "fecha_de_firma",
    "valor_del_contrato",
    "ultima_actualizacion",
    "urlproceso",
)


@dataclass(frozen=True, slots=True)
class ContractRow:
    id: str
    entity: str
    entity_nit: int | None
    department: str
    city: str
    contract_type: str
    modality: str
    status: str
    object: str
    supplier: str
    supplier_doc: str
    signed_on: datetime | None
    value_cop: int | None
    upstream_updated_at: datetime | None
    url: str


class ContractSource(Protocol):
    def pages(self, where: str, since: datetime | None) -> Iterator[list[ContractRow]]: ...


def _number(value) -> int | None:
    """Upstream sends some numbers with text around them; anything that is not a number is stored as unknown."""
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _moment(value) -> datetime | None:
    moment = parse_datetime(value) if value else None
    if moment and is_naive(moment):
        moment = make_aware(moment, get_default_timezone())  # SECOP publishes Bogotá local time without an offset
    return moment


def parse_row(raw: dict) -> ContractRow | None:
    """A row without an id or an object cannot be matched against anything, so it is skipped."""
    object_ = (raw.get("objeto_del_contrato") or "").strip()
    if not raw.get("id_contrato") or not object_:
        return None
    return ContractRow(
        id=raw["id_contrato"],
        entity=(raw.get("nombre_entidad") or "")[:300],
        entity_nit=_number(raw.get("nit_entidad")),
        department=raw.get("departamento") or "",
        city=raw.get("ciudad") or "",
        contract_type=raw.get("tipo_de_contrato") or "",
        modality=raw.get("modalidad_de_contratacion") or "",
        status=raw.get("estado_contrato") or "",
        object=object_,
        supplier=(raw.get("proveedor_adjudicado") or "")[:300],
        supplier_doc=(raw.get("documento_proveedor") or "")[:40],
        signed_on=_moment(raw.get("fecha_de_firma")),
        value_cop=_number(raw.get("valor_del_contrato")),
        upstream_updated_at=_moment(raw.get("ultima_actualizacion")),
        url=((raw.get("urlproceso") or {}).get("url") or "")[:500],
    )


class SocrataSource:
    """Reads a slice of SECOP II page by page, oldest update first, so a run that dies half way can resume from the
    cursor without missing rows."""

    def __init__(self, dataset: str, page_size: int = 2000, client: httpx.Client | None = None, retries: int = 4):
        self.dataset = dataset
        self.page_size = page_size
        self.client = client or httpx.Client(timeout=120)
        self.retries = retries

    def pages(self, where: str, since: datetime | None) -> Iterator[list[ContractRow]]:
        if since:
            # `>=`, not `>`: several rows share a timestamp, and the upsert makes seeing one twice harmless.
            local = since.astimezone(get_default_timezone())  # upstream compares Bogotá local time
            where = f"({where}) AND ultima_actualizacion >= '{local.strftime('%Y-%m-%dT%H:%M:%S')}'"
        offset = 0
        while True:
            raw = self._get(
                {
                    "$select": ",".join(FIELDS),
                    "$where": where,
                    "$order": "ultima_actualizacion, id_contrato",
                    "$limit": self.page_size,
                    "$offset": offset,
                }
            )
            rows = [row for row in map(parse_row, raw) if row]
            if rows:
                yield rows
            if len(raw) < self.page_size:
                return
            offset += self.page_size

    def _get(self, params: dict) -> list[dict]:
        for attempt in range(self.retries):
            try:
                response = self.client.get(self.dataset, params=params)
                response.raise_for_status()
                return response.json()
            except (httpx.TransportError, httpx.HTTPStatusError) as error:
                retryable = not isinstance(error, httpx.HTTPStatusError) or error.response.status_code >= 500
                if attempt == self.retries - 1 or not retryable:
                    raise
                time.sleep(2**attempt * 5)  # the open-data portal times out now and then
        raise AssertionError("unreachable")
