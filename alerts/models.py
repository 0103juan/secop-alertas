import secrets

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

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

    # No index on `active`: a boolean that is true for almost every row is never selective enough to be used, and
    # the matcher reads all active subscriptions anyway.

    def __str__(self) -> str:
        return self.name

    def clean(self) -> None:
        """The admin saves through this too, so a rule the matcher cannot build never reaches the database."""
        from . import rules  # rules imports the contracts model; imported here to keep models import-light

        try:
            rules.build(self.rules)
        except rules.RuleError as error:
            raise ValidationError({"rules": str(error)}) from None


class Alert(models.Model):
    """A contract that matched a subscription. The unique pair is what makes a redelivered event harmless."""

    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="alerts")
    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    delivered_at = models.DateTimeField(null=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    # A worker that takes an alert to send owns it until this moment; after a failure it is also the time of the next
    # try (exponential backoff). See alerts.delivery.
    claimed_until = models.DateTimeField(null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["subscription", "contract"], name="alert_once_per_contract")]
        indexes = [
            # A user's alerts, newest first (GET /alerts/).
            models.Index(fields=["subscription", "-created_at"], name="alert_subscription_recent"),
            # The delivery queue. Partial: delivered alerts, which are nearly all of them, are not in it, so the
            # index stays the size of the backlog instead of growing with history.
            models.Index(fields=["created_at"], condition=Q(delivered_at__isnull=True), name="alert_undelivered"),
        ]

    def __str__(self) -> str:
        return f"{self.subscription_id} -> {self.contract_id}"
