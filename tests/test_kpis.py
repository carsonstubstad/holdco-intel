"""Tests for core.kpis: empty files, period ordering, last-N per company, definitions."""

from core.kpis import get_kpi_definitions, get_kpis


def test_missing_and_empty_file_return_empty(tmp_path):
    assert get_kpis(path=tmp_path / "nope.yaml") == []
    assert get_kpi_definitions(path=tmp_path / "nope.yaml") == {}
    (tmp_path / "kpis.yaml").write_text("")
    assert get_kpis(path=tmp_path / "kpis.yaml") == []


def test_last_n_rows_per_company_in_period_order(tmp_path):
    path = tmp_path / "kpis.yaml"
    path.write_text(
        "definitions:\n  PUB: organic net revenue growth\n"
        "rows:\n"
        "  - {company: PUB, period: FY 2025, source_url: 'https://x'}\n"
        "  - {company: PUB, period: Q1 2026, source_url: 'https://x'}\n"
        "  - {company: PUB, period: Q3 2025, source_url: 'https://x'}\n"
        "  - {company: PUB, period: H1 2026, source_url: 'https://x'}\n"
        "  - {company: WPP, period: Q2 2026, source_url: 'https://x'}\n"
    )
    pub = get_kpis("PUB", quarters=3, path=path)
    assert [r["period"] for r in pub] == ["FY 2025", "Q1 2026", "H1 2026"]
    assert len(get_kpis(path=path)) == 5
    assert get_kpi_definitions(path=path) == {"PUB": "organic net revenue growth"}
