"""Tests for classify, the press release router and the IR adapters: no network."""

import datetime
import json
import re
import types
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker

from core import press_releases
from core.adapters import _rss, dentsu, havas, omnicom, publicis, stagwell, wpp
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


# Every title in every fixture with the category a human would give it.
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
    ("OMC", "Omnicom Elevates Christine Gambino to CEO of Omni Platform", "leadership"),
    ("OMC", "Omnicom Reports First Quarter 2026 Results", "results"),
    ("STGW", "September Harvard Caps / Harris Poll: Democrats Hold A 2-Point Lead Among Likely Voters in Midterms Horserace, With Trump Approval Hitting a Low Of 42%", "other"),
    ("STGW", "Stagwell Launches Intreego.ai to Transform the Hospitality Ecosystem into Dynamic Business and Engagement Tools", "other"),
    ("STGW", "Code and Theory Honored by Fast Company’s Innovation by Design for Four Consecutive Years", "other"),
    ("STGW", "Stagwell Strengthens Assembly Leadership with Two Key CEO Appointments", "leadership"),
    ("STGW", "August Harvard CAPS / Harris Poll: Trump Approval Sees Slight Improvement at 44%", "other"),
    ("STGW", "The People Platform Unveils New Identity as Numetrix", "other"),
    ("STGW", "Stagwell Expands Strategic Partnership with Adobe to Build the Future of Enterprise Marketing Together", "other"),
    ("STGW", "Stagwell (STGW) Appoints Beth J. Kaplan to Board of Directors", "leadership"),
    ("STGW", "STAGWELL INC. (NASDAQ: STGW) REPORTS RESULTS FOR THE THREE AND SIX MONTHS ENDED JUNE 30, 2026", "results"),
    ("STGW", "Stagwell to Acquire QStrauss Consulting to Expand Code and Theory’s Implementation of Adobe’s Suite of Solutions", "m_and_a"),
    ("PUB", "Publicis Groupe - Invitation - Third Quarter 2026 Revenue", "results"),
    ("PUB", "Publicis Groupe successfully prices EUR 500 million of bond issue", "other"),
    ("PUB", "Publicis Sports and Travis Kelce's TEKTA Join Forces to Reimagine the Future of NIL Marketing", "other"),
    ("PUB", "Half-Year 2026 Financial Report available", "results"),
    ("PUB", "Publicis Groupe: First Half 2026 Results", "results"),
    ("PUB", "Publicis Groupe - Invitation - First Half 2026 Results", "results"),
    ("PUB", "Publicis takes to the Croisette to make the case for real business value in the age of artificial intelligence", "other"),
    ("PUB", "Javier Campopiano Joins Leo Constellation as Chief Creative Officer for the Americas & Iberia", "leadership"),
    ("PUB", "Publicis Groupe S.A. General Shareholders’ Meeting of may 27, 2026", "other"),
    ("PUB", "Publicis Groupe Proposes Appointment of Jaime Teevan to its Board of Directors", "leadership"),
    ("PUB", "Publicis to acquire LiveRamp to accelerate data co-creation for smarter agents", "m_and_a"),
    ("PUB", "Availability of 2025 Universal Registration Document and Procedure for Consulting Preparatory Documents for General Shareholders’ Meeting", "other"),
    ("PUB", "Publicis Groupe: First Quarter 2026 Revenue", "results"),
    ("PUB", "Microsoft and Publicis Groupe expand their strategic partnership to power the future of agentic marketing for businesses worldwide", "other"),
    ("PUB", "Publicis Groupe - Invitation - Third Quarter 2024 Revenue", "results"),
    ("HAVAS", "Havas’ near-term science-based emissions reduction targets validated by the Science Based Targets initiative", "other"),
    ("HAVAS", "Havas liquidity program documents", "other"),
    ("HAVAS", "Havas share buyback documents", "other"),
    ("HAVAS", "Havas enters into liquidity agreement to support stock liquidity", "other"),
    ("HAVAS", "Half-year results 2026", "results"),
    ("HAVAS", "Havas reports solid H1 2026 results with organic growth of +2.5% and further improvement in adjusted EBIT margin", "results"),
    ("HAVAS", "Havas strengthens experiential marketing arm, Havas Play, across Benelux with acquisition of Dutch agency SportVibes", "m_and_a"),
    ("HAVAS", "Havas strengthens its experiential marketing offering with acquisition of Spanish agency MUT", "m_and_a"),
    ("HAVAS", "Havas creates Chief Strategy Officer role and appoints Raphaël de Andréis", "leadership"),
    ("HAVAS", "Havas unveils new proprietary research ‘The Science of Desire’, redefining growth in the age of AI", "other"),
    ("DENTSU", "Dentsu Wins 12 Awards at the D&AD Awards 2026 Including “Design Agency of the Year” for Dentsu Inc.", "other"),
    ("DENTSU", "Dentsu Signs First Virtual PPAs in Japan for Japan’s Advertising Industry", "other"),
    ("DENTSU", "TBS and dentsu Jointly Establish Pro Pickleball Team “THE DOTS TOKYO” to Compete in Asia’s Premier League MLP Asia 2026", "other"),
    ("DENTSU", "Dentsu Publishes Integrated Report 2026", "other"),
    ("DENTSU", "Dentsu Group to Make Dentsu Soken a Joint Venture with ITOCHU Group", "m_and_a"),
    ("DENTSU", "Regarding Certain Media Reports", "other"),
    ("DENTSU", "Notice of Announcement of Second Quarter FY2026 Consolidated Financial Results and Mid-Term Management Plan Update", "results"),
    ("DENTSU", "Dentsu Conducts Pilot Study of Interactive AI Plush Toy “Nande-chan”", "other"),
    ("DENTSU", "Dentsu Produces Egg Hunt 2026: The Grand Eggspress, a Major Roblox Adventure RPG", "other"),
    ("DENTSU", "Dentsu Publishes Climate-related Disclosures 2026 and Non-financial Databook 2026", "other"),
    ("DENTSU", "Dentsu to Pilot AI Avatar Platform Enabling Students at Yoichi Ochiai Summer School 2026 to Co-Create with AI Models", "other"),
    ("DENTSU", "Dentsu Wins “In-house: Innovation in People & Skills” Award at the FT Innovative Lawyers Asia-Pacific 2026 Awards", "other"),
    ("DENTSU", "Dentsu Supports NIKKA WHISKY’s Pop-up Bar at Cannes Lions", "other"),
    ("DENTSU", "Dentsu Selected for the FTSE JPX Blossom Japan Index and the FTSE JPX Blossom Japan Sector Relative Index", "other"),
    ("DENTSU", "Dentsu Hosted Session with Heineken and Netflix at Cannes Lions Titled “Why Entertainment Goes Beyond Brand Marketing”", "other"),
]

