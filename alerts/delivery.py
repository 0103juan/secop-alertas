"""Sending alerts: claim with a lease, send outside any transaction, then record the outcome.

Why a lease and not a row lock held while sending: a webhook may take its full 10 s timeout, and a transaction open
for that long holds locks and a database connection the whole time. Instead a short transaction claims a batch
(`SELECT ... FOR UPDATE SKIP LOCKED`, then `claimed_until = now + LEASE`), commits, and the sending happens with no
transaction open. A worker that dies mid-send leaves its alerts claimed until the lease expires, and then another
worker takes them: at-least-once, never stuck.

A failed send keeps the alert undelivered and pushes `claimed_until` out exponentially (1, 2, 4, 8 minutes), so a
receiver that is down is not hammered. After MAX_ATTEMPTS the alert is left for a person to look at.
"""

import logging
from collections import defaultdict
from datetime import timedelta

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from .models import Alert
from .notifiers import DeliveryError, notifier_for

log = logging.getLogger(__name__)

LEASE = timedelta(minutes=2)
MAX_ATTEMPTS = 5


def backoff(attempts: int) -> timedelta:
    return timedelta(minutes=2 ** (attempts - 1))


def claim(limit: int) -> list[Alert]:
    now = timezone.now()
    with transaction.atomic():
        ids = list(
            Alert.objects.filter(delivered_at__isnull=True, attempts__lt=MAX_ATTEMPTS, subscription__active=True)
            .filter(Q(claimed_until__isnull=True) | Q(claimed_until__lte=now))
            .select_for_update(skip_locked=True, of=("self",))
            .order_by("created_at")
            .values_list("pk", flat=True)[:limit]
        )
        Alert.objects.filter(pk__in=ids).update(claimed_until=now + LEASE, attempts=F("attempts") + 1)
    return list(Alert.objects.filter(pk__in=ids).select_related("subscription", "contract").order_by("created_at"))


def deliver_pending(limit: int = 1000) -> int:
    """Sends what is due, one batch per subscription, and returns how many alerts were delivered."""
    batches: dict[int, list[Alert]] = defaultdict(list)
    for alert in claim(limit):
        batches[alert.subscription_id].append(alert)

    delivered = 0
    for alerts in batches.values():
        subscription = alerts[0].subscription
        ids = [a.pk for a in alerts]
        try:
            notifier_for(subscription.channel).send(subscription, [a.contract for a in alerts])
        except DeliveryError as error:
            retry_at = timezone.now() + backoff(max(a.attempts for a in alerts))
            Alert.objects.filter(pk__in=ids).update(claimed_until=retry_at)
            log.warning("delivery to subscription %s failed, retry at %s: %s", subscription.pk, retry_at, error)
            continue
        Alert.objects.filter(pk__in=ids).update(delivered_at=timezone.now(), claimed_until=None)
        delivered += len(ids)
    return delivered
