"""Watchlist loading: the only entry point to config/watchlist.yaml."""

import yaml

REQUIRED_TOP_KEYS = ["dashboard", "classification", "companies"]
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


def load_watchlist(path: str = "config/watchlist.yaml") -> dict:
    """Return the parsed watchlist; raise ValueError if required keys are missing."""
    with open(path, encoding="utf-8") as f:
        watchlist = yaml.safe_load(f) or {}
    for key in REQUIRED_TOP_KEYS:
        if key not in watchlist:
            raise ValueError(f"{path}: missing required key '{key}'")
    seen = set()
    for i, company in enumerate(watchlist["companies"]):
        for key in REQUIRED_COMPANY_KEYS:
            if key not in company:
                label = company.get("code", f"companies[{i}]")
                raise ValueError(f"{path}: company {label} missing required key '{key}'")
        code = str(company["code"]).upper()
        if code in seen:
            raise ValueError(f"{path}: duplicate company code '{company['code']}'")
        seen.add(code)
    return watchlist


def get_company(code: str, watchlist: dict | None = None) -> dict:
    """Return one company entry by short code (e.g. 'PUB'); raise KeyError if unknown."""
    if watchlist is None:
        watchlist = load_watchlist()
    wanted = code.upper()
    for company in watchlist["companies"]:
        if str(company["code"]).upper() == wanted:
            return company
    raise KeyError(f"unknown company code: {code}")
