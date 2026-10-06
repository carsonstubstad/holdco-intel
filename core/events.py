"""Corporate calendar from the hand-maintained data/events.yaml."""

import datetime
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
EVENTS_PATH = ROOT / "data" / "events.yaml"


def _iso(value: object) -> object:
    """Return dates as ISO strings (YAML loads them as datetime.date), everything else as is."""
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    return value


def get_events(
    code: str | None = None,
    past_days: int = 365,
    future_days: int = 180,
    *,
    path: Path | str = EVENTS_PATH,
) -> list[dict]:
    """Return events from data/events.yaml within the window, optionally for one company,
    sorted by date."""
    path = Path(path)
    if not path.exists():
        return []
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    today = datetime.datetime.now(datetime.UTC).date()
    start = (today - datetime.timedelta(days=past_days)).isoformat()
    end = (today + datetime.timedelta(days=future_days)).isoformat()
    events = []
    for raw in data.get("items") or []:
        event = {k: _iso(v) for k, v in raw.items()}
        if code and str(event.get("company", "")).upper() != code.upper():
            continue
        if start <= event["date"] <= end:
            events.append(event)
    events.sort(key=lambda e: e["date"])
    return events
