"""Tests for core.prices: append without fill, stale_days, idempotency, market cap, readers."""

import json
from pathlib import Path

import pandas as pd

import core.prices
from core.prices import (
    _closes_from_frame,
    append_latest,
    build_prices,
    fetch_latest_closes,
    get_benchmark_history,
    get_fx,
    get_price_history,
    market_cap_usd_m,
)

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "prices_small.json"

WATCHLIST = {
    "dashboard": {
        "fx_pairs": ["EURUSD=X", "GBPUSD=X", "JPY=X"],
        "benchmark": {"symbol": "^GSPC", "name": "S&P 500", "currency": "USD"},
    },
    "companies": [
        {"code": "PUB", "ticker": "PUB.PA", "currency": "EUR", "shares_outstanding_m": 254.0},
        {
            "code": "WPP",
            "ticker": "WPP.L",
            "currency": "GBP",
            "price_currency": "GBX",
            "shares_outstanding_m": 1078.0,
        },
    ],
}


def _prices() -> dict:
    return json.loads(FIXTURE.read_text())


def _series(currency: str, closes: list) -> dict:
    dates = [f"2026-10-0{i + 1}" for i in range(len(closes))]
    return {"currency": currency, "dates": dates, "closes": closes}


def test_appends_newer_close():
    latest = {"PUB.PA": [{"date": "2026-10-02", "close": 99.0}, {"date": "2026-10-05", "close": 81.0}]}
    out = append_latest(_prices(), latest, "2026-10-06", WATCHLIST)
    pub = out["series"]["PUB.PA"]
    assert pub["dates"][-2:] == ["2026-10-02", "2026-10-05"]
    assert pub["closes"][-2:] == [80.0, 81.0]  # same-date close is not overwritten
    assert pub["source"] == "yfinance"
    assert pub["stale_days"] == 0
    assert out["as_of"] == pub["fetched_at"]


def test_appends_missed_days_in_order():
    latest = {
        "WPP.L": [
            {"date": "2026-10-07", "close": 404.0},
            {"date": "2026-10-05", "close": 402.0},
            {"date": "2026-10-06", "close": 403.0},
            {"date": "2026-09-30", "close": 1.0},  # older than last date: ignored, no backfill
        ]
    }
    out = append_latest(_prices(), latest, "2026-10-08", WATCHLIST)
    wpp = out["series"]["WPP.L"]
    assert wpp["dates"] == [
        "2026-09-28", "2026-09-29", "2026-10-01", "2026-10-02",
        "2026-10-05", "2026-10-06", "2026-10-07",
    ]
    assert wpp["closes"][-3:] == [402.0, 403.0, 404.0]
    assert "2026-09-30" not in wpp["dates"]


def test_stale_days_counts_weekdays_across_weekend():
    prices = _prices()  # last date Fri 2026-10-02
    for today, expected in [("2026-10-03", 0), ("2026-10-05", 0), ("2026-10-06", 1)]:
        out = append_latest(prices, {}, today, WATCHLIST)
        assert out["series"]["PUB.PA"]["stale_days"] == expected, today
        assert out["series"]["PUB.PA"]["source"] == "backfill"
    prices["series"]["PUB.PA"]["dates"][-1] = "2026-10-01"  # Thu
    assert append_latest(prices, {}, "2026-10-05", WATCHLIST)["series"]["PUB.PA"]["stale_days"] == 1
    prices["series"]["PUB.PA"]["dates"][-1] = "2026-09-30"  # Wed
    assert append_latest(prices, {}, "2026-10-05", WATCHLIST)["series"]["PUB.PA"]["stale_days"] == 2


def test_append_is_idempotent_and_returns_new_dict():
    prices = _prices()
    before = json.dumps(prices, sort_keys=True)
    latest = {
        "PUB.PA": [{"date": "2026-10-05", "close": 81.0}],
        "EURUSD=X": [{"date": "2026-10-05", "close": 1.12}],
    }
    once = append_latest(prices, latest, "2026-10-06", WATCHLIST)
    twice = append_latest(once, latest, "2026-10-06", WATCHLIST)
    assert twice == once
    assert json.dumps(prices, sort_keys=True) == before
    for s in twice["series"].values():
        assert len(s["dates"]) == len(set(s["dates"])) == len(s["closes"])


