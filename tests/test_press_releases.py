"""Tests for classify, the press release router and the WPP/Omnicom adapters: no network."""

import datetime
import json
import re
import types
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker

from core import press_releases
from core.adapters import omnicom, wpp
from core.config import get_company
from core.util import classify

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "fixtures"
ITEM_KEYS = {"title", "url", "published", "summary", "channel"}


@pytest.mark.parametrize(
    ("code", "title", "category"),
    [
        ("OMC", "Omnicom Reports Third Quarter 2026 Results", "results"),
        ("STGW", "Stagwell reiterates outlook", "guidance"),
        ("PUB", "Publicis Groupe to acquire Lotame", "m_and_a"),
        ("HAVAS", "Havas to host Capital Markets Day in Paris", "capital_markets"),
        ("DENTSU", "Dentsu appoints new CFO", "leadership"),
        ("WPP", "VML appointed by Coca-Cola as global agency of record", "client"),
        ("OMC", "Omnicom Declares Quarterly Dividend", "other"),
        ("STGW", "Board Declares Dividend", "other"),
    ],
)
def test_classify_one_title_per_category(code, title, category):
    flagged = category in {"results", "guidance", "m_and_a", "capital_markets"}
    assert classify(title, get_company(code)) == (category, flagged)


def test_classify_company_results_pattern_only_applies_to_that_company():
    title = "Publicis Groupe organic growth at 5.2%"
    assert classify(title, get_company("PUB")) == ("results", True)
    assert classify(title, get_company("WPP")) == ("other", False)


# Every title in both fixtures with the category a human would give it.
FIXTURE_TITLES = [
    ("WPP", "Jon Cook to leave WPP and transition VML CEO role to long-time partner Eric Campbell", "leadership"),
    ("WPP", "Directorate Change – Chief Financial Officer Succession", "leadership"),
    ("WPP", "WPP launches flagship production hub in East London", "other"),
    ("WPP", "WPP appointed by Nestlé to lead end-to-end content operating model across Greater China", "client"),
    ("WPP", "2026 Interim Results", "results"),
    ("WPP", "WPP announces expansion plans for WPP Enterprise Solutions, its global business unit for AI-driven transformation", "other"),
    ("WPP", "WPP agencies triumph at Cannes Lions 2026, with Ogilvy and VML claiming the top two creative network honours", "other"),
    ("WPP", "Empowering the next creative frontier with AI research", "other"),
    ("WPP", "WPP named first launch partner to pilot Meta’s newest creative solution, integrated within WPP Open", "other"),
    ("WPP", "WPP Enterprise Solutions signs strategic collaboration agreement with AWS to operationalise agentic AI for leading brands", "other"),
    ("WPP", "WPP appoints Baiju Shah as group Chief Strategy Officer", "leadership"),
    ("WPP", "WPP launches HEX, creating a new kind of talent pipeline designed for the AI era", "other"),
    ("OMC", "Omnicom Recognized As a Leader in Two 2026 Gartner Reports for Global Digital Marketing Agencies", "other"),
    ("OMC", "Omnicom Advertising Announces Leadership Transition", "leadership"),
    ("OMC", "OMNICOM TO PRESENT AT THE GOLDMAN SACHS COMMUNACOPIA + TECHNOLOGY CONFERENCE", "other"),
    ("OMC", "Omnicom Reports Second Quarter 2026 Results", "results"),
    ("OMC", "Omnicom Declares Dividend", "other"),
    ("OMC", "Omnicom Schedules Second Quarter 2026 Earnings Release and Conference Call", "results"),
    ("OMC", "Omnicom Launches Acxiom Fan Graph to Give Brands a More Complete View of Sports Fandom", "other"),
    ("OMC", "Omnicom Named World's Most Effective Holding Group in 2025 Effie Index", "other"),
    ("OMC", "OMNICOM TO PRESENT AT THE J.P. MORGAN GLOBAL TECHNOLOGY, MEDIA AND COMMUNICATIONS CONFERENCE", "other"),
]


@pytest.mark.parametrize(("code", "title", "category"), FIXTURE_TITLES)
def test_classify_fixture_titles(code, title, category):
    assert classify(title, get_company(code))[0] == category


def test_fixture_title_table_covers_every_fixture_item():
    parsed = {("WPP", i["title"]) for i in _parse(wpp, "WPP", "pr_wpp.html")}
    parsed |= {("OMC", i["title"]) for i in _parse(omnicom, "OMC", "pr_omnicom.xml")}
    assert parsed == {(code, title) for code, title, _ in FIXTURE_TITLES}


