from django.db.models import Func, TextField
from django.db.models.functions import Upper

# Postgres marks unaccent() STABLE (its dictionary could change), and an index expression must be IMMUTABLE. The
# usual answer is a wrapper that pins the dictionary and declares itself immutable; migration 0002 creates it.


class ImmutableUnaccent(Func):
    function = "immutable_unaccent"
    output_field = TextField()


def folded(field: str) -> Upper:
    """UPPER(immutable_unaccent(field)): the expression the trigram index is built on. Queries must use exactly this
    expression for Postgres to pick the index."""
    return Upper(ImmutableUnaccent(field))
