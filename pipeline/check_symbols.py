"""Local check: one yfinance call for every ticker and FX pair; print last close per symbol."""

import inspect

import yfinance as yf

from core.config import load_watchlist

FX_UNITS = {"EURUSD=X": "USD per unit", "GBPUSD=X": "USD per unit", "JPY=X": "JPY per USD"}


def _unit(symbol: str, currency_by_ticker: dict) -> str:
    if symbol == "WPP.L":
        return "GBX (pence)"
    if symbol in FX_UNITS:
        return FX_UNITS[symbol]
    return currency_by_ticker.get(symbol, "?")


def _last_close(frame, symbol: str) -> tuple[str, str] | None:
    """Return (last date, last close) for one symbol from the batched frame, or None."""
    try:
        closes = frame[symbol]["Close"].dropna()
    except (KeyError, TypeError):
        return None
    if closes.empty:
        return None
    return closes.index[-1].strftime("%Y-%m-%d"), f"{float(closes.iloc[-1]):.4f}"


def main() -> None:
    """Print yfinance version, download signature and a last-close table; never raise."""
    print(f"[check_symbols] yfinance {yf.__version__}")
    print(f"[check_symbols] yf.download{inspect.signature(yf.download)}")
    try:
        watchlist = load_watchlist()
        currency_by_ticker = {c["ticker"]: c["currency"] for c in watchlist["companies"]}
        symbols = list(currency_by_ticker) + list(watchlist["dashboard"].get("fx_pairs", []))
    except Exception as exc:  # noqa: BLE001 - local diagnostic script must not raise
        print(f"[check_symbols] could not load watchlist: {exc}")
        return
    frame = None
    try:
        frame = yf.download(
            symbols,
            period="10d",
            interval="1d",
            auto_adjust=False,
            threads=False,
            progress=False,
            group_by="ticker",
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[check_symbols] yf.download failed: {exc}")
    print(f"{'symbol':<10} {'last date':<11} {'last close':>12}  unit")
    for symbol in symbols:
        result = _last_close(frame, symbol) if frame is not None else None
        if result is None:
            print(f"{symbol:<10} {'MISSING':<11} {'':>12}  {_unit(symbol, currency_by_ticker)}")
        else:
            date, close = result
            print(f"{symbol:<10} {date:<11} {close:>12}  {_unit(symbol, currency_by_ticker)}")


if __name__ == "__main__":
    main()
