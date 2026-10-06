"""Press releases: route a company to its IR adapter, then normalize and classify the items."""

import hashlib
import importlib
from urllib.parse import urlparse

from core.config import get_company
from core.util import classify, now_iso


def _load_adapter(name: str):
    """Import core.adapters.<name>; raise ValueError for a bad or unknown adapter name."""
    if not isinstance(name, str) or not name.isidentifier() or name.startswith("_"):
        raise ValueError(f"invalid adapter name: {name!r}")
    try:
        return importlib.import_module(f"core.adapters.{name}")
    except ModuleNotFoundError as e:
        if e.name != f"core.adapters.{name}":
            raise
        raise ValueError(f"unknown adapter: {name!r}") from e


def get_press_releases(code: str, since: str | None = None) -> list[dict]:
    """Route to the company's adapter; return classified items newer than `since`, newest first."""
    company = get_company(code)
    name = company["press_releases"]["adapter"]
    adapter = _load_adapter(name)
    fetched_at = now_iso()
    items = []
    for raw in adapter.fetch_items(company):
        url = raw["url"]
        if urlparse(url).scheme not in ("http", "https"):
            continue
        published = raw["published"][:10]
        if since and published < since[:10]:
            continue
        category, flagged = classify(raw["title"], company)
        items.append(
            {
                "id": hashlib.sha1(f"{company['code']}|{url}".encode()).hexdigest()[:12],
                "company": company["code"],
                "title": raw["title"],
                "url": url,
                "published": published,
                "summary": raw.get("summary") or None,
                "category": category,
                "flagged": flagged,
                "source": f"{name}:{raw['channel']}",
                "fetched_at": fetched_at,
            }
        )
    items.sort(key=lambda i: i["published"], reverse=True)
    return items
