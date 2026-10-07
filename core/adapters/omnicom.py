"""Omnicom press releases from the Q4 IR platform's JSON feed on investor.omc.com.

This is the endpoint the IR news page itself loads (its q4News module passes the press
release categoryId); the full query string, categoryId included, lives in the watchlist URL.
PressReleaseDate is "MM/DD/YYYY HH:MM:SS" US Eastern time; only the date is kept.
"""

import datetime
import json
import re
from urllib.parse import urljoin

from core.util import fetch

MDY = re.compile(r"(\d{2})/(\d{2})/(\d{4})\b")


def parse_fixture(text: str, company: dict) -> list[dict]:
    """Pure parser for the Q4 GetPressReleaseList JSON; return adapter-shaped items."""
    base = company["press_releases"]["url"]
    items = []
    for release in json.loads(text).get("GetPressReleaseListResult") or []:
        title = (release.get("Headline") or "").strip()
        link = release.get("LinkToUrl") or release.get("LinkToDetailPage")
        match = MDY.match(release.get("PressReleaseDate") or "")
        if not title or not link or not match:
            continue
        month, day, year = (int(g) for g in match.groups())
        items.append(
            {
                "title": title,
                "url": urljoin(base, link),
                "published": datetime.date(year, month, day).isoformat(),
                "summary": (release.get("ShortDescription") or "").strip() or None,
                "channel": "json",
            }
        )
    return items


def fetch_items(company: dict) -> list[dict]:
    """Fetch and parse the configured JSON feed; raise ValueError if it yields no items."""
    url = company["press_releases"]["url"]
    items = parse_fixture(fetch(url).text, company)
    if not items:
        raise ValueError(f"[omnicom] no items parsed from {url}; feed format may have changed")
    return items
