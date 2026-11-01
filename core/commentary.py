"""Curated management commentary from data/commentary.json (written only by /curate)."""

import json
from pathlib import Path

from core.config import load_watchlist

ROOT = Path(__file__).resolve().parent.parent
COMMENTARY_PATH = ROOT / "data" / "commentary.json"
THEMES = (
    "performance",
    "strategy",
    "ai_and_data",
    "clients_and_new_business",
    "outlook",
    "capital_allocation",
)
SOURCE_TYPES = (
    "results_release",
    "call_transcript",
    "results_slides",
    "annual_report",
    "investor_day",
    "strategy_plan",
    "announcement",
)


def _kind(item: dict) -> tuple[str, str]:
    """(company, source_type), where missing (as on headlines) means results_release."""
    return item["company"], item.get("source_type") or "results_release"


def _read_key(read: dict) -> tuple[str, int]:
    """(date, n) from a read, so read-2026-11-01-2 sorts after read-2026-11-01-1."""
    return read["date"], int(str(read["id"]).rsplit("-", 1)[-1])


def get_commentary(
    code: str | None = None,
    theme: str | None = None,
    latest_only: bool = True,
    *,
    path: Path | str = COMMENTARY_PATH,
) -> dict:
    """Return {headlines, records, reads} from commentary.json; latest_only keeps each company's
    newest document per source_type and only the newest read; reads come newest first and code
    and theme never filter them."""
    path = Path(path)
    data = {}
    if path.exists():
        text = path.read_text(encoding="utf-8").strip()
        data = json.loads(text) if text else {}
    headlines = data.get("headlines") or []
    records = data.get("records") or []
    reads = sorted(data.get("reads") or [], key=_read_key, reverse=True)
    if latest_only:
        reads = reads[:1]
    if code:
        headlines = [h for h in headlines if str(h["company"]).upper() == code.upper()]
        records = [r for r in records if str(r["company"]).upper() == code.upper()]
    if latest_only:
        newest: dict[tuple[str, str], str] = {}
        for item in headlines + records:
            newest[_kind(item)] = max(newest.get(_kind(item), ""), item["release_date"])
        headlines = [h for h in headlines if h["release_date"] == newest[_kind(h)]]
        records = [r for r in records if r["release_date"] == newest[_kind(r)]]
    if theme:
        records = [r for r in records if r["theme"] == theme]
    order = {str(c["code"]).upper(): i for i, c in enumerate(load_watchlist()["companies"])}

    def rank(item: dict) -> int:
        return order.get(str(item["company"]).upper(), len(order))

    headlines = sorted(headlines, key=lambda h: (rank(h), h["release_date"]))
    records = sorted(records, key=lambda r: (rank(r), r["theme"], r["id"]))
    return {"headlines": headlines, "records": records, "reads": reads}
