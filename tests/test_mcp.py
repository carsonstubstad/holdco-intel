"""Tests for mcp_server.server: registered tools, as_of on repo data, refresh validation, stdout."""

import asyncio

import pytest

from mcp_server import server
from tests.test_commentary import FIXTURE as COMMENTARY_FIXTURE
from tests.test_prices import FIXTURE

EXPECTED_TOOLS = {
    "get_price_history",
    "get_press_releases",
    "get_events",
    "get_guidance",
    "get_commentary",
    "get_kpis",
    "get_status",
    "list_companies",
    "refresh",
}


def test_expected_tools_are_registered():
    names = {t.name for t in asyncio.run(server.app.list_tools())}
    assert names == EXPECTED_TOOLS


def test_guidance_and_status_carry_as_of_from_repo_data():
    for result in (server.get_guidance(), server.get_status()):
        assert isinstance(result, dict)
        assert isinstance(result["as_of"], str) and result["as_of"]


@pytest.mark.parametrize(
    "source",
    ["../x", "prices; rm", "press_releases:NOPE", "https://example.com", "news:PUB"],
)
def test_refresh_rejects_bad_sources(monkeypatch, source):
    def boom(*args, **kwargs):
        raise AssertionError("collector must not be called")

    monkeypatch.setattr(server.prices, "fetch_latest_closes", boom)
    monkeypatch.setattr(server.press_releases, "get_press_releases", boom)
    result = server.refresh(source)
    assert result["as_of"] is None
    assert "error" in result


def test_printing_tool_does_not_write_stdout(monkeypatch, capsys):
    def noisy(codes, fx_pairs):
        print("[prices] hello from a collector")
        return {}

    monkeypatch.setattr(server.prices, "fetch_latest_closes", noisy)
    result = server.refresh("prices")
    captured = capsys.readouterr()
    assert result["items"] == {}
    assert captured.out == ""
    assert "[prices] hello from a collector" in captured.err


@pytest.mark.parametrize("code", ["BENCHMARK", "benchmark"])
def test_price_history_benchmark(monkeypatch, code):
    monkeypatch.setattr(server.prices, "PRICES_PATH", FIXTURE)
    result = server.get_price_history(code, start="2026-10-01")
    assert result["as_of"] == "2026-10-02T22:30:00Z"
    assert result["symbol"] == "^GSPC"
    assert result["name"] == "S&P 500"
    assert result["dates"] == ["2026-10-01", "2026-10-02"]


def test_commentary_missing_file_gives_empty_lists_and_note(monkeypatch, tmp_path):
    monkeypatch.setattr(server.commentary, "COMMENTARY_PATH", tmp_path / "nope.json")
    result = server.get_commentary()
    assert "error" not in result
    assert result["headlines"] == [] and result["records"] == []
    assert result["note"] == server.COMMENTARY_NOTE


def test_commentary_reads_records(monkeypatch):
    monkeypatch.setattr(server.commentary, "COMMENTARY_PATH", COMMENTARY_FIXTURE)
    result = server.get_commentary("WPP", theme="outlook")
    assert [r["id"] for r in result["records"]] == ["wpp-outlook-2026-08-07-1"]
    assert [h["company"] for h in result["headlines"]] == ["WPP"]


@pytest.mark.parametrize(
    ("last_curate_at", "expected"),
    [
        ("2026-08-01T00:00:00Z", "2026-08-08T10:00:00Z"),  # document run after last /curate
        ("2026-09-01T00:00:00Z", "2026-09-01T00:00:00Z"),  # /curate run is the newer one
    ],
)
def test_commentary_as_of_is_newer_of_curate_state_and_records(
    monkeypatch, tmp_path, last_curate_at, expected
):
    state = tmp_path / "curate_state.json"
    state.write_text(f'{{"last_curate_at": "{last_curate_at}", "items_reviewed": 0}}')
    monkeypatch.setattr(server, "CURATE_STATE", state)
    monkeypatch.setattr(server.commentary, "COMMENTARY_PATH", COMMENTARY_FIXTURE)
    assert server.get_commentary("PUB", theme="outlook")["as_of"] == expected


@pytest.mark.parametrize("kwargs", [{"code": "NOPE"}, {"theme": "gossip"}])
def test_commentary_rejects_unknown_code_and_theme(monkeypatch, kwargs):
    monkeypatch.setattr(server.commentary, "COMMENTARY_PATH", COMMENTARY_FIXTURE)
    result = server.get_commentary(**kwargs)
    assert result["as_of"] is None
    assert "error" in result
