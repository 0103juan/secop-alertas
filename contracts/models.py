from django.contrib.postgres.indexes import GinIndex, OpClass
from django.contrib.postgres.search import SearchVector
from django.db import models
from django.db.models import F
from django.db.models.functions import Upper

from .expressions import folded


class Contract(models.Model):
    """One SECOP II contract, as datos.gov.co publishes it. The primary key is SECOP's own id, so loading a row
    twice updates it instead of duplicating it."""

    id = models.CharField(primary_key=True, max_length=40)
    entity = models.CharField(max_length=300)
    entity_nit = models.BigIntegerField(null=True)
    department = models.CharField(max_length=80)
    city = models.CharField(max_length=120, blank=True)
    contract_type = models.CharField(max_length=120, blank=True)
    modality = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=60, blank=True)
    object = models.TextField()
    supplier = models.CharField(max_length=300, blank=True)
    # The supplier's document is public in SECOP, but the API never returns it: it is only used to group a
    # supplier's contracts, because names are spelled in many ways.
    supplier_doc = models.CharField(max_length=40, blank=True)
    signed_on = models.DateTimeField(null=True)
    value_cop = models.BigIntegerField(null=True)
    upstream_updated_at = models.DateTimeField(null=True)
    url = models.URLField(max_length=500, blank=True)

    class Meta:
        # Each index serves a query the application runs; docs/ARCHITECTURE.md has the plans before and after.
        indexes = [
            # The default listing, newest first, and the cursor pagination's order.
            models.Index(F("signed_on").desc(), F("id"), name="contract_signed"),
            # ?department= is case-insensitive, so Django compares UPPER(department); a plain index on the column
            # cannot serve that, an index on the same expression can (and gives the planner statistics for it).
            models.Index(Upper("department"), F("signed_on").desc(), name="contract_department_signed"),
            # ?entity_nit= and the entity alert rule, newest first.
            models.Index(F("entity_nit"), F("signed_on").desc(), name="contract_entity_signed"),
            # ?q= full-text search in Spanish; the filter uses this same expression.
            GinIndex(SearchVector("object", config="spanish"), name="contract_object_search"),
            # Keyword rules match substrings without accents or case ("vias" finds "VÍAS"); a trigram index turns
            # that LIKE '%...%' from a full scan into an index lookup.
            GinIndex(OpClass(folded("object"), name="gin_trgm_ops"), name="contract_object_trgm"),
        ]

    def __str__(self) -> str:
        return f"{self.id} {self.entity}"


class IngestCursor(models.Model):
    """How far one slice of SECOP has been read: the newest upstream update seen. The next run starts there."""

    slice = models.CharField(primary_key=True, max_length=300)
    last_updated_at = models.DateTimeField(null=True)
    runs = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.slice
