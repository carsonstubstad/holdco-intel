"""One-time local backfill of daily closes into docs/data/prices.json. Run: make backfill"""

import argparse
import datetime
import json
import os
import sys
import tempfile

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


def main() -> int:
    """Download --years of daily closes for all tickers and FX pairs; write prices.json."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", type=int, default=2)
    args = parser.parse_args()

    watchlist = load_watchlist()
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
