"""The events this app publishes. Consumers import the names from here, never from the code that emits them."""

CONTRACTS_CHANGED = "contracts.changed"  # payload: {"ids": [contract id, ...]}, at most EVENT_BATCH ids
EVENT_BATCH = 500  # a Pub/Sub message may hold 10 MB; smaller batches are cheaper to retry
