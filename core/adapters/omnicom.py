"""Omnicom press releases from the investor site's RSS feed (Q4 IR platform)."""

import time

import feedparser
from bs4 import BeautifulSoup

from core.util import fetch


def parse_fixture(text: str, company: dict) -> list[dict]:
    """Pure parser for the Omnicom IR RSS feed; return adapter-shaped items."""
    items = []
    for entry in feedparser.parse(text).entries:
        stamp = entry.get("published_parsed")
        if not entry.get("title") or not entry.get("link") or not stamp:
            continue
        summary = BeautifulSoup(entry.get("summary") or "", "html.parser").get_text(" ", strip=True)
        items.append(
            {
                "title": entry.title.strip(),
                "url": entry.link.strip(),
                "published": time.strftime("%Y-%m-%d", stamp),
                "summary": summary or None,
                "channel": "rss",
            }
        )
    return items


def fetch_items(company: dict) -> list[dict]:
    """Fetch and parse the configured feed; raise ValueError if it yields no items."""
    url = company["press_releases"]["url"]
    items = parse_fixture(fetch(url).text, company)
    if not items:
        raise ValueError(f"[omnicom] no items parsed from {url}; feed format may have changed")
    return items
