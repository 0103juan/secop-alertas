from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .bus import Event, EventBus
from .models import OutboxEvent

KEEP_PUBLISHED = timedelta(days=7)


def enqueue(event: Event) -> None:
    """Call inside the transaction that writes the data the event is about."""
    OutboxEvent.objects.create(name=event.name, payload=event.payload)


def relay(bus: EventBus, limit: int = 1000) -> int:
    """Publishes pending events in order, one transaction each. SKIP LOCKED lets two relays run side by side
    without publishing the same row; if publishing fails the row stays pending and the next relay retries it."""
    sent = 0
    while sent < limit:
        with transaction.atomic():
            row = (
                OutboxEvent.objects.filter(published_at__isnull=True)
                .select_for_update(skip_locked=True)
                .order_by("id")
                .first()
            )
            if row is None:
                break
            bus.publish(Event(row.name, row.payload))
            row.published_at = timezone.now()
            row.save(update_fields=["published_at"])
        sent += 1
    OutboxEvent.objects.filter(published_at__lt=timezone.now() - KEEP_PUBLISHED).delete()
    return sent
