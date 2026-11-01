"""Tests for the Industry read checks in pipeline.validate: the self-check make validate runs on
data/commentary.json, --check-reads against data/ (a fixture repo, never the real data/), and
main() with no arguments."""

import copy
import io
import json
import shutil
from pathlib import Path

import pytest
import yaml

from pipeline import validate

ROOT = Path(__file__).resolve().parent.parent
MINUS = chr(0x2212)  # the true minus; chr() keeps this file ASCII
POUND = chr(0xA3)
RID = "read-2026-11-01-1"

OMC_URL = "https://example.com/omc-q3-2026"
WPP_URL = "https://example.com/wpp-q3-2026"
STGW_URL = "https://example.com/stgw-q3-2026"
STGW_OLD_URL = "https://example.com/stgw-q2-2026"
CAL_URL = "https://example.com/calendar"

GOOD_TEXT = (
    f"Omnicom's organic growth was +7.2% in Q3 2026 at a 17.6% margin, while WPP's was "
    f"{MINUS}2.1% on {POUND}2,411m of revenue. Stagwell raised its FY 2026 Adjusted EBITDA "
    "guidance to $490 million to $540 million. Dentsu reports next on 13 Nov (est.)."
)


def _fig(company, field, period, text, value=None, ref=None, url=OMC_URL) -> dict:
    return {"company": company, "field": field, "period": period, "text": text, "value": value,
            "ref": ref, "source_url": url}


GOOD = {
    "id": RID,
    "date": "2026-11-01",
    "text": GOOD_TEXT,
    "figures": [
        _fig("OMC", "organic_growth_pct", "Q3 2026", "+7.2%", 7.2),
        _fig("OMC", "margin_pct", "Q3 2026", "17.6%", 17.6),
        _fig("WPP", "organic_growth_pct", "Q3 2026", f"{MINUS}2.1%", -2.1, url=WPP_URL),
        _fig("WPP", "revenue_local_m", "Q3 2026", f"{POUND}2,411m", 2411, url=WPP_URL),
        _fig("STGW", "guidance", "FY 2026", "$490 million to $540 million",
             ref="stgw-other-fy2026-2026-10-29", url=STGW_URL),
        _fig("DENTSU", "results_date", None, "13 Nov (est.)", url=CAL_URL),
    ],
    "drafted_by": "claude",
    "curated_at": "2026-11-01T12:00:00Z",
}


def _read(text: str | None = None, **figures: dict) -> dict:
    """A copy of GOOD with its text replaced and figures changed by index ("f2": {...})."""
    read = copy.deepcopy(GOOD)
    if text is not None:
        read["text"] = text
    for key, change in figures.items():
        read["figures"][int(key[1:])].update(change)
    return read


def _guidance(id_: str, value: str, status: str, supersedes: str | None, url: str) -> dict:
    return {
        "id": id_, "company": "STGW", "metric": "other", "metric_label": "Adjusted EBITDA",
        "period": "FY 2026", "value": value, "unit": "currency_m", "status": status,
        "set_date": id_[-10:], "quote": f"Adjusted EBITDA of {value}", "source_url": url,
        "supersedes": supersedes, "curated_at": "2026-10-29T14:48:21Z", "verified": True,
    }


def _event(company: str, date: str, confirmed: bool) -> dict:
    return {"company": company, "date": date, "type": "results", "title": "Results",
            "confirmed": confirmed, "source_url": CAL_URL}


@pytest.fixture
def repo(tmp_path, monkeypatch):
    """A fixture repo: the real watchlist, small data/ files, and data/commentary.json with
    GOOD as its only read."""
    (tmp_path / "config").mkdir()
    shutil.copy(ROOT / "config" / "watchlist.yaml", tmp_path / "config" / "watchlist.yaml")
    data = tmp_path / "data"
    data.mkdir()
    rows = [
        {"company": "OMC", "period": "Q3 2026", "organic_growth_pct": 7.2,
         "revenue_local_m": 6422.8, "currency": "USD", "margin_metric": "adjusted EBITA margin",
         "margin_pct": 17.6, "source_url": OMC_URL, "note": None},
        {"company": "WPP", "period": "Q3 2026", "organic_growth_pct": -2.1,
         "revenue_local_m": 2411, "currency": "GBP", "margin_metric": None, "margin_pct": None,
         "source_url": WPP_URL, "note": None},
    ]
    (data / "kpis.yaml").write_text(yaml.safe_dump({"definitions": {}, "rows": rows}))
    old = _guidance("stgw-other-fy2026-2026-07-30", "$475 million to $525 million", "new", None,
                    STGW_OLD_URL)
    new = _guidance("stgw-other-fy2026-2026-10-29", "$490 million to $540 million", "raised",
                    old["id"], STGW_URL)
    (data / "guidance.json").write_text(json.dumps({"records": [old, new]}))
    events = [
        _event("DENTSU", "2026-08-14", True),
        _event("DENTSU", "2026-11-13", False),
        _event("HAVAS", "2026-11-05", True),
        _event("PUB", "2027-02-02", False),
    ]
    (data / "events.yaml").write_text(yaml.safe_dump({"items": events}))
    _write_reads(tmp_path, [GOOD])
    monkeypatch.setattr(validate, "ROOT", tmp_path)
    return tmp_path


