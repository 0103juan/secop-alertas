from rest_framework import serializers

from .models import Contract


class ContractSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contract
        # Listed, not `exclude`d: a column added later stays private until someone decides to publish it.
        # supplier_doc is deliberately absent.
        fields = [
            "id", "entity", "entity_nit", "department", "city", "contract_type", "modality", "status", "object",
            "supplier", "signed_on", "value_cop", "upstream_updated_at", "url",
        ]  # fmt: skip
