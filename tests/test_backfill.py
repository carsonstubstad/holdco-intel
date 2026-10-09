"""Tests for pipeline.backfill --only: add one missing series, leave the rest byte-identical."""

import json
from pathlib import Path

import pandas as pd

from pipeline import backfill
from pipeline.backfill import backfill_one, write_json_atomic
from tests.test_prices import FIXTURE, WATCHLIST


def _frame(symbol: str, dates: list[str], closes: list[float]):
    cols = pd.MultiIndex.from_product([[symbol], ["Close"]])
    return pd.DataFrame([[c] for c in closes], index=pd.to_datetime(dates), columns=cols)


def test_only_adds_missing_series_byte_identical(tmp_path, monkeypatch):
    prices = json.loads(FIXTURE.read_text())
    del prices["series"]["^GSPC"]
    path = tmp_path / "prices.json"
    write_json_atomic(path, prices)
    original = path.read_bytes()
    calls = []

    def fake_download(symbols, **kwargs):
        calls.append((symbols, kwargs))
        return _frame("^GSPC", ["2026-09-28", "2026-09-29"], [6600.0, 6625.5])

    monkeypatch.setattr(backfill, "_download", fake_download)
    assert backfill_one("^GSPC", 2, path, WATCHLIST) == 0
    assert calls[0][0] == ["^GSPC"]
    assert calls[0][1]["start"] == "2026-09-28"  # earliest date already in the file

    after = json.loads(path.read_text())
    gspc = after["series"]["^GSPC"]
    assert gspc["currency"] == "USD" and gspc["source"] == "backfill"
    assert gspc["dates"] == ["2026-09-28", "2026-09-29"]
    assert list(after["series"])[-1] == "^GSPC"
    del after["series"]["^GSPC"]
    check = tmp_path / "check.json"
    write_json_atomic(check, after)
    assert check.read_bytes() == original


def test_only_refuses_existing_series(tmp_path, monkeypatch, capsys):
    path = tmp_path / "prices.json"
    path.write_bytes(Path(FIXTURE).read_bytes())
    original = path.read_bytes()

    def boom(*args, **kwargs):
        raise AssertionError("must not download")

    monkeypatch.setattr(backfill, "_download", boom)
    assert backfill_one("^GSPC", 2, path, WATCHLIST) == 1
    assert path.read_bytes() == original
    assert "already in prices.json; refusing" in capsys.readouterr().out
