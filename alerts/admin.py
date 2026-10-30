from django.contrib import admin

from .models import Alert, Subscription


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ["name", "owner", "channel", "active", "created_at"]
    list_filter = ["channel", "active"]
    raw_id_fields = ["owner"]


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ["subscription", "contract", "created_at", "delivered_at", "attempts"]
    raw_id_fields = ["subscription", "contract"]
