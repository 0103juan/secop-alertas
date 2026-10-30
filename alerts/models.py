import secrets

from django.conf import settings
from django.db import models

from contracts.models import Contract


class Channel(models.TextChoices):
    EMAIL = "email", "Email"
    WEBHOOK = "webhook", "Webhook"


def _webhook_secret() -> str:
    return secrets.token_urlsafe(32)


class Subscription(models.Model):
    """What a user wants to hear about: every rule must match (see `rules.AllOf`), and matches go to one channel."""

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="subscriptions")
    name = models.CharField(max_length=120)
    rules = models.JSONField(help_text='A list of {"type": ..., "params": {...}}; all of them must match.')
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.EMAIL)
    target = models.CharField(max_length=500, help_text="An email address or an https URL, by channel.")
    secret = models.CharField(max_length=64, default=_webhook_secret, editable=False)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["active"], name="subscription_active")]

    def __str__(self) -> str:
        return self.name


class Alert(models.Model):
    """A contract that matched a subscription. The unique pair is what makes a redelivered event harmless."""

    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="alerts")
    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    delivered_at = models.DateTimeField(null=True)
    attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["subscription", "contract"], name="alert_once_per_contract")]
        indexes = [models.Index(fields=["subscription", "-created_at"], name="alert_subscription_recent")]

    def __str__(self) -> str:
        return f"{self.subscription_id} -> {self.contract_id}"
