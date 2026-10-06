"""Tests for core.guidance: empty files, company filter and superseded records."""

import json

from core.guidance import get_guidance


def _record(id_: str, company: str, supersedes: str | None = None) -> dict:
    return {"id": id_, "company": company, "supersedes": supersedes}


def test_missing_and_empty_file_return_empty(tmp_path):
    assert get_guidance(path=tmp_path / "nope.json") == []
    (tmp_path / "guidance.json").write_text("")
    assert get_guidance(path=tmp_path / "guidance.json") == []
    (tmp_path / "guidance.json").write_text('{"records": []}')
    assert get_guidance(path=tmp_path / "guidance.json") == []


def test_current_only_drops_superseded_and_filters_company(tmp_path):
    path = tmp_path / "guidance.json"
    records = [_record("a", "PUB"), _record("b", "PUB", supersedes="a"), _record("c", "WPP")]
    path.write_text(json.dumps({"records": records}))
    assert [r["id"] for r in get_guidance(path=path)] == ["b", "c"]
    assert [r["id"] for r in get_guidance(current_only=False, path=path)] == ["a", "b", "c"]
    assert [r["id"] for r in get_guidance("pub", path=path)] == ["b"]
