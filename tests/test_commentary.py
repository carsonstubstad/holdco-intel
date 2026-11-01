"""Tests for core.commentary: schema fit, latest_only per source_type, filters, order, missing
files and reads (also through MCP get_commentary)."""

import json
from pathlib import Path

from jsonschema import Draft202012Validator

from core.commentary import SOURCE_TYPES, THEMES, get_commentary
from mcp_server import server
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
    props = SCHEMA["properties"]["records"]["items"]["properties"]
    assert list(THEMES) == props["theme"]["enum"]
    assert list(SOURCE_TYPES) == props["source_type"]["enum"]


def test_latest_only_keeps_newest_document_per_company_and_source_type():
    result = get_commentary(path=FIXTURE)
    # WPP: the 2026-03-20 annual report stays beside the newer 2026-08-07 results release; the
    # 2025 annual report drops, and so does the 2026-02-27 record with no source_type (missing
    # means results_release, so the explicit 2026-08-07 results release supersedes it)
    assert _ids(result) == [
        "pub-ai_and_data-2026-07-17-1",
        "pub-strategy-2026-07-17-1",
        "wpp-outlook-2026-08-07-1",
        "wpp-strategy-2026-03-20-1",
        "wpp-strategy-2026-08-07-1",
    ]
    assert [(h["company"], h["release_date"]) for h in result["headlines"]] == [
        ("PUB", "2026-07-17"),
        ("WPP", "2026-08-07"),
    ]
    everything = get_commentary(latest_only=False, path=FIXTURE)
    assert len(everything["records"]) == 7
    assert {"wpp-strategy-2026-02-27-1", "wpp-strategy-2025-03-21-1"} <= set(_ids(everything))
    assert len(everything["headlines"]) == 2


def test_theme_and_code_filters():
    assert _ids(get_commentary(theme="strategy", path=FIXTURE)) == [
        "pub-strategy-2026-07-17-1",
        "wpp-strategy-2026-03-20-1",
        "wpp-strategy-2026-08-07-1",
    ]
    wpp = get_commentary("wpp", latest_only=False, path=FIXTURE)
    assert {r["company"] for r in wpp["records"]} == {"WPP"}
    assert [h["company"] for h in wpp["headlines"]] == ["WPP"]
    assert _ids(get_commentary("wpp", theme="strategy", latest_only=False, path=FIXTURE)) == [
        "wpp-strategy-2025-03-21-1",
        "wpp-strategy-2026-02-27-1",
        "wpp-strategy-2026-03-20-1",
        "wpp-strategy-2026-08-07-1",
    ]


def test_missing_and_empty_file_return_empty(tmp_path):
    empty = {"headlines": [], "records": [], "reads": []}
    assert get_commentary(path=tmp_path / "nope.json") == empty
    (tmp_path / "commentary.json").write_text("")
    assert get_commentary(path=tmp_path / "commentary.json") == empty
    (tmp_path / "commentary.json").write_text('{"headlines": [], "records": []}')
    assert get_commentary(path=tmp_path / "commentary.json") == empty


def _with_reads(tmp_path: Path) -> Path:
    """The fixture plus three reads, stored out of order; the newest is read-2026-11-01-2."""
    data = json.loads(FIXTURE.read_text())
    data["reads"] = [
        {"id": f"read-{date}-{n}", "date": date, "curated_at": stamp}
        for date, n, stamp in [
            ("2026-11-01", 1, "2026-11-01T09:00:00Z"),
            ("2026-10-01", 1, "2026-10-01T09:00:00Z"),
            ("2026-11-01", 2, "2026-11-01T10:00:00Z"),
        ]
    ]
    path = tmp_path / "commentary.json"
    path.write_text(json.dumps(data))
    return path


def test_reads_newest_first_and_latest_only(tmp_path):
    path = _with_reads(tmp_path)
    newest_first = ["read-2026-11-01-2", "read-2026-11-01-1", "read-2026-10-01-1"]
    everything = get_commentary(latest_only=False, path=path)
    assert [r["id"] for r in everything["reads"]] == newest_first
    assert [r["id"] for r in get_commentary(path=path)["reads"]] == ["read-2026-11-01-2"]
    # code and theme filter quotes and headlines, never reads
    filtered = get_commentary("PUB", theme="strategy", latest_only=False, path=path)
    assert [r["id"] for r in filtered["reads"]] == newest_first
    assert {r["company"] for r in filtered["records"]} == {"PUB"}


def test_mcp_get_commentary_returns_reads_and_as_of_counts_them(tmp_path, monkeypatch):
    state = tmp_path / "curate_state.json"
    state.write_text('{"last_curate_at": "2026-10-29T14:48:21Z", "items_reviewed": 0}')
    monkeypatch.setattr(server, "CURATE_STATE", state)
    monkeypatch.setattr(server.commentary, "COMMENTARY_PATH", _with_reads(tmp_path))
    result = server.get_commentary()
    assert [r["id"] for r in result["reads"]] == ["read-2026-11-01-2"]
    assert result["as_of"] == "2026-11-01T10:00:00Z"  # newer than curate_state and every record
    assert "Industry read drafted by Claude in /curate" in result["note"]
    assert len(server.get_commentary(latest_only=False)["reads"]) == 3
