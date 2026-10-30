"""How alerts leave the system: one Notifier per channel, chosen by a Factory.

A new channel (Slack, SMS) is one class plus one line in `_NOTIFIERS`; the matcher does not change.
"""

import hashlib
import hmac
import ipaddress
import json
import socket
import time
from abc import ABC, abstractmethod
from urllib.parse import urlsplit

import httpx
from django.conf import settings
from django.core.mail import send_mail

from contracts.models import Contract

from .models import Channel, Subscription


class DeliveryError(Exception):
    pass


def contract_summary(contract: Contract) -> dict:
    return {
        "id": contract.id,
        "entity": contract.entity,
        "object": contract.object,
        "supplier": contract.supplier,
        "value_cop": contract.value_cop,
        "signed_on": contract.signed_on.isoformat() if contract.signed_on else None,
        "url": contract.url,
    }


class Notifier(ABC):
    @abstractmethod
    def send(self, subscription: Subscription, contracts: list[Contract]) -> None:
        """Delivers a batch of matches or raises DeliveryError; the caller records the attempt either way."""


class EmailNotifier(Notifier):
    def send(self, subscription: Subscription, contracts: list[Contract]) -> None:
        lines = [f"- {c.entity}: {c.object[:160]} ({c.value_cop or 'sin valor'} COP)\n  {c.url}" for c in contracts]
        try:
            send_mail(
                subject=f"[SECOP alertas] {len(contracts)} contrato(s) para «{subscription.name}»",
                message="\n".join(lines),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[subscription.target],
            )
        except OSError as error:
            raise DeliveryError(str(error)) from error


class WebhookNotifier(Notifier):
    """POSTs JSON signed with the subscription's secret, the way Stripe and GitHub sign theirs: the receiver
    recomputes HMAC-SHA256 over `timestamp.body` and rejects old timestamps to stop replays."""

    def __init__(self, client: httpx.Client | None = None):
        self.client = client or httpx.Client(timeout=10, follow_redirects=False)

    def send(self, subscription: Subscription, contracts: list[Contract]) -> None:
        ensure_public_https(subscription.target)  # checked again at send time: DNS may have changed since
        body = json.dumps({"subscription": subscription.name, "contracts": [contract_summary(c) for c in contracts]})
        timestamp = str(int(time.time()))
        signature = sign(subscription.secret, timestamp, body)
        try:
            response = self.client.post(
                subscription.target,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Alertas-Timestamp": timestamp,
                    "X-Alertas-Signature": f"sha256={signature}",
                },
            )
        except httpx.HTTPError as error:
            raise DeliveryError(str(error)) from error
        if response.status_code >= 300:
            raise DeliveryError(f"webhook answered {response.status_code}")


def sign(secret: str, timestamp: str, body: str) -> str:
    return hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()


def ensure_public_https(url: str) -> None:
    """Refuses URLs that would make the server call itself or a private network (SSRF)."""
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        raise DeliveryError("the webhook must be an https URL")
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(parts.hostname, parts.port or 443)}
    except socket.gaierror as error:
        raise DeliveryError(f"cannot resolve {parts.hostname}") from error
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        if not ip.is_global:
            raise DeliveryError(f"{parts.hostname} resolves to a non-public address")


_NOTIFIERS: dict[str, type[Notifier]] = {Channel.EMAIL: EmailNotifier, Channel.WEBHOOK: WebhookNotifier}


def notifier_for(channel: str) -> Notifier:
    try:
        return _NOTIFIERS[channel]()
    except KeyError:
        raise ValueError(f"no notifier for channel {channel!r}") from None
