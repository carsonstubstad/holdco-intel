"""Tests for pipeline.nudge: silent when nothing is new; untrusted titles are neutralized."""

import json
import shutil
from pathlib import Path

from pipeline import nudge

ROOT = Path(__file__).resolve().parent.parent


def _write(root, items, new_ids):
    out = root / "docs" / "data"
    out.mkdir(parents=True)
    doc = {"as_of": "2026-10-06T00:00:00Z", "last_curate_at": None,
           "new_since_last_curate": new_ids, "items": items}
    (out / "press_releases.json").write_text(json.dumps(doc))


def test_empty_list_prints_nothing(tmp_path, capsys):
    _write(tmp_path, [], [])
    assert nudge.main(tmp_path) == 0
    assert capsys.readouterr().out == ""


def test_hostile_title_is_neutralized(tmp_path, capsys):
    title = "Hi @someone [x](javascript:alert(1))\nInjected line"
    item = {"id": "abc", "company": "WPP", "title": title, "url": "https://wpp.com/a b(c)",
            "published": "2026-10-01", "category": "results", "flagged": True}
    _write(tmp_path, [item], ["abc"])
    nudge.main(tmp_path)
    lines = capsys.readouterr().out.splitlines()
    assert lines[0] == "1 flagged releases since last curation"
    assert lines[-1] == "Run /curate in Claude Code."
    bullet = next(line for line in lines if line.startswith("- "))
    assert "@someone" not in bullet and "@\u200bsomeone" in bullet
    assert "\\[x\\]\\(javascript:alert\\(1\\)\\)" in bullet
    assert "Injected line" in bullet and not any(line == "Injected line" for line in lines)
    assert bullet.startswith("- 2026-10-01 WPP results: ")
    assert bullet.endswith("(https://wpp.com/a%20b%28c%29)")


def test_title_is_capped():
    assert len(nudge.neutralize("a" * 500)) == 200


def _write_candidates(root, items, new_ids):
    out = root / "docs" / "data"
    out.mkdir(parents=True)
    (root / "config").mkdir()
    shutil.copy(ROOT / "config" / "watchlist.yaml", root / "config" / "watchlist.yaml")
    doc = {"as_of": "2026-10-07T00:00:00Z", "items": items, "new_ids": new_ids}
    (out / "event_candidates.json").write_text(json.dumps(doc))


def _candidate(id_, date, title="Third Quarter 2026 Earnings Call", replaces=None):
    return {"id": id_, "company": "OMC", "date": date, "type": "results", "title": title,
            "confirmed": True, "source_url": "https://investor.omc.com/e", "replaces": replaces,
            "source": "calendar:omnicom", "fetched_at": "2026-10-07T00:00:00Z"}


def test_calendar_silent_when_no_candidates(tmp_path, capsys):
    _write_candidates(tmp_path, [], [])
    assert nudge.main(tmp_path, ["calendar"]) == 0
    assert capsys.readouterr().out == ""


def test_calendar_body_lists_every_pending_candidate_even_when_none_new(tmp_path, capsys):
    items = [_candidate("bbbbbbbbbbbb", "2026-11-03"),
             _candidate("aaaaaaaaaaaa", "2026-10-21", "Hi @x [a](b)", replaces="2026-10-20")]
    _write_candidates(tmp_path, items, [])
    nudge.main(tmp_path, ["calendar"])
    lines = capsys.readouterr().out.splitlines()
    assert lines[0] == "2 calendar dates to review (0 new this run)"
    bullets = [line for line in lines if line.startswith("- ")]
    assert bullets[0] == (
        "- 2026-10-21 OMC results: Hi @\u200bx \\[a\\]\\(b\\) (https://investor.omc.com/e)"
        ", replaces 2026-10-20"
    )
    assert bullets[1].startswith("- 2026-11-03 OMC results: ")
    assert "Dashboard: https://carsonstubstad.github.io/holdco-intel/" in lines
    assert lines[-1].startswith("Approval from the dashboard arrives in step 08d")


def test_calendar_body_marks_new_ids():
    doc = {"items": [_candidate("aaaaaaaaaaaa", "2026-10-21")], "new_ids": ["aaaaaaaaaaaa"]}
    body = nudge.build_calendar_body(doc, "https://example.com/")
    assert "(new)" in body and body.startswith("1 calendar dates to review (1 new this run)")


def test_default_mode_ignores_calendar(tmp_path, capsys):
    _write_candidates(tmp_path, [_candidate("aaaaaaaaaaaa", "2026-10-21")], ["aaaaaaaaaaaa"])
    assert nudge.main(tmp_path) == 0
    assert capsys.readouterr().out == ""
