import hashlib
import hmac
import json
from datetime import timedelta

import httpx
import pytest
from django.core import mail
from django.utils import timezone

from alerts import notifiers
from alerts.delivery import MAX_ATTEMPTS, backoff, claim, deliver_pending
from alerts.matching import match
from alerts.models import Alert, Channel, Subscription
from contracts.events import CONTRACTS_CHANGED
from events.bus import Event, dispatch

KEYWORD_VIAS = [{"type": "keyword", "params": {"words": ["vías"]}}]


@pytest.fixture(autouse=True)
def public_dns(monkeypatch):
    """Webhook hosts resolve to a public address unless a test says otherwise; no real DNS in tests."""
    monkeypatch.setattr(
        notifiers.socket, "getaddrinfo", lambda host, port: [(None, None, None, None, ("93.184.215.14", port))]
    )


def test_register_then_get_a_token(api, db):
    response = api.post(
        "/api/v1/auth/register/", {"username": "luis", "email": "l@example.com", "password": "otra-clave-larga-456"}
    )
    assert response.status_code == 201 and "password" not in response.json()
    token = api.post("/api/v1/auth/token/", {"username": "luis", "password": "otra-clave-larga-456"}).json()
    assert {"access", "refresh"} <= token.keys()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {token['access']}")
    assert api.get("/api/v1/subscriptions/").status_code == 200


def test_weak_password_is_refused(api, db):
    response = api.post("/api/v1/auth/register/", {"username": "x", "email": "x@example.com", "password": "123"})
    assert response.status_code == 400 and "password" in response.json()


def test_subscriptions_need_a_user(api, db):
    assert api.get("/api/v1/subscriptions/").status_code == 401


def test_invalid_rules_and_targets_are_refused(auth_api):
    bad_rule = auth_api.post(
        "/api/v1/subscriptions/", {"name": "x", "rules": [{"type": "nope"}], "target": "a@example.com"}, format="json"
    )
    assert bad_rule.status_code == 400 and "type must be one of" in bad_rule.json()["rules"][0]
    bad_email = auth_api.post(
        "/api/v1/subscriptions/", {"name": "x", "rules": KEYWORD_VIAS, "target": "nope"}, format="json"
    )
    assert bad_email.status_code == 400


def test_webhooks_to_private_networks_are_refused(auth_api, monkeypatch):
    monkeypatch.setattr(
        notifiers.socket, "getaddrinfo", lambda host, port: [(None, None, None, None, ("169.254.169.254", port))]
    )
    response = auth_api.post(
        "/api/v1/subscriptions/",
        {"name": "x", "rules": KEYWORD_VIAS, "channel": "webhook", "target": "https://metadata.example"},
        format="json",
    )
    assert response.status_code == 400 and "non-public" in response.json()["target"][0]
    http = auth_api.post(
        "/api/v1/subscriptions/",
        {"name": "x", "rules": KEYWORD_VIAS, "channel": "webhook", "target": "http://example.org/hook"},
        format="json",
    )
    assert http.status_code == 400


def test_a_user_cannot_see_another_users_subscription(auth_api, django_user_model, db):
    other = django_user_model.objects.create_user("eva", "e@example.com", "x")
    theirs = Subscription.objects.create(owner=other, name="ajena", rules=KEYWORD_VIAS, target="e@example.com")
    assert auth_api.get(f"/api/v1/subscriptions/{theirs.pk}/").status_code == 404
    assert auth_api.get(f"/api/v1/subscriptions/{theirs.pk}/secret/").status_code == 404
    assert auth_api.get("/api/v1/subscriptions/").json()["results"] == []


