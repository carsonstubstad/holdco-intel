"""Tests for core.guidance (empty files, company filter, superseded) and the metric_label rule."""

import json

import pytest

from core.guidance import get_guidance
from pipeline import validate

QUOTE = "Adjusted EBITDA of $475 million to $525 million is reiterated"
LABELS = {
    "stgw-other-fy2026-2026-07-30": "Adjusted EBITDA",
    "stgw-other-fy2026-2026-10-29": "Adjusted EBITDA",
    "wpp-other-fy2026-2026-08-06": "adjusted operating cash flow",
    "wpp-other-fy2026-2026-10-29": "adjusted operating cash flow",
}


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


@pytest.mark.parametrize(
    "record",
    [
        {"id": "no-label", "metric": "other", "quote": QUOTE},
        # Case-sensitive, so the label keeps the quote's case.
        {"id": "wrong-case", "metric": "other", "metric_label": "adjusted EBITDA", "quote": QUOTE},
        {"id": "stray", "metric": "eps", "metric_label": "EPS", "quote": "EPS of $1.07 to $1.21"},
    ],
)
def test_label_rule_refuses_missing_unquoted_and_stray_labels(record):
    errors = validate.guidance_label_errors({"records": [record]})
    assert len(errors) == 1
    assert errors[0].startswith(record["id"] + ":")


def test_real_other_records_carry_their_labels_and_pass():
    records = get_guidance(current_only=False)
    by_id = {r["id"]: r for r in records}
    assert {i: by_id[i].get("metric_label") for i in LABELS} == LABELS
    assert validate.guidance_label_errors({"records": records}) == []


def test_label_rule_applies_to_data_guidance_only(tmp_path, monkeypatch, capsys):
    record = {
        "id": "test-other-fy2026-2026-10-29", "company": "STGW", "metric": "other",
        "period": "FY 2026", "value": "$475 million to $525 million", "status": "held",
        "set_date": "2026-10-29", "quote": QUOTE, "source_url": "https://example.com/release",
        "curated_at": "2026-10-29T14:48:21Z", "verified": True,
    }
    for rel in ("data/guidance.json", "docs/data/guidance.json"):
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / rel).write_text(json.dumps({"records": [record]}))
    monkeypatch.setattr(validate, "ROOT", tmp_path)
    assert validate.validate_file("data/guidance.json", "guidance") is False
    assert "test-other-fy2026-2026-10-29" in capsys.readouterr().out
    assert validate.validate_file("docs/data/guidance.json", "guidance") is True
