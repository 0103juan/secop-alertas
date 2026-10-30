import base64
import json

import pytest

from events import bus as bus_module
from events.bus import Event, PubSubBus, dispatch, subscribe

PUSH = "/internal/events/pubsub"


def push_body(event: Event) -> dict:
    return {"message": {"data": base64.b64encode(event.to_bytes()).decode(), "messageId": "1"}, "subscription": "s"}


@pytest.fixture
def received():
    seen = []

    @subscribe("test.ping")
    def handler(payload):
        seen.append(payload)

    yield seen
    bus_module._handlers["test.ping"].remove(handler)


def test_dispatch_reaches_every_subscriber_once(received):
    subscribe("test.ping")(bus_module._handlers["test.ping"][0])  # registering twice is a no-op
    assert dispatch(Event("test.ping", {"n": 1})) == 1
    assert received == [{"n": 1}]


def test_pubsub_bus_waits_for_the_message_id():
    class Future:
        def result(self, timeout):
            self.timeout = timeout
            return "id-1"

    class Publisher:
        def publish(self, topic, data, **attributes):
            self.args = (topic, json.loads(data), attributes)
            self.future = Future()
            return self.future

    publisher = Publisher()
    PubSubBus("projects/p/topics/t", publisher=publisher).publish(Event("test.ping", {"n": 2}))
    assert publisher.args == ("projects/p/topics/t", {"name": "test.ping", "payload": {"n": 2}}, {"event": "test.ping"})
    assert publisher.future.timeout == 60


@pytest.fixture
def push_settings(settings):
    settings.PUBSUB_PUSH_AUDIENCE = "https://alertas.example.run.app/internal/events/pubsub"
    settings.PUBSUB_PUSH_SERVICE_ACCOUNT = "push@p.iam.gserviceaccount.com"
    return settings


def fake_verifier(monkeypatch, claims=None, error=None):
    def verify(token, request, audience):
        if error:
            raise error
        assert audience == "https://alertas.example.run.app/internal/events/pubsub"
        return claims

    monkeypatch.setattr("events.views.id_token.verify_oauth2_token", verify)


def test_push_without_token_is_rejected(client, push_settings, received):
    response = client.post(PUSH, push_body(Event("test.ping")), content_type="application/json")
    assert response.status_code == 401 and received == []


def test_push_with_invalid_signature_is_rejected(client, push_settings, monkeypatch, received):
    fake_verifier(monkeypatch, error=ValueError("Token expired"))
    response = client.post(
        PUSH, push_body(Event("test.ping")), content_type="application/json", HTTP_AUTHORIZATION="Bearer x"
    )
    assert response.status_code == 401 and received == []


def test_push_from_another_account_is_rejected(client, push_settings, monkeypatch, received):
    fake_verifier(monkeypatch, {"email": "intruder@p.iam.gserviceaccount.com", "email_verified": True})
    response = client.post(
        PUSH, push_body(Event("test.ping")), content_type="application/json", HTTP_AUTHORIZATION="Bearer x"
    )
    assert response.status_code == 401 and received == []


def test_valid_push_is_dispatched(client, push_settings, monkeypatch, received):
    fake_verifier(monkeypatch, {"email": "push@p.iam.gserviceaccount.com", "email_verified": True})
    response = client.post(
        PUSH, push_body(Event("test.ping", {"n": 3})), content_type="application/json", HTTP_AUTHORIZATION="Bearer x"
    )
    assert response.status_code == 204 and received == [{"n": 3}]


def test_malformed_push_is_acknowledged_not_retried(client, push_settings, monkeypatch, received):
    fake_verifier(monkeypatch, {"email": "push@p.iam.gserviceaccount.com", "email_verified": True})
    response = client.post(
        PUSH, {"message": {"data": "%%%"}}, content_type="application/json", HTTP_AUTHORIZATION="Bearer x"
    )
    assert response.status_code == 204 and received == []


def test_push_endpoint_is_off_until_configured(client, received):
    assert client.post(PUSH, push_body(Event("test.ping")), content_type="application/json").status_code == 404
