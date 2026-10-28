"""Tests for pipeline.stats: numbers from a tiny runs.jsonl and injected history, "n/a" when an
input is missing. No git and no network."""

import datetime
from pathlib import Path

from pipeline import stats

FIXTURES = Path(__file__).parent / "fixtures"
TODAY = datetime.date(2026, 10, 28)
COMPANIES = [{"code": "PUB", "name": "Publicis Groupe", "ticker": "PUB.PA"},
             {"code": "WPP", "name": "WPP", "ticker": "WPP.L"}]


def _runs():
    return stats.read_runs((FIXTURES / "runs_small.jsonl").read_text(encoding="utf-8"))


def test_run_numbers_from_fixture():
    n = stats.run_numbers(_runs())
    assert n["runs"] == 5  # the unreadable line is skipped
    assert n["median_s"] == 10.0
    assert n["p95_s"] == 30.0  # nearest rank: the 5th of 5
    assert (n["all_ok"], n["judged"]) == (4, 5)


def test_source_failures_count_not_ok_only():
    snapshots = [
        {"sources": {"prices": {"ok": True}, "press_releases:WPP": {"ok": False}}},
        {"sources": {"prices": {"ok": True}, "press_releases:WPP": {"ok": False}}},
        {"sources": {"prices": {"ok": False}}},  # WPP absent: not a failure
    ]
    assert stats.source_failures(snapshots) == {"prices": 1, "press_releases:WPP": 2}


def test_curate_numbers():
    commits = [("2026-10-26", "curate: 4 commentary quotes"), ("2026-10-27", "data: daily"),
               ("2026-10-15", "curate: 6 commentary quotes"), ("2026-10-14", "tweak: x")]
    assert stats.curate_numbers(commits) == {"count": 2, "last": datetime.date(2026, 10, 26)}
    assert stats.curate_numbers([]) == {"count": 0, "last": None}


def test_source_labels_in_plain_words():
    names = {"PUB": "Publicis Groupe", "DENTSU": "Dentsu"}
    assert stats.source_label("press_releases:DENTSU", names) == "Dentsu press releases"
    assert stats.source_label("calendar:PUB", names) == "Publicis Groupe results calendar"
    assert stats.source_label("prices", names) == "prices"


def test_report_from_inputs():
    inputs = {
        "runs": _runs(),
        "snapshots": [{"sources": {"prices": {"ok": True}, "press_releases:WPP": {"ok": False}}}],
        "commits": [("2026-10-26", "curate: 4 commentary quotes")],
        "guidance": {"records": [{"verified": True}, {"verified": True}, {"verified": False}]},
        "status": {"sources": {"press_releases:PUB": {"ok": True},
                               "press_releases:WPP": {"ok": False}}},
        "prices": {"series": {"PUB.PA": {"dates": ["2026-10-26", "2026-10-27"]},
                              "WPP.L": {"dates": ["2026-10-27"]}}},
        "companies": COMPANIES,
    }
    text = stats.report(TODAY, inputs)
    assert "- Pipeline runs: 5" in text
    assert "- Runtime: median 10.0 s, p95 30.0 s (nearest rank)" in text
    assert "- Runs with every source ok: 4 of 5 (80%)" in text
    assert "- Source failures across 1 daily snapshots: WPP press releases 1; " \
        "every other source: 0" in text
    assert "- Curate commits: 1, the last on 26 Oct 2026" in text
    assert "- Verified guidance records: 2" in text
    assert "- Press release sources ok now: 1 of 2 (not ok: WPP)" in text
    assert "- Price history: 2 trading days (26 Oct 2026 to 27 Oct 2026)" in text
    assert "n/a" not in text


def test_report_prints_na_without_inputs():
    empty = {"runs": None, "snapshots": None, "commits": None, "guidance": None,
             "status": None, "prices": None, "companies": []}
    lines = stats.report(TODAY, empty).splitlines()[2:]
    assert len(lines) == 8
    assert all(line.endswith("n/a") for line in lines)


def test_git_missing_gives_none(monkeypatch, tmp_path):
    def missing(*args, **kwargs):
        raise FileNotFoundError("git")

    monkeypatch.setattr(stats.subprocess, "run", missing)
    assert stats.git(["log"], tmp_path) is None
    assert stats.status_history(tmp_path) is None
    assert stats.commit_log(tmp_path) is None
