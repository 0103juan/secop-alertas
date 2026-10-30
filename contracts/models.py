from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVector
from django.db import models


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
        indexes = [
            models.Index(fields=["entity_nit", "supplier_doc", "signed_on"], name="contract_entity_supplier_date"),
            models.Index(fields=["department", "-signed_on"], name="contract_department_date"),
            models.Index(fields=["modality", "contract_type"], name="contract_modality_type"),
            GinIndex(SearchVector("object", config="spanish"), name="contract_object_search"),
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