def _write_reads(repo: Path, reads: list[dict], rel: str = "data/commentary.json") -> None:
    path = repo / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"headlines": [], "records": [], "reads": reads}))


def _names() -> dict[str, str]:
    return validate.company_names(yaml.safe_load((ROOT / "config" / "watchlist.yaml").read_text()))


def test_good_read_passes_self_check():
    assert validate.read_errors(copy.deepcopy(GOOD), _names()) == []


SELF_CHECK_REFUSALS = {
    "figure text missing": (_read(f0={"text": "+7.3%"}), "not in the read's text"),
    "stray digit": (_read(GOOD_TEXT.replace("Stagwell raised", "Stagwell's 5 units raised")),
                    "stray number '5'"),
    "period disagrees": (_read(GOOD_TEXT.replace("in Q3 2026", "in Q2 2026")),
                         "period 'Q2 2026' matches no figure's period"),
    "hyphen for the minus": (_read(GOOD_TEXT.replace(f"{MINUS}2.1%", "-2.1%"),
                                   f2={"text": "-2.1%"}), "a hyphen"),
    "signed margin": (_read(GOOD_TEXT.replace("17.6%", "+17.6%"), f1={"text": "+17.6%"}),
                      "a sign on margin_pct"),
    "bn on a KPI figure": (_read(GOOD_TEXT.replace(f"{POUND}2,411m", f"{POUND}2.411bn"),
                                 f3={"text": f"{POUND}2.411bn"}), '"bn" or "billion"'),
    "company mismatch": (_read(f2={"company": "OMC"}),
                         "the nearest company named before it is not OMC"),
    "one sentence": (_read(GOOD_TEXT.replace(". Stagwell", "; Stagwell").replace(". Dentsu",
                                                                                 "; Dentsu")),
                     "1 sentence; a read has 2 or 3"),
    "four sentences": (_read(GOOD_TEXT + " Havas is next."), "4 sentences; a read has 2 or 3"),
    "2% inside 22%": (_read(f1={"text": "7.6%", "value": 7.6}),
                      "figure 2 (OMC margin_pct Q3 2026 '7.6%'): not in the read's text"),
    "2% after a sign": (_read(f3={"field": "margin_pct", "text": "2.1%", "value": 2.1}),
                        "figure 4 (WPP margin_pct Q3 2026 '2.1%'): not in the read's text"),
}


@pytest.mark.parametrize("case", SELF_CHECK_REFUSALS)
def test_self_check_refuses(case):
    read, expected = SELF_CHECK_REFUSALS[case]
    errors = validate.read_errors(read, _names())
    assert errors, case
    assert all(e.startswith(f"{RID}: ") for e in errors)
    assert any(expected in e for e in errors), errors


def test_missing_source_url_fails_naming_read_id(repo, capsys):
    read = _read()
    del read["figures"][4]["source_url"]
    _write_reads(repo, [read])
    assert validate.validate_file("data/commentary.json", "commentary") is False
    out = capsys.readouterr().out
    assert f"({RID})" in out and "'source_url' is a required property" in out


def test_self_check_applies_to_data_commentary_only(repo, capsys):
    one_sentence = SELF_CHECK_REFUSALS["one sentence"][0]
    _write_reads(repo, [one_sentence])
    _write_reads(repo, [one_sentence], rel="docs/data/commentary.json")
    assert validate.validate_file("data/commentary.json", "commentary") is False
    assert f"FAIL data/commentary.json: {RID}: 1 sentence" in capsys.readouterr().out
    assert validate.validate_file("docs/data/commentary.json", "commentary") is True


