import random

import pytest

from alerts import rules
from contracts.models import Contract

from .conftest import make_contract


def test_build_rejects_bad_specs_with_a_precise_message():
    with pytest.raises(rules.RuleError, match="non-empty list"):
        rules.build([])
    with pytest.raises(rules.RuleError, match="rule 0: type must be one of"):
        rules.build([{"type": "nope"}])
    with pytest.raises(rules.RuleError, match=r"rule 1 \(amount\): 'min_cop' is greater"):
        rules.build(
            [
                {"type": "keyword", "params": {"words": ["vías"]}},
                {"type": "amount", "params": {"min_cop": 10, "max_cop": 1}},
            ]
        )
    with pytest.raises(rules.RuleError, match="positive integers"):
        rules.build([{"type": "entity", "params": {"nits": ["891580006"]}}])


def test_keyword_ignores_case_and_accents():
    rule = rules.build([{"type": "keyword", "params": {"words": ["CONSTRUCCIÓN"]}}])
    assert rule.matches(Contract(object="construccion de un puente"))
    assert not rule.matches(Contract(object="interventoría"))


def test_all_rules_must_match():
    rule = rules.build(
        [
            {"type": "department", "params": {"departments": ["cauca"]}},
            {"type": "amount", "params": {"min_cop": 100}},
        ]
    )
    assert rule.matches(Contract(department="Cauca", value_cop=100))
    assert not rule.matches(Contract(department="Cauca", value_cop=99))
    assert not rule.matches(Contract(department="Huila", value_cop=1000))
    assert not rule.matches(Contract(department="Cauca", value_cop=None))


WORDS = ["vías", "puente", "alimentación", "software", "salud"]
DEPARTMENTS = ["Cauca", "Huila", "Nariño"]
MODALITIES = ["Contratación directa", "Mínima cuantía", "Licitación pública"]


def random_spec(rng: random.Random) -> list[dict]:
    pool = [
        {"type": "keyword", "params": {"words": rng.sample(WORDS, rng.randint(1, 2))}},
        {"type": "department", "params": {"departments": [rng.choice(DEPARTMENTS).upper()]}},
        {"type": "modality", "params": {"modalities": rng.sample(MODALITIES, 2)}},
        {"type": "amount", "params": {"min_cop": rng.choice([None, 10_000_000]), "max_cop": 80_000_000}},
        {"type": "entity", "params": {"nits": [1, 2]}},
    ]
    return rng.sample(pool, rng.randint(1, 3))


@pytest.mark.django_db
def test_memory_and_database_agree_on_random_contracts_and_rules():
    """The stream uses `matches`, the preview uses `as_q`; a user must get the same answer from both."""
    rng = random.Random(7)
    for _ in range(120):
        make_contract(
            entity_nit=rng.choice([1, 2, 3]),
            department=rng.choice(DEPARTMENTS),
            modality=rng.choice(MODALITIES),
            object=f"{rng.choice(['Obra de', 'Suministro de', 'Servicio de'])} {rng.choice(WORDS).upper()} rural",
            value_cop=rng.choice([None, 5_000_000, 30_000_000, 90_000_000]),
        )
    contracts = list(Contract.objects.all())
    for _ in range(40):
        rule = rules.build(random_spec(rng))
        in_memory = {c.id for c in contracts if rule.matches(c)}
        in_database = set(Contract.objects.filter(rule.as_q()).values_list("id", flat=True))
        assert in_memory == in_database
