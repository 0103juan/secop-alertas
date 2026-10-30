"""Matching changed contracts against every active subscription.

Cost: n contracts x m active subscriptions x r rules, in memory, over rows loaded with one query. The database is
read once for the contracts, once for the subscriptions, and written once (a bulk insert of the alerts). With
thousands of subscriptions the next step is an inverted index from keyword and NIT to subscriptions, so a contract
only meets the subscriptions that could match it.
"""

import logging

from contracts.models import Contract

from . import rules
from .models import Alert, Subscription

log = logging.getLogger(__name__)


def match(contract_ids: list[str]) -> int:
    """Creates the alerts for these contracts and returns how many matched. Safe to call twice with the same ids."""
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

    # ignore_conflicts + the unique (subscription, contract) pair: a redelivered event adds nothing.
    Alert.objects.bulk_create(matched, ignore_conflicts=True)
    return len(matched)
