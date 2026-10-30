import itertools
from datetime import UTC, datetime, timedelta

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from contracts.models import Contract

_ids = itertools.count(1)
BASE = datetime(2026, 3, 1, 10, tzinfo=UTC)


def make_contract(**fields) -> Contract:
    n = next(_ids)
    defaults = dict(
        id=f"CO1.PCCNTR.{n}",
        entity="Alcaldía de Popayán",
        entity_nit=891580006,
        department="Cauca",
        city="Popayán",
        contract_type="Obra",
        modality="Contratación directa",
        status="Activo",
        object="Mantenimiento de vías terciarias",
        supplier="Constructora Andina",
        supplier_doc="900100200",
        signed_on=BASE + timedelta(days=n % 30),
        value_cop=20_000_000,
        upstream_updated_at=BASE,
        url=f"https://community.secop.gov.co/{n}",
    )
    defaults.update(fields)
    return Contract.objects.create(**defaults)


@pytest.fixture
def contract(db):
    return make_contract


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def user(django_user_model):
    return django_user_model.objects.create_user("ana", "ana@example.com", "una-clave-larga-123")


@pytest.fixture
def auth_api(user):
    client = APIClient()
    client.force_authenticate(user)
    return client
