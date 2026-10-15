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


def get_commentary(
    code: str | None = None,
    theme: str | None = None,
    latest_only: bool = True,
    *,
    path: Path | str = COMMENTARY_PATH,
) -> dict:
    """Return {headlines, records} from commentary.json; latest_only keeps newest release each."""
    path = Path(path)
    data = {}
    if path.exists():
        text = path.read_text(encoding="utf-8").strip()
        data = json.loads(text) if text else {}
    headlines = data.get("headlines") or []
    records = data.get("records") or []
    if code:
        headlines = [h for h in headlines if str(h["company"]).upper() == code.upper()]
        records = [r for r in records if str(r["company"]).upper() == code.upper()]
    if latest_only:
        newest: dict[str, str] = {}
        for item in headlines + records:
            newest[item["company"]] = max(newest.get(item["company"], ""), item["release_date"])
        headlines = [h for h in headlines if h["release_date"] == newest[h["company"]]]
        records = [r for r in records if r["release_date"] == newest[r["company"]]]
    if theme:
        records = [r for r in records if r["theme"] == theme]
    order = {str(c["code"]).upper(): i for i, c in enumerate(load_watchlist()["companies"])}

    def rank(item: dict) -> int:
        return order.get(str(item["company"]).upper(), len(order))

    headlines = sorted(headlines, key=lambda h: (rank(h), h["release_date"]))
    records = sorted(records, key=lambda r: (rank(r), r["theme"], r["id"]))
    return {"headlines": headlines, "records": records}
