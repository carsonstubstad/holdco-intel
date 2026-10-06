"""Tests for core.config: watchlist loading, validation and company lookup."""

import copy
from pathlib import Path

import pytest
import yaml

from core.config import get_company, load_watchlist

ROOT = Path(__file__).resolve().parent.parent
WATCHLIST = str(ROOT / "config" / "watchlist.yaml")


def _write(tmp_path, data: dict) -> str:
    path = tmp_path / "watchlist.yaml"
    path.write_text(yaml.safe_dump(data))
    return str(path)


def _real() -> dict:
    return copy.deepcopy(load_watchlist(WATCHLIST))


def test_happy_path_six_companies():
    watchlist = load_watchlist(WATCHLIST)
    assert len(watchlist["companies"]) == 6
    assert get_company("PUB", watchlist)["ticker"] == "PUB.PA"


def test_missing_top_key_raises(tmp_path):
    data = _real()
    del data["classification"]
    with pytest.raises(ValueError, match="classification"):
        load_watchlist(_write(tmp_path, data))


def test_missing_company_key_raises(tmp_path):
    data = _real()
    del data["companies"][2]["ticker"]
    with pytest.raises(ValueError, match="ticker"):
        load_watchlist(_write(tmp_path, data))


def test_duplicate_code_raises(tmp_path):
    data = _real()
    data["companies"][1]["code"] = data["companies"][0]["code"]
    with pytest.raises(ValueError, match="duplicate"):
        load_watchlist(_write(tmp_path, data))


def test_unknown_code_raises_keyerror():
    with pytest.raises(KeyError, match="NOPE"):
        get_company("NOPE", load_watchlist(WATCHLIST))


def test_lowercase_code_lookup():
    company = get_company("wpp", load_watchlist(WATCHLIST))
    assert company["code"] == "WPP"
