"""Curated guidance records from data/guidance.json (written only by /curate)."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GUIDANCE_PATH = ROOT / "data" / "guidance.json"


def get_guidance(
    code: str | None = None, current_only: bool = True, *, path: Path | str = GUIDANCE_PATH
) -> list[dict]:
    """Return guidance records from data/guidance.json; current_only drops superseded records."""
    path = Path(path)
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8").strip()
    records = (json.loads(text) if text else {}).get("records") or []
    if current_only:
        superseded = {r["supersedes"] for r in records if r.get("supersedes")}
        records = [r for r in records if r["id"] not in superseded]
    if code:
        records = [r for r in records if str(r["company"]).upper() == code.upper()]
    return records