def test_preview_runs_the_rules_in_the_database(auth_api, contract):
    contract(object="Mejoramiento de VIAS urbanas")
    contract(object="Compra de computadores")
    created = auth_api.post(
        "/api/v1/subscriptions/", {"name": "vías", "rules": KEYWORD_VIAS, "target": "ana@example.com"}, format="json"
    ).json()
    preview = auth_api.get(f"/api/v1/subscriptions/{created['id']}/preview/").json()
    assert [c["object"] for c in preview] == ["Mejoramiento de VIAS urbanas"]
    assert "supplier_doc" not in preview[0]


def test_event_creates_alerts_once_and_emails_them(user, contract):
    Subscription.objects.create(owner=user, name="vías", rules=KEYWORD_VIAS, target="ana@example.com")
    hit, miss = contract(object="Vías terciarias"), contract(object="Papelería")
    event = Event(CONTRACTS_CHANGED, {"ids": [hit.id, miss.id]})
    dispatch(event)
    dispatch(event)  # Pub/Sub delivers at least once
    assert Alert.objects.count() == 1
    assert len(mail.outbox) == 1 and "Vías terciarias" in mail.outbox[0].body
    assert Alert.objects.get().delivered_at is not None


def test_webhook_is_signed_and_failures_are_retried_then_given_up(user, contract, monkeypatch):
    received = []
    status = {"code": 500}

    def handler(request):
        received.append(request)
        return httpx.Response(status["code"])

    transport = httpx.MockTransport(handler)
    monkeypatch.setitem(
        notifiers._NOTIFIERS, Channel.WEBHOOK, lambda: notifiers.WebhookNotifier(httpx.Client(transport=transport))
    )
    sub = Subscription.objects.create(
        owner=user, name="hook", rules=KEYWORD_VIAS, channel=Channel.WEBHOOK, target="https://hooks.example.org/alertas"
    )
    match([contract(object="vías").id])
    assert deliver_pending() == 0
    alert = Alert.objects.get()
    assert alert.delivered_at is None and alert.attempts == 1
    assert alert.claimed_until > timezone.now() + timedelta(seconds=50)  # first backoff: one minute

    status["code"] = 200
    assert deliver_pending() == 0  # not due yet: the receiver is not hammered
    Alert.objects.update(claimed_until=timezone.now() - timedelta(seconds=1))
    assert deliver_pending() == 1
    request = received[-1]
    body = request.content.decode()
    expected = hmac.new(
        sub.secret.encode(), f"{request.headers['X-Alertas-Timestamp']}.{body}".encode(), hashlib.sha256
    ).hexdigest()
    assert request.headers["X-Alertas-Signature"] == f"sha256={expected}"
    assert json.loads(body)["contracts"][0]["object"] == "vías"

    Alert.objects.update(delivered_at=None, attempts=MAX_ATTEMPTS)
    assert deliver_pending() == 0  # given up after MAX_ATTEMPTS


def test_inactive_subscriptions_get_nothing(user, contract):
    Subscription.objects.create(owner=user, name="off", rules=KEYWORD_VIAS, target="a@example.com", active=False)
    assert match([contract(object="vías").id]) == 0


def test_a_claimed_alert_is_not_taken_by_a_second_worker_until_its_lease_expires(user, contract):
    Subscription.objects.create(owner=user, name="vías", rules=KEYWORD_VIAS, target="ana@example.com")
    match([contract(object="vías").id])
    assert len(claim(10)) == 1
    assert claim(10) == []  # a second worker, while the first one is sending
    Alert.objects.update(claimed_until=timezone.now() - timedelta(seconds=1))  # the first worker died
    assert len(claim(10)) == 1


def test_backoff_doubles():
    assert [backoff(n).total_seconds() / 60 for n in (1, 2, 3, 4)] == [1, 2, 4, 8]


def test_the_admin_cannot_save_rules_the_matcher_cannot_run(user):
    from django.core.exceptions import ValidationError

    subscription = Subscription(
        owner=user, name="x", rules=[{"type": "keyword", "params": {"words": ["ab"]}}], target="a@example.com"
    )
    with pytest.raises(ValidationError, match="at least 3 characters"):
        subscription.full_clean()
