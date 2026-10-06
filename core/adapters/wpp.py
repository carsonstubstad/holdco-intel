"""WPP press releases from the server-rendered news list on wpp.com.

Titles and links are the news anchors in the HTML. Publish dates are not in the anchors;
they sit in the inline Next.js payload (self.__next_f.push scripts) of the same response,
as JSON objects of type PageNewsArticle keyed by slug.
"""

import json
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from core.util import fetch

NEWS_PREFIX = "/en/news/"
PUSH_PREFIX = "self.__next_f.push("
ARTICLE_START = re.compile(r'\{"sys":\{"id":"[^"]+"\},"__typename":"PageNewsArticle"')


def _dates_by_slug(soup: BeautifulSoup) -> dict:
    """Return {slug: YYYY-MM-DD} from the PageNewsArticle objects in the Next.js payload."""
    chunks = []
    for script in soup.find_all("script"):
        text = (script.string or "").strip()
        if text.startswith(PUSH_PREFIX) and text.endswith(")"):
            try:
                pushed = json.loads(text[len(PUSH_PREFIX) : -1])
            except json.JSONDecodeError:
                continue
            if len(pushed) > 1 and isinstance(pushed[1], str):
                chunks.append(pushed[1])
    payload = "".join(chunks)
    decoder = json.JSONDecoder()
    dates = {}
    for match in ARTICLE_START.finditer(payload):
        try:
            article, _ = decoder.raw_decode(payload, match.start())
        except json.JSONDecodeError:
            continue
        slug, published = article.get("slug"), article.get("publishDate")
        if slug and published:
            dates[slug] = published[:10]
    return dates


def parse_fixture(text: str, company: dict) -> list[dict]:
    """Pure parser for the WPP news page; raise ValueError if anchors exist but no dates do."""
    base = company["press_releases"]["url"]
    soup = BeautifulSoup(text, "html.parser")
    anchors = [a for a in soup.find_all("a", href=True) if a["href"].startswith(NEWS_PREFIX)]
    dates = _dates_by_slug(soup)
    if anchors and not dates:
        raise ValueError("[wpp] news anchors found but no publish dates; page format changed")
    items, seen = [], set()
    for a in anchors:
        url = urljoin(base, a["href"])
        slug = urlparse(url).path.removeprefix(NEWS_PREFIX).strip("/")  # may contain YYYY/MM/
        title = a.get_text(" ", strip=True)
        if url in seen or not title or slug not in dates:
            continue
        seen.add(url)
        items.append(
            {
                "title": title,
                "url": url,
                "published": dates[slug],
                "summary": None,
                "channel": "html",
            }
        )
    return items


def fetch_items(company: dict) -> list[dict]:
    """Fetch and parse the configured news page; raise ValueError if it yields no items."""
    url = company["press_releases"]["url"]
    items = parse_fixture(fetch(url).text, company)
    if not items:
        raise ValueError(f"[wpp] no items parsed from {url}; page format may have changed")
    return items
