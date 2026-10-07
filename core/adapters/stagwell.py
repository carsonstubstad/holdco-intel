"""Stagwell press releases from the WordPress "Press Releases" category feed on stagwellglobal.com."""

from core.adapters._rss import parse_rss
from core.util import fetch


def parse_fixture(text: str, company: dict) -> list[dict]:
    """Pure parser for the Stagwell press category RSS feed; return adapter-shaped items."""
    return parse_rss(text, company["press_releases"]["url"])


def fetch_items(company: dict) -> list[dict]:
    """Fetch and parse the configured feed; raise ValueError if it yields no items."""
    url = company["press_releases"]["url"]
    items = parse_fixture(fetch(url).text, company)
    if not items:
        raise ValueError(f"[stagwell] no items parsed from {url}; feed format may have changed")
    return items
