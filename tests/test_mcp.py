"""Tests for mcp_server.server: registered tools, as_of on repo data, refresh validation, stdout."""

import asyncio

import pytest

from mcp_server import server
from tests.test_prices import FIXTURE

EXPECTED_TOOLS = {
    "get_price_history",
    "get_press_releases",
    "get_events",
    "get_guidance",
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
