"""Smoke tests: the watchlist has the expected shape and every schema is valid 2020-12."""

import json
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent

REQUIRED_COMPANY_KEYS = [
    "code",
    "name",
    "ticker",
    "currency",
    "color",
    "shares_outstanding_m",
    "news_query",
    "press_releases",
    "results_title_patterns",
]


def test_watchlist_shape():
    watchlist = yaml.safe_load((ROOT / "config" / "watchlist.yaml").read_text())
    companies = watchlist["companies"]
    assert len(companies) == 6
    codes = [c["code"] for c in companies]
    assert len(set(codes)) == 6
    for company in companies:
        missing = [k for k in REQUIRED_COMPANY_KEYS if k not in company]
        assert not missing, f"{company.get('code')}: missing {missing}"
    user_agent = watchlist["dashboard"]["user_agent"]
    assert "github.com/carsonstubstad/holdco-intel" in user_agent
    assert "@" not in user_agent


def test_schemas_are_valid():
    paths = sorted((ROOT / "schemas").glob("*.json"))
    assert paths
    for path in paths:
        Draft202012Validator.check_schema(json.loads(path.read_text()))