# (adapter, code, fixture, channel) for every adapter fixture.
FIXTURES_BY_ADAPTER = [
    (wpp, "WPP", "pr_wpp.html", "html"),
    (omnicom, "OMC", "pr_omnicom.json", "json"),
    (stagwell, "STGW", "pr_stagwell.xml", "rss"),
    (publicis, "PUB", "pr_publicis.html", "html"),
    (havas, "HAVAS", "pr_havas.xml", "rss"),
    (dentsu, "DENTSU", "pr_dentsu.xml", "rss"),
]

# Latest results release per fixture: it must parse and classify as results (for /curate).
LATEST_RESULTS = [
    (stagwell, "STGW", "pr_stagwell.xml", "2026-07-30", "REPORTS RESULTS FOR THE THREE AND SIX MONTHS"),
    (publicis, "PUB", "pr_publicis.html", "2026-07-16", "Publicis Groupe: First Half 2026 Results"),
    (havas, "HAVAS", "pr_havas.xml", "2026-07-23", "Havas reports solid H1 2026 results"),
    (dentsu, "DENTSU", "pr_dentsu.xml", "2026-08-14", "Second Quarter FY2026 Consolidated Financial"),
    (omnicom, "OMC", "pr_omnicom.json", "2026-07-28", "Omnicom Reports Second Quarter 2026 Results"),
]


@pytest.mark.parametrize(("code", "title", "category"), FIXTURE_TITLES)
def test_classify_fixture_titles(code, title, category):
    assert classify(title, get_company(code))[0] == category


def test_fixture_title_table_covers_every_fixture_item():
    parsed = {
        (code, i["title"])
        for adapter, code, fixture, _ in FIXTURES_BY_ADAPTER
        for i in _parse(adapter, code, fixture)
    }
    assert parsed == {(code, title) for code, title, _ in FIXTURE_TITLES}


@pytest.mark.parametrize(("adapter", "code", "fixture", "published", "title"), LATEST_RESULTS)
def test_latest_results_release_is_in_fixture(adapter, code, fixture, published, title):
    matches = [i for i in _parse(adapter, code, fixture) if title in i["title"]]
    assert [i["published"] for i in matches] == [published]
    assert classify(matches[0]["title"], get_company(code)) == ("results", True)


