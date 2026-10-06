"""Per-source run health: record results into a status dict, read the committed status.json."""

import json
from pathlib import Path

from core.util import now_iso

ROOT = Path(__file__).resolve().parent.parent
STATUS_PATH = ROOT / "docs" / "data" / "status.json"
MAX_ERROR = 300


def record(
    status: dict, source: str, *, ok: bool, items: int, ms: int, error: str | None = None
) -> None:
    """Mutate the status dict with one source's result; keep an existing last_ok on failure."""
    sources = status.setdefault("sources", {})
    previous = sources.get(source) or {}
    sources[source] = {
        "ok": ok,
        "items": items,
        "ms": ms,
        "error": error[:MAX_ERROR] if error else None,
        "last_ok": now_iso() if ok else previous.get("last_ok"),
    }


def get_status(*, path: Path | str = STATUS_PATH) -> dict:
    """Return docs/data/status.json, or {} when it does not exist yet."""
    path = Path(path)
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))
