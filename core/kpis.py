"""Hand-curated quarterly KPIs from data/kpis.yaml."""

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
KPIS_PATH = ROOT / "data" / "kpis.yaml"

# Position of a period within its year: a half ends with its second quarter, FY with Q4.
PERIOD_ORDER = {"Q1": 1, "Q2": 2, "H1": 2.5, "Q3": 3, "Q4": 4, "H2": 4.5, "FY": 5}


def _load(path: Path | str) -> dict:
    path = Path(path)
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def _period_key(period: str) -> tuple[int, float]:
    match = re.match(r"^(Q[1-4]|H[12]|FY) ?(\d{4})$", period)
    if not match:
        return (0, 0)
    return (int(match.group(2)), PERIOD_ORDER[match.group(1)])


def get_kpis(
    code: str | None = None, quarters: int = 8, *, path: Path | str = KPIS_PATH
) -> list[dict]:
    """Return the last N quarterly KPI rows per company from data/kpis.yaml."""
    rows = _load(path).get("rows") or []
    if code:
        rows = [r for r in rows if str(r["company"]).upper() == code.upper()]
    by_company: dict[str, list[dict]] = {}
    for row in sorted(rows, key=lambda r: _period_key(str(r["period"]))):
        by_company.setdefault(row["company"], []).append(row)
    return [row for company_rows in by_company.values() for row in company_rows[-quarters:]]


def get_kpi_definitions(*, path: Path | str = KPIS_PATH) -> dict:
    """Return {CODE: definition text} from data/kpis.yaml, {} if absent."""
    return _load(path).get("definitions") or {}