def _parse(adapter, code: str, fixture: str) -> list[dict]:
    text = (FIXTURES / fixture).read_text(encoding="utf-8")
    return adapter.parse_fixture(text, get_company(code))


@pytest.mark.parametrize(("adapter", "code", "fixture", "channel"), FIXTURES_BY_ADAPTER)
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


def test_rss_summary_is_plain_text():
    feed = (
        '<?xml version="1.0"?><rss version="2.0"><channel><item><title>T</title>'
        "<link>https://www.havas.com/x</link><pubDate>Tue, 28 Jul 2026 16:03:00 -0400</pubDate>"
        "<description>&lt;p&gt;Net revenue &lt;b&gt;up&lt;/b&gt;&lt;/p&gt;</description>"
        "</item></channel></rss>"
    )
    [item] = _rss.parse_rss(feed, "https://www.havas.com/feed/")
    assert item["summary"] == "Net revenue up"
    [item] = _parse(havas, "HAVAS", "pr_havas.xml")[:1]
    assert item["summary"] is None  # empty CDATA description
    assert all(i["summary"] and "<" not in i["summary"] for i in _parse(dentsu, "DENTSU", "pr_dentsu.xml"))


def test_omnicom_dates_are_month_first_and_links_absolute():
    items = {i["title"]: i for i in _parse(omnicom, "OMC", "pr_omnicom.json")}
    item = items["Omnicom Elevates Christine Gambino to CEO of Omni Platform"]
    assert item["published"] == "2026-05-04"
    assert item["url"].startswith("https://investor.omc.com/news/news-details/2026/")


def test_publicis_dates_are_month_first():
    items = {i["title"]: i for i in _parse(publicis, "PUB", "pr_publicis.html")}
    assert items["Publicis Groupe - Invitation - First Half 2026 Results"]["published"] == "2026-07-03"
    pdf = items["Publicis Groupe - Invitation - Third Quarter 2024 Revenue"]
    assert (pdf["published"], pdf["url"].endswith(".pdf")) == ("2024-10-07", True)


def test_publicis_titles_without_dates_raise():
    page = (
        '<ul><li class="archive-element"><p class="archive-element__title">T</p>'
        '<span class="archive-element__date">2026-07-16</span>'
        '<div class="archive-element__links"><a href="/x">Read more</a></div></li></ul>'
    )
    with pytest.raises(ValueError, match="no MM/DD/YYYY dates"):
        publicis.parse_fixture(page, get_company("PUB"))


def test_rss_local_date_relative_link_and_wordpress_boilerplate():
    feed = (
        '<?xml version="1.0"?><rss version="2.0"><channel>'
        "<item><title>A</title><link>/en/news/release/a.pdf</link>"
        "<pubDate>Mon, 31 Aug 2026 08:00:00 +0900</pubDate></item>"
        "<item><title>B</title><link>https://example.com/b</link>"
        "<pubDate>Tue, 15 Sep 2026 15:41:03 +0000</pubDate>"
        "<description><![CDATA[<p>The post <a href=\"https://example.com/b\">B</a> appeared first "
        "on <a href=\"https://example.com\">Example</a>.</p>]]></description></item>"
        "</channel></rss>"
    )
    a, b = _rss.parse_rss(feed, "https://www.group.dentsu.com/en/news/release/index.xml")
    assert (a["published"], a["url"]) == (
        "2026-08-31", "https://www.group.dentsu.com/en/news/release/a.pdf"
    )
    assert (b["summary"], b["channel"]) == (None, "rss")


def test_wpp_anchors_without_dates_raise():
    page = '<html><body><a href="/en/news/2026-interim-results">2026 Interim Results</a></body></html>'
    with pytest.raises(ValueError, match="no publish dates"):
        wpp.parse_fixture(page, get_company("WPP"))


EMPTY_RSS = '<rss version="2.0"><channel /></rss>'


@pytest.mark.parametrize(
    ("adapter", "code", "body"),
    [
        (wpp, "WPP", "<html><body></body></html>"),
        (omnicom, "OMC", '{"GetPressReleaseListResult": []}'),
        (stagwell, "STGW", EMPTY_RSS),
        (publicis, "PUB", "<html><body></body></html>"),
        (havas, "HAVAS", EMPTY_RSS),
        (dentsu, "DENTSU", EMPTY_RSS),
    ],
)
def test_fetch_items_with_zero_items_raises(adapter, code, body, monkeypatch):
    monkeypatch.setattr(adapter, "fetch", lambda url: types.SimpleNamespace(text=body))
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
