"""Domain events, the Observer pattern with a transport behind it.

Producers call `get_bus().publish(event)` and never know who listens. Listeners register with `@subscribe(name)`
in their app's `ready()`. The bus decides where the call happens:

- `InProcessBus` dispatches at once, in the same process (local runs and tests).
- `PubSubBus` publishes to a Google Pub/Sub topic; the push subscription calls `/internal/events/pubsub` on the
  web service, which dispatches there. Producer and consumer then scale, fail and retry apart.

Handlers must be idempotent: Pub/Sub delivers at least once.
"""

import json
import logging
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from functools import cache
from typing import Protocol

from django.conf import settings

log = logging.getLogger(__name__)

Handler = Callable[[dict], None]
_handlers: dict[str, list[Handler]] = defaultdict(list)


@dataclass(frozen=True)
class Event:
    name: str
    payload: dict = field(default_factory=dict)

    def to_bytes(self) -> bytes:
        return json.dumps({"name": self.name, "payload": self.payload}, separators=(",", ":")).encode()

    @classmethod
    def from_bytes(cls, data: bytes) -> "Event":
        body = json.loads(data)
        return cls(body["name"], body.get("payload", {}))


def subscribe(name: str) -> Callable[[Handler], Handler]:
    def register(handler: Handler) -> Handler:
        if handler not in _handlers[name]:
            _handlers[name].append(handler)
        return handler

    return register


def dispatch(event: Event) -> int:
    """Calls every handler of the event. An exception propagates, so Pub/Sub sees a failure and redelivers."""
    handlers = _handlers.get(event.name, [])
    if not handlers:
        log.warning("event %s has no handlers", event.name)
    for handler in handlers:
        handler(event.payload)
    return len(handlers)


class EventBus(Protocol):
    def publish(self, event: Event) -> None: ...


class InProcessBus:
    def publish(self, event: Event) -> None:
        dispatch(event)


class PubSubBus:
    def __init__(self, topic: str, publisher=None):
        if publisher is None:
            from google.cloud import pubsub_v1  # imported here: local runs never need the client

            publisher = pubsub_v1.PublisherClient()
        self.topic = topic
        self.publisher = publisher

    def publish(self, event: Event) -> None:
        # Waiting for the message id keeps "published" honest: the ingestion only moves on once Pub/Sub has it.
        self.publisher.publish(self.topic, event.to_bytes(), event=event.name).result(timeout=60)


@cache
def get_bus() -> EventBus:
    """One bus per process (a Singleton): the Pub/Sub client holds a gRPC channel and batching threads, which are
    meant to be shared, not built per call."""
    if settings.EVENT_BUS == "pubsub":
        return PubSubBus(settings.PUBSUB_TOPIC)
    if settings.EVENT_BUS == "inprocess":
        return InProcessBus()
    raise ValueError(f"unknown EVENT_BUS {settings.EVENT_BUS!r}")
