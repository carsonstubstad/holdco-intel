"""Tests for core.commentary: schema fit, latest_only, filters, order and missing files."""

import json
from pathlib import Path

from jsonschema import Draft202012Validator

from core.commentary import THEMES, get_commentary
from pipeline.validate import FORMAT_CHECKER

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "tests" / "fixtures" / "commentary_small.json"
SCHEMA = json.loads((ROOT / "schemas" / "commentary.schema.json").read_text())


def _ids(result: dict) -> list[str]:
    return [r["id"] for r in result["records"]]


def test_fixture_validates_and_themes_match_schema():
    validator = Draft202012Validator(SCHEMA, format_checker=FORMAT_CHECKER)
    errors = list(validator.iter_errors(json.loads(FIXTURE.read_text())))
    assert not errors, errors[0].message
    enum = SCHEMA["properties"]["records"]["items"]["properties"]["theme"]["enum"]
    assert list(THEMES) == enum


def test_latest_only_keeps_newest_release_per_company():
    result = get_commentary(path=FIXTURE)
    assert _ids(result) == [
        "pub-ai_and_data-2026-07-17-1",
        "pub-strategy-2026-07-17-1",
        "wpp-outlook-2026-08-07-1",
        "wpp-strategy-2026-08-07-1",
    ]
    assert [(h["company"], h["release_date"]) for h in result["headlines"]] == [
        ("PUB", "2026-07-17"),
        ("WPP", "2026-08-07"),
    ]
    everything = get_commentary(latest_only=False, path=FIXTURE)
    assert len(everything["records"]) == 5
    assert "wpp-strategy-2026-02-27-1" in _ids(everything)
    assert len(everything["headlines"]) == 2


def test_theme_and_code_filters():
    assert _ids(get_commentary(theme="strategy", path=FIXTURE)) == [
        "pub-strategy-2026-07-17-1",
        "wpp-strategy-2026-08-07-1",
    ]
    wpp = get_commentary("wpp", latest_only=False, path=FIXTURE)
    assert {r["company"] for r in wpp["records"]} == {"WPP"}
    assert [h["company"] for h in wpp["headlines"]] == ["WPP"]
    assert _ids(get_commentary("wpp", theme="strategy", latest_only=False, path=FIXTURE)) == [
        "wpp-strategy-2026-02-27-1",
        "wpp-strategy-2026-08-07-1",
    ]


def test_missing_and_empty_file_return_empty(tmp_path):
    empty = {"headlines": [], "records": []}
    assert get_commentary(path=tmp_path / "nope.json") == empty
    (tmp_path / "commentary.json").write_text("")
    assert get_commentary(path=tmp_path / "commentary.json") == empty
    (tmp_path / "commentary.json").write_text('{"headlines": [], "records": []}')
    assert get_commentary(path=tmp_path / "commentary.json") == empty
