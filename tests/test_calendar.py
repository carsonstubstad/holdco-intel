"""Tests for the IR calendar parsers: recorded fixtures, no network."""

import datetime
import hashlib
from pathlib import Path

import pytest

from core import calendar
from core.adapters import omnicom, publicis
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


def _found(company="OMC", date="2026-10-21", kind="results", title="Q3 call", source="calendar"):
    return {"company": company, "date": date, "type": kind, "title": title,
            "source_url": "https://example.com/e", "source": source, "fetched_at": "x"}


def _yaml(company="OMC", date="2026-10-20", kind="results"):
    return {"company": company, "date": date, "type": kind, "title": "t", "confirmed": False}


def test_candidates_skip_exact_match_past_and_other_types():
    found = [
        _found(date="2026-10-20"),  # already in yaml
        _found(date="2026-10-01"),  # past
        _found(kind="other", date="2026-11-01"),
        _found(company="WPP", kind="agm", date="2027-05-07"),
    ]
    got = calendar.find_candidates(found, [], [_yaml()], "2026-10-07")
    assert [(c["company"], c["date"], c["type"]) for c in got] == [("WPP", "2027-05-07", "agm")]
    assert got[0]["replaces"] is None and got[0]["confirmed"] is True


def test_candidate_replaces_nearest_same_type_date_within_30_days():
    events = [_yaml(date="2026-10-20"), _yaml(date="2026-10-27"), _yaml(date="2026-12-01", kind="agm")]
    (got,) = calendar.find_candidates([_found(date="2026-10-28")], [], events, "2026-10-07")
    assert got["replaces"] == "2026-10-27"
    (far,) = calendar.find_candidates([_found(date="2026-12-15")], [], events, "2026-10-07")
    assert far["replaces"] is None  # 49 days from 2026-10-27; the agm is another type


def test_candidate_id_is_stable_and_calendar_wins_over_press_release():
    press = _found(title="Omnicom Schedules Q3", source="press_release")
    cal = _found(title="Third Quarter 2026 Earnings Call")
    (got,) = calendar.find_candidates([cal], [press], [], "2026-10-07")
    assert got["id"] == calendar.candidate_id("OMC", "2026-10-21", "results")
    assert got["id"] == hashlib.sha1(b"OMC|2026-10-21|results").hexdigest()[:12]
    assert (got["source"], got["title"]) == ("calendar", "Third Quarter 2026 Earnings Call")


def _release(title, summary=None, company="OMC"):
    return {"company": company, "title": title, "summary": summary, "url": "https://x.com/r",
            "fetched_at": "2026-10-07T00:00:00Z"}


def test_scan_press_releases_reads_a_stated_date():
    items = [
        _release(
            "Omnicom Schedules Third Quarter 2026 Earnings Release and Conference Call",
            "NEW YORK, October 7, 2026 - Omnicom will report results on Tuesday, October 20, 2026.",
        ),
        _release("Publicis Groupe - Invitation - 9 February 2027 Full Year 2026 Results", company="PUB"),
        _release("Omnicom Declares Quarterly Dividend", "Payable on November 5, 2026"),
    ]
    got = calendar.scan_press_releases(items)
    assert [(e["company"], e["date"], e["type"]) for e in got] == [
        ("OMC", "2026-10-20", "results"),  # latest stated date, not the dateline
        ("PUB", "2027-02-09", "results"),
    ]
    assert got[0]["source"] == "press_release" and got[0]["source_url"] == "https://x.com/r"


def test_scan_press_releases_finds_nothing_in_current_fixtures():
    items = []
    for code, adapter, name in [("OMC", omnicom, "pr_omnicom.json"),
                                ("PUB", publicis, "pr_publicis.html")]:
        text = (FIXTURES / name).read_text(encoding="utf-8")
        for raw in adapter.parse_fixture(text, get_company(code)):
            items.append({**raw, "company": code, "fetched_at": "x"})
    assert any("chedules" in i["title"] or "Invitation" in i["title"] for i in items)
    assert calendar.scan_press_releases(items) == []
