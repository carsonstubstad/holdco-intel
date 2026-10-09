"""Daily close history: batched yfinance fetch, append without fill, market cap, readers."""

import copy
import datetime
import json
from pathlib import Path

from core.config import get_company, load_watchlist

ROOT = Path(__file__).resolve().parent.parent
PRICES_PATH = ROOT / "docs" / "data" / "prices.json"


def _now_iso() -> str:
    return datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _closes_from_frame(frame, symbol: str) -> list[tuple[str, float]]:
    """Return [(YYYY-MM-DD, close)] for one symbol of a group_by='ticker' frame, NaNs dropped."""
    try:
        closes = frame[symbol]["Close"].dropna()
    except (KeyError, TypeError):
        return []
    return [(ts.strftime("%Y-%m-%d"), round(float(v), 4)) for ts, v in closes.items()]


def _download(symbols: list[str], **kwargs):
    import yfinance as yf

    return yf.download(
        symbols,
        interval="1d",
        auto_adjust=False,
        threads=False,
        progress=False,
        group_by="ticker",
        **kwargs,
    )


def _tickers(watchlist: dict, codes: list[str] | None = None) -> list[str]:
    companies = watchlist["companies"]
    if codes is not None:
        companies = [get_company(code, watchlist) for code in codes]
    return [c["ticker"] for c in companies]


def _benchmark_symbols(watchlist: dict) -> list[str]:
    bench = watchlist["dashboard"].get("benchmark")
    return [bench["symbol"]] if bench else []


def _fx_rate(currency: str, series: dict, fx_pairs: list[str]) -> float | None:
    """USD per one unit of `currency` from the last close of a configured FX pair, or None."""
    scale = 1.0
    if currency == "GBX":
        currency, scale = "GBP", 0.01
    if currency == "USD":
        return scale
    for pair in fx_pairs:
        closes = series.get(pair, {}).get("closes") or []
        last = next((c for c in reversed(closes) if c is not None), None)
        if not last:
            continue
        if pair == f"{currency}USD=X":
            return scale * last
        if pair == f"{currency}=X":
            return scale / last
    return None


def market_cap_usd_m(series: dict, watchlist: dict) -> dict:
    """Return {code: approx market cap in USD millions or None} from last close, shares and FX."""
    fx_pairs = watchlist["dashboard"].get("fx_pairs", [])
    caps = {}
    for company in watchlist["companies"]:
        caps[company["code"]] = None
        shares = company.get("shares_outstanding_m")
        s = series.get(company["ticker"])
        if not shares or not s or not s.get("closes"):
            continue
        rate = _fx_rate(s["currency"], series, fx_pairs)
        if rate is None or s["closes"][-1] is None:
            continue
        caps[company["code"]] = round(s["closes"][-1] * shares * rate)
    return caps


def build_prices(closes_by_symbol: dict, watchlist: dict, fetched_at: str) -> dict:
    """Return a prices.json dict from {symbol: [(date, close)]} with source 'backfill'."""
    currency = {
        c["ticker"]: c.get("price_currency", c["currency"]) for c in watchlist["companies"]
    }
    for pair in watchlist["dashboard"].get("fx_pairs", []):
        currency[pair] = "FX"
    bench = watchlist["dashboard"].get("benchmark")
    if bench:
        currency[bench["symbol"]] = bench.get("currency", "?")
    series = {}
    for symbol, rows in closes_by_symbol.items():
        series[symbol] = {
            "currency": currency.get(symbol, "?"),
            "dates": [d for d, _ in rows],
            "closes": [c for _, c in rows],
            "stale_days": 0,
            "source": "backfill",
            "fetched_at": fetched_at,
        }
    return {
        "as_of": fetched_at,
        "base_currency": "USD",
        "series": series,
        "market_cap_usd_m": market_cap_usd_m(series, watchlist),
    }