def test_check_reads_passes_newest_and_stdin_draft(repo, monkeypatch, capsys):
    older = _read(f0={"text": "+7.3%", "value": 7.3})  # differs from data/, but not the newest
    older["id"], older["date"] = "read-2026-10-30-1", "2026-10-30"
    older["text"] = older["text"].replace("+7.2%", "+7.3%")
    _write_reads(repo, [older, GOOD])
    assert validate.main(["--check-reads"]) == 0
    assert capsys.readouterr().out.strip() == f"ok {RID}"
    pub = _read(GOOD_TEXT.replace("Dentsu reports next on 13 Nov (est.)",
                                  "Publicis reports next on 2 Feb 2027 (est.)"),
                f5={"company": "PUB", "text": "2 Feb 2027 (est.)"})
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(pub)))
    assert validate.main(["--check-reads", "-"]) == 0
    assert capsys.readouterr().out.strip() == f"ok {RID}"


DENTSU_SENTENCE = "Dentsu reports next on 13 Nov (est.)"
DATA_REFUSALS = {
    "KPI value differs": (_read(GOOD_TEXT.replace("+7.2%", "+7.3%"),
                                f0={"text": "+7.3%", "value": 7.3}), "differs from 7.2 on file"),
    "superseded guidance": (
        _read(GOOD_TEXT.replace("$490 million to $540 million", "$475 million to $525 million"),
              f4={"text": "$475 million to $525 million", "ref": "stgw-other-fy2026-2026-07-30",
                  "source_url": STGW_OLD_URL}),
        "is not a current guidance record"),
    "part of a guidance value": (
        _read(GOOD_TEXT.replace("to $490 million to $540 million", "to as much as $540 million"),
              f4={"text": "$540 million"}),
        "text is not the record's whole value"),
    "estimate without (est.)": (_read(GOOD_TEXT.replace(DENTSU_SENTENCE, "Dentsu reports next "
                                                        "on 13 Nov"), f5={"text": "13 Nov"}),
                                "the next results event reads '13 Nov (est.)'"),
    "(est.) on a confirmed date": (
        _read(GOOD_TEXT.replace(DENTSU_SENTENCE, "Havas reports next on 5 Nov (est.)"),
              f5={"company": "HAVAS", "text": "5 Nov (est.)"}),
        "the next results event reads '5 Nov'"),
    "past date": (_read(GOOD_TEXT.replace(DENTSU_SENTENCE, "Dentsu last reported on 14 Aug"),
                        f5={"text": "14 Aug"}), "the next results event reads '13 Nov (est.)'"),
    "next-year date without its year": (
        _read(GOOD_TEXT.replace(DENTSU_SENTENCE, "Publicis reports next on 2 Feb (est.)"),
              f5={"company": "PUB", "text": "2 Feb (est.)"}),
        "the next results event reads '2 Feb 2027 (est.)'"),
    "revenue without its currency sign": (
        _read(GOOD_TEXT.replace(f"{POUND}2,411m", "2,411m"), f3={"text": "2,411m"}),
        "revenue carries its row's GBP sign"),
    "revenue with the wrong currency sign": (
        _read(GOOD_TEXT.replace(f"{POUND}2,411m", "$2,411m"), f3={"text": "$2,411m"}),
        "revenue carries its row's GBP sign"),
}


@pytest.mark.parametrize("case", DATA_REFUSALS)
def test_check_reads_refuses(repo, capsys, case):
    read, expected = DATA_REFUSALS[case]
    assert validate.read_errors(copy.deepcopy(read), _names()) == [], "self-check must pass"
    _write_reads(repo, [read])
    assert validate.main(["--check-reads"]) == 1
    out = capsys.readouterr().out
    assert f"FAIL {RID}: figure " in out and expected in out, out


def test_no_arguments_behaves_as_before(repo, capsys):
    stale = DATA_REFUSALS["KPI value differs"][0]  # passes the self-check, fails --check-reads
    _write_reads(repo, [stale])
    assert validate.main([]) == 0
    assert validate.main() == 0
    out = capsys.readouterr().out
    assert "ok data/commentary.json" in out and "FAIL" not in out
    assert "skip docs/data/prices.json (missing)" in out
    assert validate.main(["--check-reads"]) == 1
    assert validate.main(["--read"]) == 2
