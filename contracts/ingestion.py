"""Incremental, idempotent ingestion: upsert each page, advance the cursor, and announce only what changed.

The announcement goes through the outbox (see `events.models.OutboxEvent`), written in the page's transaction.
"""

import logging
from dataclasses import asdict, dataclass

from django.db import transaction
from django.db.models import F

from events.bus import Event, EventBus
from events.outbox import enqueue, relay

from .events import CONTRACTS_CHANGED, EVENT_BATCH
from .models import Contract, IngestCursor
from .sources import ContractRow, ContractSource

log = logging.getLogger(__name__)

UPDATE_FIELDS = [f for f in ContractRow.__dataclass_fields__ if f != "id"]


@dataclass
class IngestReport:
    seen: int = 0
    changed: int = 0
    pages: int = 0


class ContractIngestor:
    """Depends on two ports, a ContractSource and an EventBus, so tests run it with a list and a recorder."""

    def __init__(self, source: ContractSource, bus: EventBus):
        self.source = source
        self.bus = bus

    def run(self, where: str, max_pages: int | None = None) -> IngestReport:
        cursor, _ = IngestCursor.objects.get_or_create(slice=where)
        report = IngestReport()
        relay(self.bus)  # events a previous run stored but could not publish
        for page in self.source.pages(where, since=cursor.last_updated_at):
            changed = self._load(page, cursor)
            report.pages += 1
            report.seen += len(page)
            report.changed += len(changed)
            relay(self.bus)
            if max_pages and report.pages >= max_pages:
                break
        IngestCursor.objects.filter(pk=cursor.pk).update(runs=F("runs") + 1)
        log.info("ingested slice=%r pages=%d seen=%d changed=%d", where, report.pages, report.seen, report.changed)
        return report

    @transaction.atomic
    def _load(self, page: list[ContractRow], cursor: IngestCursor) -> list[str]:
        """Upserts one page, moves the cursor and stores its event in one transaction: all three or none."""
        page = list({row.id: row for row in page}.values())  # upstream repeats ids inside a page now and then
        known = dict(Contract.objects.filter(id__in=[r.id for r in page]).values_list("id", "upstream_updated_at"))
        changed = [r.id for r in page if r.id not in known or known[r.id] != r.upstream_updated_at]
        Contract.objects.bulk_create(
            [Contract(**asdict(row)) for row in page],
            update_conflicts=True,
            unique_fields=["id"],
            update_fields=UPDATE_FIELDS,
        )
        newest = max((r.upstream_updated_at for r in page if r.upstream_updated_at), default=None)
        if newest and (cursor.last_updated_at is None or newest > cursor.last_updated_at):
            cursor.last_updated_at = newest
            IngestCursor.objects.filter(pk=cursor.pk).update(last_updated_at=newest)
        for start in range(0, len(changed), EVENT_BATCH):
            enqueue(Event(CONTRACTS_CHANGED, {"ids": changed[start : start + EVENT_BATCH]}))
        return changed
