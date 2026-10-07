"""Tests for the IR calendar parsers: recorded fixtures, no network."""

import datetime
from pathlib import Path

import pytest

from core import calendar
from core.config import get_company

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "fixtures"
TODAY = datetime.date(2026, 10, 7)
EVENT_KEYS = {"company", "date", "type", "title", "source_url", "source", "fetched_at"}
FIXTURE_FILES = {
    "PUB": "cal_pub.html",
    "OMC": "cal_omc.json",
    "WPP": "cal_wpp.html",
    "HAVAS": "cal_havas.html",
    "STGW": "cal_stgw.html",
}


def _parse(code: str, today: datetime.date = TODAY) -> list[dict]:
    text = (FIXTURES / FIXTURE_FILES[code]).read_text(encoding="utf-8")
    return calendar.parse_calendar(get_company(code), text, today, "2026-10-07T00:00:00Z")


def _find(events: list[dict], date: str) -> dict:
    return next(e for e in events if e["date"] == date)


@pytest.mark.parametrize(
    ("title", "kind"),
    [
        ("Publicis Groupe - Third Quarter 2026 Revenue", "results"),
        ("First Quarter Trading Update 2026", "results"),
        ("Stagwell Q4 FY25 Earnings Call", "results"),
        ("Omnicom Acquisition of Interpublic Conference Call", "other"),
        ("Combined General Shareholders’ Meeting", "agm"),
        ("2026 Annual Meeting (Prior Registration Required)", "agm"),
        ("Omnicom Investor Day", "capital_markets_day"),
        ("2025 Annual Report", "other"),
        ("Omnicom to Present at Goldman Sachs Communacopia Conference", None),
        ("Wells Fargo 9th Annual TMT Summit", None),
    ],
)
def test_event_type(title, kind):
    assert calendar.event_type(title) == kind


@pytest.mark.parametrize("code", sorted(FIXTURE_FILES))
def test_every_fixture_parses_to_typed_events(code):
    events = _parse(code)
    assert events
    for event in events:
        assert set(event) == EVENT_KEYS
        assert event["company"] == code
        assert event["type"] in {"results", "agm", "capital_markets_day", "other"}
        assert event["source_url"].startswith("https://")
        datetime.date.fromisoformat(event["date"])
    assert [e["date"] for e in events] == sorted((e["date"] for e in events), reverse=True)


def test_publicis_dates_are_day_first_and_conferences_dropped():
    events = _parse("PUB")
    fy = _find(events, "2026-02-03")  # 03/02/2026; month-first would give 2026-03-02
    assert (fy["title"], fy["type"]) == ("Publicis Groupe - Full Year 2025 Results", "results")
    assert fy["source"] == "calendar:publicis"
    assert _find(events, "2026-10-13")["type"] == "results"
    assert not any("BofA" in e["title"] for e in events)


def test_omnicom_dates_are_month_first_and_link_to_detail_page():
    events = _parse("OMC")
    day = _find(events, "2026-03-12")  # 03/12/2026; day-first would give 2026-12-03
    assert (day["title"], day["type"]) == ("Omnicom Investor Day", "capital_markets_day")
    assert day["source_url"].startswith("https://investor.omc.com/events-and-presentations/")
    assert not any("Communacopia" in e["title"] for e in events)


def test_wpp_takes_the_year_from_the_heading():
    agm = _find(_parse("WPP"), "2026-05-08")
    assert (agm["title"], agm["type"]) == ("WPP 2026 Annual General Meeting", "agm")


def test_havas_upcoming_date_and_past_year_inference():
    events = _parse("HAVAS")
    assert _find(events, "2026-10-14")["title"] == "Third-quarter 2026 results"
    assert _find(events, "2026-05-13")["type"] == "agm"
    assert _find(events, "2025-10-14")["title"] == "Third-quarter 2025 results"


def test_havas_past_years_follow_the_reference_date():
    events = _parse("HAVAS", today=datetime.date(2027, 1, 5))
    assert _find(events, "2026-07-23")["title"] == "Half-year 2026 results"


def test_stagwell_card_dates_and_conferences_dropped():
    events = _parse("STGW")
    q4 = _find(events, "2026-03-10")
    assert (q4["title"], q4["type"]) == ("Stagwell Q4 FY25 Earnings Call", "results")
    assert not any("Needham" in e["title"] for e in events)


@pytest.mark.parametrize("code", sorted(FIXTURE_FILES))
def test_empty_page_raises(code):
    text = '{"GetEventListResult": []}' if code == "OMC" else "<html><body></body></html>"
    with pytest.raises(ValueError):
        calendar.parse_calendar(get_company(code), text, TODAY, "2026-10-07T00:00:00Z")


def test_omnicom_missing_structure_raises():
    with pytest.raises(ValueError, match="GetEventListResult"):
        calendar.parse_calendar(get_company("OMC"), "{}", TODAY, "x")


def test_get_calendar_without_block_raises():
    with pytest.raises(ValueError, match="no calendar block"):
        calendar.get_calendar("DENTSU")
