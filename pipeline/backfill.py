"""One-time local backfill of daily closes into docs/data/prices.json. Run: make backfill, or
make backfill-benchmark (--only SYMBOL: add one missing series, leave the rest untouched)."""

import argparse
import datetime
import json
import os
import sys
import tempfile
from pathlib import Path

from core.config import load_watchlist
from core.prices import (
    PRICES_PATH,
    _closes_from_frame,
    _download,
    _now_iso,
    _tickers,
    build_prices,
)


def write_json_atomic(path, data: dict) -> None:
    """Write data as JSON to path via a temp file in the same directory and os.replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", dir=path.parent, suffix=".tmp", delete=False, encoding="utf-8"
    ) as f:
        json.dump(data, f, indent=1)
        f.write("\n")
        tmp = f.name
    os.replace(tmp, path)


def backfill_one(
    symbol: str, years: int, path: Path = PRICES_PATH, watchlist: dict | None = None
) -> int:
    """Add one missing series to an existing prices.json, from its earliest date (or --years
    back) to today UTC exclusive; leave everything else as loaded; return 0 or 1."""
    if watchlist is None:
        watchlist = load_watchlist()
    if not path.exists():
        print(f"[backfill] {path} missing; run make backfill first")
        return 1
    prices = json.loads(path.read_text(encoding="utf-8"))
    if symbol in prices["series"]:
        print(f"[backfill] {symbol} already in {path.name}; refusing (nothing written)")
        return 1
    end = datetime.datetime.now(datetime.UTC).date()  # exclusive: today's session is skipped
    firsts = [s["dates"][0] for s in prices["series"].values() if s["dates"]]
    if firsts:
        start = datetime.date.fromisoformat(min(firsts))
    else:
        start = end - datetime.timedelta(days=365 * years)
    print(f"[backfill] {symbol}, {start} to {end} (exclusive)")
    frame = _download([symbol], start=start.isoformat(), end=end.isoformat())
    rows = [r for r in _closes_from_frame(frame, symbol) if r[0] < end.isoformat()]
    if not rows:
        print(f"[backfill] no closes for {symbol}; {path.name} not written")
        return 1
    series = build_prices({symbol: rows}, watchlist, _now_iso())["series"][symbol]
    prices["series"][symbol] = series
    write_json_atomic(path, prices)
    print(
        f"[backfill] {symbol} {series['currency']} {len(series['dates'])} dates "
        f"{series['dates'][0]} to {series['dates'][-1]}; wrote {path}"
    )
    return 0


def main() -> int:
    """Download --years of daily closes for all tickers and FX pairs (or add one --only symbol);
    write prices.json."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", type=int, default=2)
    parser.add_argument("--only", help="add this one missing symbol to the existing file")
    args = parser.parse_args()

    watchlist = load_watchlist()
    if args.only:
        return backfill_one(args.only, args.years, PRICES_PATH, watchlist)
    symbols = _tickers(watchlist) + list(watchlist["dashboard"].get("fx_pairs", []))
    end = datetime.datetime.now(datetime.UTC).date()  # exclusive: today's session is skipped
    start = end - datetime.timedelta(days=365 * args.years)
    print(f"[backfill] {len(symbols)} symbols, {start} to {end} (exclusive)")
    frame = _download(symbols, start=start.isoformat(), end=end.isoformat())

    closes = {}
    for symbol in symbols:
        # FX trades 24h and yfinance can return a bar dated `end`; drop it explicitly.
        rows = [r for r in _closes_from_frame(frame, symbol) if r[0] < end.isoformat()]
        if rows:
            closes[symbol] = rows
        else:
            print(f"[backfill] no closes for {symbol}")
    if not closes:
        print("[backfill] download returned nothing; prices.json not written")
        return 1

    prices = build_prices(closes, watchlist, _now_iso())
    write_json_atomic(PRICES_PATH, prices)

    print(f"{'symbol':<10} {'currency':<8} {'dates':>5}  first       last        last close")
    for symbol, s in prices["series"].items():
        print(
            f"{symbol:<10} {s['currency']:<8} {len(s['dates']):>5}  "
            f"{s['dates'][0]}  {s['dates'][-1]}  {s['closes'][-1]:.4f}"
        )
    print(f"{'code':<8} market_cap_usd_m")
    for code, cap in prices["market_cap_usd_m"].items():
        print(f"{code:<8} {cap if cap is not None else 'null':>10}")
    print(f"[backfill] wrote {PRICES_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
