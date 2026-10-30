from django.contrib import admin

from .models import Contract, IngestCursor


@admin.register(Contract)
class ContractAdmin(admin.ModelAdmin):
    list_display = ["id", "entity", "supplier", "value_cop", "signed_on", "modality"]
    list_filter = ["department", "modality", "status"]
    search_fields = ["id", "entity", "supplier", "object"]
    show_full_result_count = False  # COUNT(*) over every contract on each page load is the slow part


@admin.register(IngestCursor)
class IngestCursorAdmin(admin.ModelAdmin):
    list_display = ["slice", "last_updated_at", "runs", "updated_at"]
