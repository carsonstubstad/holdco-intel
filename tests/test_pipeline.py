"""End-to-end pipeline test in a tmp copy of the repo with every network collector stubbed."""

import datetime
import json
import shutil
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator

from core.calendar import candidate_id
from pipeline import run
from pipeline.validate import FORMAT_CHECKER

ROOT = Path(__file__).resolve().parent.parent
TODAY = datetime.datetime.now(datetime.UTC).date()
OUTPUTS = [
    "companies",
    "prices",
    "press_releases",
    "events",
    "guidance",
    "kpis",
    "status",
    "event_candidates",
]


def _ago(days: int) -> str:
    return (TODAY - datetime.timedelta(days=days)).isoformat()


def _ahead(days: int) -> str:
    return (TODAY + datetime.timedelta(days=days)).isoformat()


def _cal(company: str, date: str, kind: str = "results") -> dict:
    return {
        "company": company,
        "date": date,
        "type": kind,
        "title": f"{company} {kind} {date}",
        "source_url": f"https://example.com/{company}/calendar",
        "source": f"calendar:{company.lower()}",
        "fetched_at": "2026-01-01T00:00:00Z",
    }


def _fake_calendar(code: str) -> list[dict]:
    if code == "WPP":
        raise RuntimeError("calendar down")
    return {
        "PUB": [_cal("PUB", _ahead(40)), _cal("PUB", _ahead(100)), _cal("PUB", _ago(5))],
        "HAVAS": [_cal("HAVAS", _ahead(12)), _cal("HAVAS", _ahead(50), "other")],
    }.get(code, [])


def _item(id_: str, company: str, days_ago: int, flagged: bool) -> dict:
    return {
        "id": id_,
        "company": company,
        "title": f"{company} item {id_}",
        "url": f"https://example.com/{id_}",
        "published": _ago(days_ago),
        "summary": None,
        "category": "results" if flagged else "other",
        "flagged": flagged,
        "source": "test:fixture",
        "fetched_at": "2026-01-01T00:00:00Z",
    }


def _fake_press_releases(code: str, since: str | None = None) -> list[dict]:
    if code == "OMC":
        raise RuntimeError("feed down")
    return [
        _item("wpp-new", "WPP", 2, True),
        _item("wpp-old", "WPP", 40, True),
        _item("wpp-misc", "WPP", 1, False),
    ]


def _fake_closes(codes: list[str], fx_pairs: list[str]) -> dict:
    return {"OMC": [{"date": TODAY.isoformat(), "close": 80.0}]}


@pytest.fixture
def repo(tmp_path, monkeypatch):
    for name in ["config", "data", "docs/data"]:
        shutil.copytree(ROOT / name, tmp_path / name)
    watchlist = tmp_path / "config" / "watchlist.yaml"  # one company with no adapter module
    watchlist.write_text(watchlist.read_text().replace("adapter: havas", "adapter: not_built"))
    out = tmp_path / "docs" / "data"
    previous = {
        "as_of": "2026-01-01T00:00:00Z",
        "last_curate_at": None,
        "new_since_last_curate": [],
        "items": [_item("omc-kept", "OMC", 20, True), _item("omc-expired", "OMC", 200, True)],
    }
    (out / "press_releases.json").write_text(json.dumps(previous))
    prev_status = {"sources": {"press_releases:OMC": {"ok": True, "items": 10, "ms": 5,
                                                      "last_ok": "2026-01-02T00:00:00Z"}}}
    (out / "status.json").write_text(json.dumps(prev_status))
    (out / "runs.jsonl").write_text('{"run_at": "2026-01-02T00:00:00Z"}\n')
    events = {"items": [
        {"company": "PUB", "date": _ahead(40), "type": "results", "title": "Q", "confirmed": True},
        {"company": "HAVAS", "date": _ahead(10), "type": "results", "title": "Q",
         "confirmed": False},
    ]}
    (tmp_path / "data" / "events.yaml").write_text(yaml.safe_dump(events))
    carried = {**_cal("WPP", _ahead(30)), "id": candidate_id("WPP", _ahead(30), "results"),
               "confirmed": True, "replaces": None}
    seen = {**_cal("PUB", _ahead(100)), "id": candidate_id("PUB", _ahead(100), "results"),
            "confirmed": True, "replaces": None}
    (out / "event_candidates.json").write_text(json.dumps(
        {"as_of": "2026-01-01T00:00:00Z", "items": [carried, seen], "new_ids": [seen["id"]]}
    ))
    monkeypatch.setattr(run, "get_press_releases", _fake_press_releases)
    monkeypatch.setattr(run, "get_calendar", _fake_calendar)
    monkeypatch.setattr(run, "fetch_latest_closes", _fake_closes)
    return tmp_path