def _parse(adapter, code: str, fixture: str) -> list[dict]:
    text = (FIXTURES / fixture).read_text(encoding="utf-8")
    return adapter.parse_fixture(text, get_company(code))


@pytest.mark.parametrize(
    ("adapter", "code", "fixture", "channel"),
    [(wpp, "WPP", "pr_wpp.html", "html"), (omnicom, "OMC", "pr_omnicom.xml", "rss")],
)
def test_parse_fixture_shape(adapter, code, fixture, channel):
    items = _parse(adapter, code, fixture)
    assert len(items) >= 10
    for item in items:
        assert set(item) == ITEM_KEYS
        assert item["title"]
        assert item["url"].startswith("https://")
        datetime.date.fromisoformat(item["published"])
        assert item["summary"] is None or isinstance(item["summary"], str)
        assert item["channel"] == channel


def test_omnicom_summary_is_plain_text():
    feed = (
        '<?xml version="1.0"?><rss version="2.0"><channel><item><title>T</title>'
        "<link>https://investor.omc.com/x</link><pubDate>Tue, 28 Jul 2026 16:03:00 -0400</pubDate>"
        "<description>&lt;p&gt;Net revenue &lt;b&gt;up&lt;/b&gt;&lt;/p&gt;</description>"
        "</item></channel></rss>"
    )
    [item] = omnicom.parse_fixture(feed, get_company("OMC"))
    assert item["summary"] == "Net revenue up"
    [item] = _parse(omnicom, "OMC", "pr_omnicom.xml")[:1]
    assert item["summary"] is None


def test_wpp_anchors_without_dates_raise():
    page = '<html><body><a href="/en/news/2026-interim-results">2026 Interim Results</a></body></html>'
    with pytest.raises(ValueError, match="no publish dates"):
        wpp.parse_fixture(page, get_company("WPP"))


@pytest.mark.parametrize(
    ("adapter", "body"),
    [(wpp, "<html><body></body></html>"), (omnicom, '<rss version="2.0"><channel /></rss>')],
)
def test_fetch_items_with_zero_items_raises(adapter, body, monkeypatch):
    monkeypatch.setattr(adapter, "fetch", lambda url: types.SimpleNamespace(text=body))
    code = "WPP" if adapter is wpp else "OMC"
    with pytest.raises(ValueError, match="no items"):
        adapter.fetch_items(get_company(code))


def _item_validator() -> Draft202012Validator:
    schema = json.loads((ROOT / "schemas" / "press_releases.schema.json").read_text())
    return Draft202012Validator(
        schema["properties"]["items"]["items"], format_checker=FormatChecker()
    )


def test_get_press_releases_normalizes_and_validates(monkeypatch):
    raw = [
        {"title": "2026 Interim Results", "url": "https://www.wpp.com/en/news/a",
         "published": "2026-08-06", "summary": None, "channel": "html"},
        {"title": "WPP appoints a CFO", "url": "https://www.wpp.com/en/news/b",
         "published": "2026-09-23T00:00:00Z", "summary": "", "channel": "html"},
        {"title": "Old news", "url": "https://www.wpp.com/en/news/c",
         "published": "2025-01-01", "summary": "x", "channel": "html"},
        {"title": "Bad link", "url": "javascript:alert(1)",
         "published": "2026-09-30", "summary": None, "channel": "html"},
    ]  # fmt: skip
    fake = types.SimpleNamespace(fetch_items=lambda company: raw)
    monkeypatch.setattr(press_releases, "_load_adapter", lambda name: fake)

    items = press_releases.get_press_releases("WPP", since="2026-01-01")

    assert [i["title"] for i in items] == ["WPP appoints a CFO", "2026 Interim Results"]
    validator = _item_validator()
    for item in items:
        assert re.fullmatch(r"[0-9a-f]{12}", item["id"])
        assert item["source"] == "wpp:html"
        assert item["company"] == "WPP"
        assert item["summary"] is None
        assert not list(validator.iter_errors(item))
    assert items[0]["published"] == "2026-09-23"
    assert (items[0]["category"], items[0]["flagged"]) == ("leadership", False)
    assert (items[1]["category"], items[1]["flagged"]) == ("results", True)


@pytest.mark.parametrize("name", ["no_such_adapter", "../wpp", "wpp; rm", "_private", ""])
def test_bad_adapter_name_raises(name, monkeypatch):
    company = {**get_company("WPP"), "press_releases": {"adapter": name, "url": "https://x"}}
    monkeypatch.setattr(press_releases, "get_company", lambda code: company)
    with pytest.raises(ValueError):
        press_releases.get_press_releases("WPP")
