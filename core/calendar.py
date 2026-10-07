"""Company IR calendars: parse each company's own events page into dated events.

The parser is chosen by the `calendar.parser` key in the watchlist; every parser states its
day/month order explicitly. Broker and industry conferences are dropped, not returned.
"""

import datetime
import json
import re
import time
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from core.config import get_company
from core.util import fetch, now_iso

CONFERENCE = re.compile(r"conference(?! call)|summit|communacopia", re.IGNORECASE)
TYPE_PATTERNS = [
    (
        "results",
        re.compile(
            r"earnings|results|revenue|trading update|quarter\b|\bQ[1-4]\b|\bH[12]\b",
            re.IGNORECASE,
        ),
    ),
    ("agm", re.compile(r"(annual|general|shareholders?\W?)\s+meeting|\bAGM\b", re.IGNORECASE)),
    ("capital_markets_day", re.compile(r"investor day|capital markets day", re.IGNORECASE)),
]
DMY = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")
MDY = re.compile(r"^(\d{2})/(\d{2})/(\d{4})\b")
DAY_MONTH = re.compile(r"^(\d{1,2})\s+([A-Za-z]+)")


def event_type(title: str) -> str | None:
    """Return results | agm | capital_markets_day | other for an event title, None for a
    conference."""
    if CONFERENCE.search(title):
        return None
    for name, pattern in TYPE_PATTERNS:
        if pattern.search(title):
            return name
    return "other"


def _strpdate(text: str, fmt: str) -> datetime.date:
    """Calendar date from text in fmt (no time, no timezone); raise ValueError on mismatch."""
    stamp = time.strptime(text, fmt)
    return datetime.date(stamp.tm_year, stamp.tm_mon, stamp.tm_mday)


def _month(name: str) -> int:
    """Month number from an English month name or abbreviation ("Jul", "August")."""
    return _strpdate(name[:3].title(), "%b").month


def _soup_text(node) -> str:
    return " ".join(node.get_text(" ", strip=True).split()) if node else ""


def _parse_publicis(text: str, url: str, today: datetime.date) -> list[dict]:
    """Investor events archive: li.archive-element with a DD/MM/YYYY date (day first)."""
    elements = BeautifulSoup(text, "html.parser").select("li.archive-element")
    if not elements:
        raise ValueError("no li.archive-element on the page")
    events = []
    for el in elements:
        title = _soup_text(el.select_one(".archive-element__title"))
        match = DMY.match(_soup_text(el.select_one(".archive-element__date")))
        if not title or not match:
            continue
        day, month, year = (int(g) for g in match.groups())
        events.append({"date": datetime.date(year, month, day), "title": title, "source_url": url})
    return events


def _parse_omnicom(text: str, url: str, today: datetime.date) -> list[dict]:
    """Q4 GetEventList JSON: StartDate is MM/DD/YYYY HH:MM:SS (month first)."""
    data = json.loads(text)
    if "GetEventListResult" not in data:
        raise ValueError("GetEventListResult missing from the response")
    events = []
    for row in data["GetEventListResult"] or []:
        title = " ".join((row.get("Title") or "").split())
        match = MDY.match(row.get("StartDate") or "")
        if not title or not match:
            continue
        month, day, year = (int(g) for g in match.groups())
        link = row.get("LinkToDetailPage")
        events.append(
            {
                "date": datetime.date(year, month, day),
                "title": title,
                "source_url": urljoin(url, link) if link else url,
            }
        )
    return events


def _parse_wpp(text: str, url: str, today: datetime.date) -> list[dict]:
    """Calendar page: an <h2>YYYY</h2> followed by a table of "6 August | Event" rows."""
    soup = BeautifulSoup(text, "html.parser")
    years = [h for h in soup.find_all("h2") if re.fullmatch(r"\d{4}", _soup_text(h))]
    if not years:
        raise ValueError("no year heading on the page")
    events = []
    for heading in years:
        year = int(_soup_text(heading))
        table = heading.find_next("table")
        for row in table.find_all("tr") if table else []:
            cells = row.find_all("td")
            if len(cells) < 2:
                continue
            match = DAY_MONTH.match(_soup_text(cells[0]))
            title = _soup_text(cells[1])
            if not match or not title:
                continue
            date = datetime.date(year, _month(match.group(2)), int(match.group(1)))
            events.append({"date": date, "title": title, "source_url": url})
    return events


