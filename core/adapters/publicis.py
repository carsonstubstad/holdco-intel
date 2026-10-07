"""Publicis press releases from the server-rendered archive list on publicisgroupe.com.

Each release is an li.archive-element with the title, an MM/DD/YYYY date and a "Read more"
link (an HTML page, or a PDF for older items). The list is newest first and holds the full
archive; the pipeline's retention window trims old items.
"""

import datetime
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from core.util import fetch

MDY = re.compile(r"(\d{2})/(\d{2})/(\d{4})")


def parse_fixture(text: str, company: dict) -> list[dict]:
    """Pure parser for the Publicis archive list; raise ValueError if titles exist but no dates."""
    base = company["press_releases"]["url"]
    soup = BeautifulSoup(text, "html.parser")
    items, seen, undated = [], set(), 0
    for element in soup.select("li.archive-element"):
        title_el = element.select_one(".archive-element__title")
        date_el = element.select_one(".archive-element__date")
        link = element.select_one(".archive-element__links a[href]")
        title = title_el.get_text(" ", strip=True) if title_el else ""
        if not title or not link:
            continue
        match = MDY.fullmatch(date_el.get_text(strip=True)) if date_el else None
        if not match:
            undated += 1
            continue
        month, day, year = (int(g) for g in match.groups())
        published = datetime.date(year, month, day)  # raises on a DD/MM swap past day 12
        url = urljoin(base, link["href"])
        if url in seen:
            continue
        seen.add(url)
        items.append(
            {
                "title": " ".join(title.split()),
                "url": url,
                "published": published.isoformat(),
                "summary": None,
                "channel": "html",
            }
        )
    if undated and not items:
        raise ValueError("[publicis] archive titles found but no MM/DD/YYYY dates; format changed")
    return items


def fetch_items(company: dict) -> list[dict]:
    """Fetch and parse the configured archive page; raise ValueError if it yields no items."""
    url = company["press_releases"]["url"]
    items = parse_fixture(fetch(url).text, company)
    if not items:
        raise ValueError(f"[publicis] no items parsed from {url}; page format may have changed")
    return items