def _load(repo: Path, name: str) -> dict:
    return json.loads((repo / "docs" / "data" / f"{name}.json").read_text())


def _set_last_curate(repo: Path, value: str | None) -> None:
    (repo / "data" / "curate_state.json").write_text(
        json.dumps({"last_curate_at": value, "items_reviewed": 0})
    )


def test_pipeline_tolerates_failure_and_writes_everything(repo, capsys):
    _set_last_curate(repo, f"{_ago(10)}T12:00:00Z")
    assert run.main(repo) == 0

    for name in OUTPUTS:
        schema = json.loads((ROOT / "schemas" / f"{name}.schema.json").read_text())
        validator = Draft202012Validator(schema, format_checker=FORMAT_CHECKER)
        errors = list(validator.iter_errors(_load(repo, name)))
        assert not errors, f"{name}: {errors[0].message}"
    assert not (repo / "docs" / "data" / "news.json").exists()

    companies = _load(repo, "companies")
    assert [c["code"] for c in companies["companies"]] == [
        "PUB", "OMC", "WPP", "HAVAS", "DENTSU", "STGW"
    ]
    assert companies["benchmark"] == {"symbol": "^GSPC", "name": "S&P 500"}

    status = _load(repo, "status")
    omc = status["sources"]["press_releases:OMC"]
    assert omc["ok"] is False and "feed down" in omc["error"]
    assert omc["last_ok"] == "2026-01-02T00:00:00Z"
    assert status["sources"]["press_releases:WPP"]["ok"] is True
    assert status["sources"]["prices"]["ok"] is True
    assert "press_releases:HAVAS" not in status["sources"]
    assert status["counts"]["news"] == 0
    assert status["counts"]["sources_total"] == 15  # 5 calendars: DENTSU has none
    assert status["counts"]["sources_ok"] == 13
    wpp_cal = status["sources"]["calendar:WPP"]
    assert wpp_cal["ok"] is False and "calendar down" in wpp_cal["error"]
    assert "calendar:DENTSU" not in status["sources"]

    press = _load(repo, "press_releases")
    ids = {i["id"] for i in press["items"]}
    assert "omc-kept" in ids  # missing from today's fetch, still within 180 days
    assert "omc-expired" not in ids
    assert press["new_since_last_curate"] == ["wpp-new"]
    assert press["last_curate_at"] == f"{_ago(10)}T12:00:00Z"

    lines = (repo / "docs" / "data" / "runs.jsonl").read_text().splitlines()
    assert len(lines) == 2
    assert json.loads(lines[1])["flagged_new"] == 1

    printed = capsys.readouterr().out
    assert "[pipeline] press_releases:OMC FAIL 0 items" in printed
    assert "[pipeline] press_releases:HAVAS skip (no adapter)" in printed


def test_never_curated_uses_30_day_window(repo):
    _set_last_curate(repo, None)
    run.main(repo)
    press = _load(repo, "press_releases")
    assert sorted(press["new_since_last_curate"]) == ["omc-kept", "wpp-new"]
    assert press["last_curate_at"] is None


def test_calendar_candidates(repo):
    run.main(repo)
    doc = _load(repo, "event_candidates")
    got = {(c["company"], c["date"]): c for c in doc["items"]}
    # PUB +40 is in events.yaml; PUB -5 is past; HAVAS "other" is not a candidate type
    assert sorted(got) == [("HAVAS", _ahead(12)), ("PUB", _ahead(100)), ("WPP", _ahead(30))]
    havas = got[("HAVAS", _ahead(12))]
    assert havas["replaces"] == _ahead(10)
    assert havas["id"] == candidate_id("HAVAS", _ahead(12), "results")
    assert got[("PUB", _ahead(100))]["replaces"] is None
    assert got[("WPP", _ahead(30))]["source"] == "calendar:wpp"  # kept: its calendar failed
    assert doc["new_ids"] == [havas["id"]]
    assert [c["date"] for c in doc["items"]] == sorted(c["date"] for c in doc["items"])


def test_calendar_candidate_drops_once_in_events_yaml(repo):
    path = repo / "data" / "events.yaml"
    events = yaml.safe_load(path.read_text())
    events["items"].append(
        {"company": "HAVAS", "date": _ahead(12), "type": "results", "title": "Q", "confirmed": True}
    )
    path.write_text(yaml.safe_dump(events))
    run.main(repo)
    dates = {(c["company"], c["date"]) for c in _load(repo, "event_candidates")["items"]}
    assert ("HAVAS", _ahead(12)) not in dates
