"""Tests for pipeline.nudge: silent when nothing is new; untrusted titles are neutralized."""

import json

from pipeline import nudge


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
