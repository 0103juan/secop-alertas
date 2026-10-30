"""What the alerts app does when other apps announce something. Registered in AlertsConfig.ready()."""

from contracts.events import CONTRACTS_CHANGED
from events.bus import subscribe

from .delivery import deliver_pending
from .matching import match


@subscribe(CONTRACTS_CHANGED)
def on_contracts_changed(payload: dict) -> None:
    match(payload.get("ids", []))
    deliver_pending()
