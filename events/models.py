from django.db import models
from django.db.models import Q


class OutboxEvent(models.Model):
    """An event written in the same transaction as the data it is about (the transactional outbox).

    Publishing straight to Pub/Sub after a commit loses the event if the process dies in between; publishing before
    the commit announces data that may roll back. Here the event is durable as soon as the data is, and `relay`
    publishes it afterwards, at least once.
    """

    name = models.CharField(max_length=100)
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    published_at = models.DateTimeField(null=True)

    class Meta:
        indexes = [models.Index(fields=["id"], condition=Q(published_at__isnull=True), name="outbox_pending")]

    def __str__(self) -> str:
        return f"{self.name} #{self.pk}"
