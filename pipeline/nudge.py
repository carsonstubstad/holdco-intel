"""Print a Markdown Issue body listing flagged releases awaiting /curate, or nothing.
Run: python -m pipeline.nudge             (curate)
     python -m pipeline.nudge calendar    (calendar dates awaiting review)"""

import json
import sys
from pathlib import Path
from urllib.parse import quote, urlparse

from core.config import load_watchlist

MAX_BULLETS = 50
MAX_TITLE = 200
MARKDOWN_CONTROL = "[]()`*_<>"


def neutralize(title: str) -> str:
    """Return an untrusted title safe for an Issue body: one line, capped, no mentions or
    Markdown control characters."""
    text = " ".join(title.split())[:MAX_TITLE]
    text = text.replace("\\", "\\\\")
    for ch in MARKDOWN_CONTROL:
        text = text.replace(ch, "\\" + ch)
    return text.replace("@", "@\u200b")  # zero-width space: no @mention


def safe_url(url: str) -> str | None:
    """Return the URL percent-encoded so it cannot break out of '(...)', or None if not http(s)."""
    if urlparse(url).scheme not in ("http", "https"):
        return None
    return quote(url, safe=":/?#&=%+,;~.-")


def build_body(doc: dict) -> str:
    """Return the Issue body for press_releases.json, or '' when nothing is new."""
    wanted = set(doc.get("new_since_last_curate") or [])
    if not wanted:
        return ""
    items = [i for i in doc.get("items") or [] if i["id"] in wanted]
    items.sort(key=lambda i: i["published"], reverse=True)
    lines = [f"{len(wanted)} flagged releases since last curation", ""]
    for item in items[:MAX_BULLETS]:
        url = safe_url(item["url"])
        link = f" ({url})" if url else ""
        lines.append(
            f"- {item['published']} {item['company']} {item['category']}: "
            f"{neutralize(item['title'])}{link}"
        )
    lines += ["", "Run /curate in Claude Code."]
    return "\n".join(lines) + "\n"


def build_calendar_body(doc: dict, site_url: str) -> str:
    """Return the Issue body listing every pending calendar candidate, or '' when none."""
    items = sorted(doc.get("items") or [], key=lambda c: (c["date"], c["company"]))
    if not items:
        return ""
    new = set(doc.get("new_ids") or [])
    lines = [f"{len(items)} calendar dates to review ({len(new)} new this run)", ""]
    for item in items[:MAX_BULLETS]:
        url = safe_url(item["source_url"])
        link = f" ({url})" if url else ""
        replaces = f", replaces {item['replaces']}" if item.get("replaces") else ""
        marker = " (new)" if item["id"] in new else ""
        lines.append(
            f"- {item['date']} {item['company']} {item['type']}: "
            f"{neutralize(item['title'])}{link}{replaces}{marker}"
        )
    site = safe_url(site_url)
    lines += [
        "",
        f"Dashboard: {site}" if site else "Dashboard: (site_url not set)",
        (
            "Approval from the dashboard arrives in step 08d; until then copy approved dates "
            "into data/events.yaml by hand."
        ),
    ]
    return "\n".join(lines) + "\n"


def calendar_main(root: Path = Path(".")) -> int:
    """Print the calendar Issue body for docs/data/event_candidates.json; nothing if empty."""
    path = root / "docs" / "data" / "event_candidates.json"
    if not path.exists():
        return 0
    site_url = load_watchlist(str(root / "config" / "watchlist.yaml"))["dashboard"]["site_url"]
    body = build_calendar_body(json.loads(path.read_text(encoding="utf-8")), site_url)
    if body:
        sys.stdout.write(body)
    return 0


def main(root: Path = Path("."), argv: list[str] | tuple = ()) -> int:
    """Dispatch on argv: 'calendar' prints the calendar body; default prints the curate body
    for docs/data/press_releases.json, or nothing if none are new."""
    if list(argv[:1]) == ["calendar"]:
        return calendar_main(root)
    path = root / "docs" / "data" / "press_releases.json"
    if not path.exists():
        return 0
    body = build_body(json.loads(path.read_text(encoding="utf-8")))
    if body:
        sys.stdout.write(body)
    return 0


if __name__ == "__main__":
    sys.exit(main(argv=sys.argv[1:]))