def fetch_latest_closes(codes: list[str], fx_pairs: list[str]) -> dict:
    """One batched yfinance call (period 5d) for the tickers, FX pairs and benchmark; return
    {symbol: [{date, close}, ...]} for completed sessions (today UTC excluded); never raise."""
    try:
        watchlist = load_watchlist()
        symbols = _tickers(watchlist, codes) + list(fx_pairs) + _benchmark_symbols(watchlist)
        frame = _download(symbols, period="5d")
        today = datetime.datetime.now(datetime.UTC).date().isoformat()
        latest = {}
        for symbol in symbols:
            rows = [
                {"date": d, "close": c} for d, c in _closes_from_frame(frame, symbol) if d < today
            ]
            if rows:
                latest[symbol] = rows
            else:
                print(f"[prices] no completed closes for {symbol}")
        return latest
    except Exception as exc:  # noqa: BLE001 - collector must never raise
        print(f"[prices] fetch_latest_closes failed: {exc}")
        return {}


def _weekdays_between(start: str, end: str) -> int:
    """Number of Mon-Fri dates strictly between two ISO dates (0 if end <= start + 1 day)."""
    d = datetime.date.fromisoformat(start) + datetime.timedelta(days=1)
    stop = datetime.date.fromisoformat(end)
    count = 0
    while d < stop:
        if d.weekday() < 5:
            count += 1
        d += datetime.timedelta(days=1)
    return count


def append_latest(prices: dict, latest: dict, today: str, watchlist: dict | None = None) -> dict:
    """Append every close dated after a series' last date; never fabricate a value; set stale_days
    (weekdays strictly between last date and today); recompute market cap; return a new dict."""
    if watchlist is None:
        watchlist = load_watchlist()
    out = copy.deepcopy(prices)
    now = None
    for symbol, s in out["series"].items():
        last = s["dates"][-1] if s["dates"] else ""
        rows = sorted(
            {r["date"]: r["close"] for r in latest.get(symbol, []) if r["date"] > last}.items()
        )
        for date, close in rows:
            s["dates"].append(date)
            s["closes"].append(round(float(close), 4))
        if rows:
            now = now or _now_iso()
            s["source"] = "yfinance"
            s["fetched_at"] = now
        if s["dates"]:
            s["stale_days"] = _weekdays_between(s["dates"][-1], today)
    if now:
        out["as_of"] = now
    out["market_cap_usd_m"] = market_cap_usd_m(out["series"], watchlist)
    return out


def _slice(prices: dict, symbol: str, start: str | None, end: str | None) -> dict:
    s = prices["series"][symbol]
    pairs = [
        (d, c)
        for d, c in zip(s["dates"], s["closes"], strict=True)
        if (start is None or d >= start) and (end is None or d <= end)
    ]
    return {
        "symbol": symbol,
        "currency": s["currency"],
        "dates": [d for d, _ in pairs],
        "closes": [c for _, c in pairs],
        "stale_days": s["stale_days"],
        "source": s["source"],
    }


def _read(path: Path | str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def get_price_history(
    code: str,
    start: str | None = None,
    end: str | None = None,
    *,
    path: Path | str = PRICES_PATH,
    watchlist: dict | None = None,
) -> dict:
    """Return the committed daily close series for one company from docs/data/prices.json,
    sliced by date (inclusive)."""
    ticker = get_company(code, watchlist)["ticker"]
    return _slice(_read(path), ticker, start, end)


def get_fx(
    pair: str, start: str | None = None, end: str | None = None, *, path: Path | str = PRICES_PATH
) -> dict:
    """Return the committed daily series for an FX pair keyed by its yfinance symbol
    (EURUSD=X, GBPUSD=X, JPY=X; JPY=X is USD/JPY, i.e. yen per dollar)."""
    return _slice(_read(path), pair, start, end)


def get_benchmark_history(
    start: str | None = None,
    end: str | None = None,
    *,
    path: Path | str = PRICES_PATH,
    watchlist: dict | None = None,
) -> dict:
    """Return the committed daily close series for the dashboard benchmark, sliced by date
    (inclusive), plus its name; raise KeyError if no benchmark is configured or stored."""
    if watchlist is None:
        watchlist = load_watchlist()
    bench = watchlist["dashboard"].get("benchmark")
    if not bench:
        raise KeyError("no dashboard.benchmark in the watchlist")
    return {**_slice(_read(path), bench["symbol"], start, end), "name": bench["name"]}
