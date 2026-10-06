"""Print a Markdown Issue body listing flagged releases awaiting /curate, or nothing.
Run: python -m pipeline.nudge"""

import json
import sys
from pathlib import Path
from urllib.parse import quote, urlparse

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


def main(root: Path = Path(".")) -> int:
    """Print the nudge body for docs/data/press_releases.json; print nothing if none are new."""
    path = root / "docs" / "data" / "press_releases.json"
    if not path.exists():
        return 0
    body = build_body(json.loads(path.read_text(encoding="utf-8")))
    if body:
        sys.stdout.write(body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