def test_market_cap_eur_gbx_jpy_usd():
    watchlist = {
        "dashboard": {"fx_pairs": ["EURUSD=X", "GBPUSD=X", "JPY=X"]},
        "companies": [
            {"code": "PUB", "ticker": "PUB.PA", "shares_outstanding_m": 254.0},
            {"code": "WPP", "ticker": "WPP.L", "shares_outstanding_m": 1078.0},
            {"code": "DENTSU", "ticker": "4324.T", "shares_outstanding_m": 262.0},
            {"code": "OMC", "ticker": "OMC", "shares_outstanding_m": 323.0},
            {"code": "NOSHARES", "ticker": "OMC", "shares_outstanding_m": None},
        ],
    }
    series = {
        "PUB.PA": _series("EUR", [79.0, 80.0]),
        "WPP.L": _series("GBX", [400.0]),
        "4324.T": _series("JPY", [3000.0]),
        "OMC": _series("USD", [75.0]),
        "EURUSD=X": _series("FX", [1.05, 1.10]),
        "GBPUSD=X": _series("FX", [1.25]),
        "JPY=X": _series("FX", [150.0]),
    }
    caps = market_cap_usd_m(series, watchlist)
    assert caps == {"PUB": 22352, "WPP": 5390, "DENTSU": 5240, "OMC": 24225, "NOSHARES": None}
    del series["GBPUSD=X"]
    assert market_cap_usd_m(series, watchlist)["WPP"] is None


def test_append_recomputes_market_cap():
    latest = {"EURUSD=X": [{"date": "2026-10-05", "close": 1.2}]}
    out = append_latest(_prices(), latest, "2026-10-06", WATCHLIST)
    assert out["market_cap_usd_m"] == {"PUB": round(80.0 * 254 * 1.2), "WPP": None}


def test_get_price_history_slices_without_fill():
    h = get_price_history("WPP", "2026-09-29", "2026-10-01", path=FIXTURE, watchlist=WATCHLIST)
    assert h == {
        "symbol": "WPP.L",
        "currency": "GBX",
        "dates": ["2026-09-29", "2026-10-01"],
        "closes": [398.2, 401.0],
        "stale_days": 0,
        "source": "backfill",
    }


def test_get_fx_shape():
    fx = get_fx("EURUSD=X", start="2026-10-01", path=FIXTURE)
    assert fx["symbol"] == "EURUSD=X"
    assert fx["currency"] == "FX"
    assert fx["dates"] == ["2026-10-01", "2026-10-02"]
    assert fx["closes"] == [1.105, 1.1]


def test_closes_from_frame_drops_nan_per_symbol():
    idx = pd.to_datetime(["2026-09-30", "2026-10-01", "2026-10-02"])
    cols = pd.MultiIndex.from_product([["A", "B"], ["Close"]])
    frame = pd.DataFrame([[1.0, 2.0], [float("nan"), 2.5], [1.123456, 3.0]], index=idx, columns=cols)
    assert _closes_from_frame(frame, "A") == [("2026-09-30", 1.0), ("2026-10-02", 1.1235)]
    assert len(_closes_from_frame(frame, "B")) == 3
    assert _closes_from_frame(frame, "MISSING") == []


def test_append_latest_appends_benchmark_market_caps_unchanged():
    prices = _prices()
    latest = {"^GSPC": [{"date": "2026-10-05", "close": 6720.5}]}
    out = append_latest(prices, latest, "2026-10-06", WATCHLIST)
    gspc = out["series"]["^GSPC"]
    assert gspc["dates"][-1] == "2026-10-05" and gspc["closes"][-1] == 6720.5
    assert gspc["source"] == "yfinance"
    assert out["market_cap_usd_m"] == prices["market_cap_usd_m"] == {"PUB": 22352, "WPP": None}


def test_market_cap_ignores_benchmark():
    caps = market_cap_usd_m(_prices()["series"], WATCHLIST)
    assert set(caps) == {"PUB", "WPP"}


def test_build_prices_sets_benchmark_currency():
    out = build_prices({"^GSPC": [("2026-10-01", 6650.0)]}, WATCHLIST, "2026-10-02T00:00:00Z")
    assert out["series"]["^GSPC"]["currency"] == "USD"
    assert set(out["market_cap_usd_m"]) == {"PUB", "WPP"}


def test_fetch_latest_closes_requests_benchmark(monkeypatch):
    calls = []

    def fake_download(symbols, **kwargs):
        calls.append(list(symbols))
        idx = pd.to_datetime(["2026-10-01"])
        cols = pd.MultiIndex.from_product([symbols, ["Close"]])
        return pd.DataFrame([[1.0] * len(symbols)], index=idx, columns=cols)

    monkeypatch.setattr(core.prices, "load_watchlist", lambda: WATCHLIST)
    monkeypatch.setattr(core.prices, "_download", fake_download)
    latest = fetch_latest_closes(["PUB"], ["EURUSD=X"])
    assert calls == [["PUB.PA", "EURUSD=X", "^GSPC"]]
    assert latest["^GSPC"] == [{"date": "2026-10-01", "close": 1.0}]


def test_get_benchmark_history():
    h = get_benchmark_history("2026-10-01", path=FIXTURE, watchlist=WATCHLIST)
    assert h == {
        "symbol": "^GSPC",
        "currency": "USD",
        "dates": ["2026-10-01", "2026-10-02"],
        "closes": [6650.0, 6700.0],
        "stale_days": 0,
        "source": "backfill",
        "name": "S&P 500",
    }
