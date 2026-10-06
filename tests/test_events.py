"""Tests for core.events: YAML dates to ISO, window and company filters, empty files."""

import datetime

from core.events import get_events


def _iso(days: int) -> str:
    return (datetime.datetime.now(datetime.UTC).date() + datetime.timedelta(days=days)).isoformat()


def test_missing_and_empty_file_return_empty(tmp_path):
    assert get_events(path=tmp_path / "nope.yaml") == []
    (tmp_path / "events.yaml").write_text("")
    assert get_events(path=tmp_path / "events.yaml") == []
    (tmp_path / "events.yaml").write_text("items: []\n")
    assert get_events(path=tmp_path / "events.yaml") == []


def test_dates_are_iso_strings_filtered_and_sorted(tmp_path):
    path = tmp_path / "events.yaml"
    path.write_text(
        "items:\n"
        f"  - {{company: WPP, date: {_iso(20)}, type: results, title: H2}}\n"
        f"  - {{company: PUB, date: {_iso(5)}, type: results, title: Q3}}\n"
        f"  - {{company: OMC, date: {_iso(-400)}, type: agm, title: old}}\n"
        f"  - {{company: OMC, date: {_iso(300)}, type: other, title: far}}\n"
    )
    events = get_events(path=path)
    assert [e["title"] for e in events] == ["Q3", "H2"]
    assert all(isinstance(e["date"], str) for e in events)
    assert [e["title"] for e in get_events("wpp", path=path)] == ["H2"]
    assert len(get_events(past_days=500, future_days=400, path=path)) == 4
