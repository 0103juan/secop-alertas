"""A small, fixed set of contracts for end-to-end tests and for trying the app without downloading SECOP.

Deterministic (same seed, same rows), and shaped so every page has something to show: contracts about bridges for
search and alert rules, one splitting cluster, and one value far above its group.
"""

import random
from datetime import UTC, datetime, timedelta

from django.core.management.base import BaseCommand

from contracts.models import Contract

START = datetime(2026, 3, 2, 15, tzinfo=UTC)
PREFIX = "DEMO."


def demo_rows() -> list[Contract]:
    rng = random.Random(1)
    rows = []

    def add(n: int, **fields) -> None:
        defaults = dict(
            entity="Alcaldía de Ejemplo", entity_nit=800000001, department="Cauca", city="Popayán",
            contract_type="Suministros", modality="Mínima cuantía", status="En ejecución",
            supplier="Comercializadora Andina", supplier_doc=f"9000{n:05d}",
            signed_on=START + timedelta(days=n % 90), upstream_updated_at=START,
            url=f"https://community.secop.gov.co/demo/{n}",
        )  # fmt: skip
        defaults.update(fields)
        rows.append(Contract(id=f"{PREFIX}{n:04d}", **defaults))

    # A group with ordinary values, around $ 10 million, and one far above it.
    for n in range(40):
        value = int(10 ** rng.gauss(7, 0.15))
        add(n, object=f"Suministro de papelería y elementos de oficina, lote {n}", value_cop=value)
    add(40, object="Suministro de equipos de cómputo para todas las sedes", value_cop=5_000_000_000)

    # Bridges, for search and for alert rules.
    for n, (place, value) in enumerate([("río Cauca", 900_000_000), ("vereda El Rodeo", 120_000_000),
                                        ("quebrada La Honda", 45_000_000)], start=50):  # fmt: skip
        add(n, object=f"Construcción del puente vehicular sobre el {place}", value_cop=value,
            contract_type="Obra", modality="Licitación pública")  # fmt: skip

    # Three contracts under $ 50 million each, same entity and supplier, ten days apart: one splitting cluster.
    for n, day in enumerate([0, 4, 9], start=60):
        add(
            n,
            object="Mantenimiento de vías terciarias",
            value_cop=20_000_000,
            contract_type="Obra",
            supplier="Constructora Demo SAS",
            supplier_doc="900123456",
            signed_on=START + timedelta(days=day),
        )
    return rows


class Command(BaseCommand):
    help = "Loads a fixed set of demo contracts (ids start with DEMO.); safe to run again."

    def handle(self, *args, **options):
        rows = demo_rows()
        fields = [f.name for f in Contract._meta.fields if f.name != "id"]
        Contract.objects.bulk_create(rows, update_conflicts=True, unique_fields=["id"], update_fields=fields)
        self.stdout.write(f"demo contracts: {len(rows)}")
