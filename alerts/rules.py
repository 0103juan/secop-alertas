"""Alert rules: the Strategy pattern, with Composite on top and a Factory that builds them from JSON.

Every rule answers the same question two ways, and both must agree (the tests check it on random data):

- `matches(contract)` in memory, for the stream of new contracts, where the rows are already loaded;
- `as_q()` as a database filter, for previews over history, where loading every row would be wasteful.

Adding a kind of rule means writing one class and decorating it with `@register`; nothing else changes
(open for extension, closed for modification).
"""

import unicodedata
from abc import ABC, abstractmethod
from typing import ClassVar

from django.db.models import Q
from django.db.models.lookups import Contains

from contracts.expressions import folded
from contracts.models import Contract


class RuleError(ValueError):
    pass


def fold(text: str) -> str:
    """Lowercase without accents, so "construcción" matches "CONSTRUCCION"."""
    return "".join(c for c in unicodedata.normalize("NFKD", text.casefold()) if not unicodedata.combining(c))


class Rule(ABC):
    type: ClassVar[str]

    @abstractmethod
    def matches(self, contract: Contract) -> bool: ...

    @abstractmethod
    def as_q(self) -> Q: ...

    @classmethod
    @abstractmethod
    def from_params(cls, params: dict) -> "Rule": ...


REGISTRY: dict[str, type[Rule]] = {}


MIN_WORD = 3


def register(cls: type[Rule]) -> type[Rule]:
    REGISTRY[cls.type] = cls
    return cls


def _strings(params: dict, key: str, limit: int = 50) -> list[str]:
    values = params.get(key)
    if not isinstance(values, list) or not values or not all(isinstance(v, str) and v.strip() for v in values):
        raise RuleError(f"'{key}' must be a non-empty list of strings")
    if len(values) > limit:
        raise RuleError(f"'{key}' takes at most {limit} values")
    return [v.strip() for v in values]


@register
class KeywordRule(Rule):
    """Any of the words appears in the contract's object."""

    type = "keyword"

    def __init__(self, words: list[str]):
        self.words = words
        self._folded = [fold(w) for w in words]

    def matches(self, contract: Contract) -> bool:
        text = fold(contract.object)
        return any(word in text for word in self._folded)

    def as_q(self) -> Q:
        # The left side is exactly the trigram index's expression (contracts.expressions.folded), so the database
        # answers from the index instead of reading every contract.
        q = Q()
        for word in self._folded:
            q |= Q(Contains(folded("object"), word.upper()))
        return q

    @classmethod
    def from_params(cls, params: dict) -> "KeywordRule":
        words = _strings(params, "words")
        if any(len(w) < MIN_WORD for w in words):
            raise RuleError(f"each word needs at least {MIN_WORD} characters")  # shorter has no trigram to index
        return cls(words)


@register
class EntityRule(Rule):
    """The contracting entity is one of these NITs."""

    type = "entity"

    def __init__(self, nits: list[int]):
        self.nits = set(nits)

    def matches(self, contract: Contract) -> bool:
        return contract.entity_nit in self.nits

    def as_q(self) -> Q:
        return Q(entity_nit__in=self.nits)

    @classmethod
    def from_params(cls, params: dict) -> "EntityRule":
        nits = params.get("nits")
        if not isinstance(nits, list) or not nits or not all(isinstance(n, int) and n > 0 for n in nits):
            raise RuleError("'nits' must be a non-empty list of positive integers")
        return cls(nits)


@register
class AmountRule(Rule):
    """The value is within [min_cop, max_cop]; either end may be left open."""

    type = "amount"

    def __init__(self, min_cop: int | None, max_cop: int | None):
        self.min_cop, self.max_cop = min_cop, max_cop

    def matches(self, contract: Contract) -> bool:
        value = contract.value_cop
        if value is None:
            return False
        return (self.min_cop is None or value >= self.min_cop) and (self.max_cop is None or value <= self.max_cop)

    def as_q(self) -> Q:
        q = Q(value_cop__isnull=False)
        if self.min_cop is not None:
            q &= Q(value_cop__gte=self.min_cop)
        if self.max_cop is not None:
            q &= Q(value_cop__lte=self.max_cop)
        return q

    @classmethod
    def from_params(cls, params: dict) -> "AmountRule":
        low, high = params.get("min_cop"), params.get("max_cop")
        for name, value in (("min_cop", low), ("max_cop", high)):
            if value is not None and (not isinstance(value, int) or value < 0):
                raise RuleError(f"'{name}' must be a non-negative integer")
        if low is None and high is None:
            raise RuleError("give 'min_cop', 'max_cop' or both")
        if low is not None and high is not None and low > high:
            raise RuleError("'min_cop' is greater than 'max_cop'")
        return cls(low, high)


class _InListRule(Rule):
    """A rule that compares one text field of the contract with a list, ignoring case and accents."""

    field: ClassVar[str]
    key: ClassVar[str]

    def __init__(self, values: list[str]):
        self.values = values
        self._folded = {fold(v) for v in values}

    def matches(self, contract: Contract) -> bool:
        return fold(getattr(contract, self.field)) in self._folded

    def as_q(self) -> Q:
        q = Q()
        for value in self.values:
            q |= Q(**{f"{self.field}__unaccent__iexact": value})
        return q

    @classmethod
    def from_params(cls, params: dict) -> "_InListRule":
        return cls(_strings(params, cls.key))


@register
class DepartmentRule(_InListRule):
    type, field, key = "department", "department", "departments"


@register
class ModalityRule(_InListRule):
    type, field, key = "modality", "modality", "modalities"


class AllOf(Rule):
    """Composite: a rule made of rules, which matches when every one of them does."""

    type = "all_of"

    def __init__(self, rules: list[Rule]):
        self.rules = rules

    def matches(self, contract: Contract) -> bool:
        return all(rule.matches(contract) for rule in self.rules)

    def as_q(self) -> Q:
        q = Q()
        for rule in self.rules:
            q &= rule.as_q()
        return q

    @classmethod
    def from_params(cls, params: dict) -> "AllOf":
        return build(params.get("rules"))


MAX_RULES = 10


def build(specs) -> AllOf:
    """The Factory: turns the JSON a user stored into rule objects, or says exactly what is wrong with it."""
    if not isinstance(specs, list) or not specs:
        raise RuleError("rules must be a non-empty list")
    if len(specs) > MAX_RULES:
        raise RuleError(f"at most {MAX_RULES} rules per subscription")
    rules = []
    for index, spec in enumerate(specs):
        if not isinstance(spec, dict) or spec.get("type") not in REGISTRY:
            raise RuleError(f"rule {index}: type must be one of {sorted(REGISTRY)}")
        try:
            rules.append(REGISTRY[spec["type"]].from_params(spec.get("params") or {}))
        except RuleError as error:
            raise RuleError(f"rule {index} ({spec['type']}): {error}") from None
    return AllOf(rules)
