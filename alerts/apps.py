from django.apps import AppConfig


class AlertsConfig(AppConfig):
    name = "alerts"

    def ready(self) -> None:
        from . import matching  # noqa: F401  registers the event handlers
