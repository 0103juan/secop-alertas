"""Matching new contracts against every active subscription, and delivering the matches.

Cost: n changed contracts x m active subscriptions x r rules per subscription, all in memory over rows loaded in
one query; the database is touched once to read, once to insert the alerts and once per subscription to mark
them delivered. With thousands of subscriptions the next step is an inverted index from keyword and NIT to
subscriptions, so each contract only meets the subscriptions that could match it.
"""

import logging
from collections import defaultdict

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from contracts.ingest import CONTRACTS_CHANGED
from contracts.models import Contract
from events.bus import subscribe

from . import rules
from .models import Alert, Subscription
from .notifiers import DeliveryError, notifier_for

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 5


@subscribe(CONTRACTS_CHANGED)
def on_contracts_changed(payload: dict) -> None:
    match_and_deliver(payload.get("ids", []))


def match_and_deliver(contract_ids: list[str]) -> int:
    contracts = list(Contract.objects.filter(id__in=contract_ids))
    if not contracts:
        return 0
    matched: list[Alert] = []
    for subscription in Subscription.objects.filter(active=True):
        try:
            rule = rules.build(subscription.rules)
        except rules.RuleError:
            log.exception("subscription %s has invalid rules; skipped", subscription.pk)
            continue
        matched += [Alert(subscription=subscription, contract=c) for c in contracts if rule.matches(c)]

    # ignore_conflicts + the unique pair: a redelivered event finds its alerts already there and adds nothing.
    Alert.objects.bulk_create(matched, ignore_conflicts=True)
    deliver_pending()
    return len(matched)


@transaction.atomic
def deliver_pending(limit: int = 1000) -> int:
    """Sends every undelivered alert, batched per subscription. Also run on its own to retry failures.

    Pub/Sub may run two handlers at once. The rows are locked with SKIP LOCKED, so a second worker skips what the
    first one is sending instead of sending it twice.
    """
    pending = (
        Alert.objects.filter(delivered_at__isnull=True, attempts__lt=MAX_ATTEMPTS, subscription__active=True)
        .select_related("subscription", "contract")
        .select_for_update(skip_locked=True, of=("self",))
        .order_by("subscription_id", "created_at")[:limit]
    )
    batches: dict[int, list[Alert]] = defaultdict(list)
    for alert in pending:
        batches[alert.subscription_id].append(alert)

    delivered = 0
    for alerts in batches.values():
        subscription = alerts[0].subscription
        ids = [a.pk for a in alerts]
        Alert.objects.filter(pk__in=ids).update(attempts=F("attempts") + 1)
        try:
            notifier_for(subscription.channel).send(subscription, [a.contract for a in alerts])
        except DeliveryError as error:
            log.warning("delivery to subscription %s failed: %s", subscription.pk, error)
            continue
        Alert.objects.filter(pk__in=ids).update(delivered_at=timezone.now())
        delivered += len(ids)
    return delivered