def _parse_havas(text: str, url: str, today: datetime.date) -> list[dict]:
    """Upcoming slider ("October 14, 2026") plus a newest-first past list with day and month
    only; past years are inferred by walking back from today."""
    soup = BeautifulSoup(text, "html.parser")
    upcoming = soup.select(".f-eventUpcoming__item")
    past = soup.select(".f-eventPast__content li")
    if not upcoming and not past:
        raise ValueError("no f-eventUpcoming or f-eventPast items on the page")
    events = []
    for item in upcoming:
        stamp = _soup_text(item.select_one(".f-eventUpcoming__date"))
        desc = item.select_one(".f-eventUpcoming__description")
        title = _soup_text(desc.find("p", recursive=False)) if desc else ""
        try:
            date = _strpdate(stamp, "%B %d, %Y")
        except ValueError:
            continue
        if title:
            events.append({"date": date, "title": title, "source_url": url})
    ref = today
    for item in past:
        stamp = _soup_text(item.select_one(".f-eventPast__date"))
        title = _soup_text(item.select_one(".f-eventPast__title"))
        match = DAY_MONTH.match(stamp)
        if not match or not title:
            continue
        month, day = _month(match.group(2)), int(match.group(1))
        date = datetime.date(ref.year, month, day)
        if date > ref:
            date = datetime.date(ref.year - 1, month, day)
        ref = date
        events.append({"date": date, "title": title, "source_url": url})
    return events


def _parse_stagwell(text: str, url: str, today: datetime.date) -> list[dict]:
    """Events archive cards: a "Mon DD, YYYY" paragraph and an h4 title."""
    cards = BeautifulSoup(text, "html.parser").select(".sw-download-card")
    if not cards:
        raise ValueError("no sw-download-card on the page")
    events = []
    for card in cards:
        title = _soup_text(card.select_one("h4"))
        for p in card.select("p"):
            try:
                date = _strpdate(_soup_text(p), "%b %d, %Y")
            except ValueError:
                continue
            if title:
                events.append({"date": date, "title": title, "source_url": url})
            break
    return events


PARSERS = {
    "publicis": _parse_publicis,
    "omnicom": _parse_omnicom,
    "wpp": _parse_wpp,
    "havas": _parse_havas,
    "stagwell": _parse_stagwell,
}


def parse_calendar(
    company: dict, text: str, today: datetime.date, fetched_at: str
) -> list[dict]:
    """Pure: parse a calendar page with the company's parser into typed events, conferences
    dropped; raise ValueError when the page yields no events."""
    cal = company["calendar"]
    parser = PARSERS.get(cal["parser"])
    if parser is None:
        raise ValueError(f"unknown calendar parser: {cal['parser']!r}")
    raw = parser(text, cal["url"], today)
    if not raw:
        raise ValueError(f"[calendar] no events parsed from {cal['url']}; format may have changed")
    events = []
    for item in raw:
        kind = event_type(item["title"])
        if kind is None:
            continue
        events.append(
            {
                "company": company["code"],
                "date": item["date"].isoformat(),
                "type": kind,
                "title": item["title"],
                "source_url": item["source_url"],
                "source": f"calendar:{cal['parser']}",
                "fetched_at": fetched_at,
            }
        )
    events.sort(key=lambda e: e["date"], reverse=True)
    return events


def get_calendar(code: str) -> list[dict]:
    """Fetch the company's IR calendar (after its crawl delay) and return typed events,
    newest first; raise on failure or zero events."""
    company = get_company(code)
    cal = company.get("calendar")
    if not cal:
        raise ValueError(f"{code}: no calendar block in the watchlist")
    time.sleep(float(cal.get("crawl_delay_s") or 0))
    text = fetch(cal["url"]).text
    today = datetime.datetime.now(datetime.UTC).date()
    return parse_calendar(company, text, today, now_iso())
