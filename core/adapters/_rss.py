"""Shared RSS parser for IR feeds (not an adapter: the router refuses names starting with _)."""

import email.utils
import re
import time
from urllib.parse import urljoin

import feedparser
from bs4 import BeautifulSoup

WP_BOILERPLATE = re.compile(r"^The post .* appeared first on .*$", re.DOTALL)


def _published(entry) -> str | None:
    """Publish date in the publisher's own timezone (feedparser's parsed stamp is UTC)."""
    try:
        return email.utils.parsedate_to_datetime(entry.get("published")).date().isoformat()
    except (TypeError, ValueError):
        stamp = entry.get("published_parsed")
        return time.strftime("%Y-%m-%d", stamp) if stamp else None


def parse_rss(text: str, base_url: str) -> list[dict]:
    """Pure RSS parser; return adapter-shaped items with links resolved against base_url."""
    items = []
    for entry in feedparser.parse(text).entries:
        published = _published(entry)
        if not entry.get("title") or not entry.get("link") or not published:
            continue
        summary = BeautifulSoup(entry.get("summary") or "", "html.parser").get_text(" ", strip=True)
        if WP_BOILERPLATE.match(summary):
            summary = ""
        items.append(
            {
                "title": entry.title.strip(),
                "url": urljoin(base_url, entry.link.strip()),
                "published": published,
                "summary": summary or None,
                "channel": "rss",
            }
        )
    return items
