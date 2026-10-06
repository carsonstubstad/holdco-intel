# Holdco Intel architecture

Status: v1 scope. Last revised 2026-10-06.

## 1. What it is

A daily, zero-cost, deterministic pipeline that collects public data on six advertising
holding companies, a static dashboard that renders it, and an MCP server that exposes the
same data to Claude Code and Cowork. A local, human-reviewed Claude Code command
(`/curate`) turns flagged press releases into structured guidance records. The pipeline
never calls an LLM.

Watchlist (config/watchlist.yaml): Publicis (PUB.PA), Omnicom incl. IPG (OMC), WPP (WPP.L),
Havas (HAVAS.AS), Dentsu (4324.T), Stagwell (STGW).

## 2. Repo tree

    holdco-intel/
    ├── CLAUDE.md                     conventions and rules for Claude Code
    ├── README.md                     public-facing (Phase 4)
    ├── Makefile                      check, pipeline, validate, serve, backfill
    ├── pyproject.toml                uv-managed deps
    ├── .gitignore                    ignores .venv, caches, .claude/settings.local.json, prompts/
    ├── .python-version               3.12, so local and Actions use the same interpreter
    ├── .claude/
    │   ├── settings.json             shared permission allowlist (step 01)
    │   └── commands/curate.md        the /curate slash command (step 09)
    ├── .github/
    │   ├── workflows/daily.yml       cron pipeline, writes docs/data, commits, nudges (step 06)
    │   └── dependabot.yml            weekly updates for pinned action SHAs (step 06)
    ├── config/
    │   └── watchlist.yaml            the only place companies are defined
    ├── core/                         shared library (import core)
    │   ├── __init__.py
    │   ├── config.py                 load_watchlist()
    │   ├── util.py                   fetch(), now_iso(), classify()
    │   ├── prices.py                 get_price_history(), get_fx(), append_latest()
    │   ├── news.py                   get_news() (parked: news.google.com robots.txt disallows /rss)
    │   ├── press_releases.py         get_press_releases(), routes to adapters/
    │   ├── adapters/                 one file per company, same interface
    │   │   ├── __init__.py
    │   │   ├── wpp.py  omnicom.py  stagwell.py  publicis.py  havas.py  dentsu.py
    │   ├── events.py                 get_events()
    │   ├── guidance.py               get_guidance()
    │   ├── kpis.py                   get_kpis()
    │   └── status.py                 get_status(), record()
    ├── pipeline/
    │   ├── run.py                    orchestrates collectors, writes docs/data/*.json
    │   ├── backfill.py               one-time local price history backfill
    │   ├── check_symbols.py          local one-off: last close per ticker and FX pair (step 02)
    │   ├── validate.py               validates data/ and docs/data/ against schemas/ (step 01)
    │   ├── nudge.py                  prints the "Curate needed" Issue body, or nothing (step 06)
    │   └── verify_quote.py           deterministic quote-in-source check used by /curate
    ├── mcp_server/
    │   └── server.py                 FastMCP wrapper over core (NOT named mcp/: clashes with the mcp package)
    ├── data/                         hand-curated inputs, edited only by /curate or by hand
    │   ├── events.yaml
    │   ├── kpis.yaml
    │   ├── guidance.json
    │   └── curate_state.json
    ├── docs/                         GitHub Pages root (Pages serves / or /docs only)
    │   ├── index.html  app.js  style.css  .nojekyll
    │   ├── data/                     written only by the pipeline
    │   │   ├── prices.json  news.json  press_releases.json  events.json
    │   │   ├── guidance.json  kpis.json  status.json  companies.json
    │   │   └── runs.jsonl            one line per run, for step 13 stats (not schema-validated)
    │   ├── ARCHITECTURE.md  PLAN.md  FAILURES.md
    ├── schemas/                      JSON Schema for every file in docs/data and data/
    │   ├── prices.schema.json  news.schema.json  press_releases.schema.json
    │   ├── events.schema.json  guidance.schema.json  kpis.schema.json  status.schema.json
    │   ├── companies.schema.json     (step 06)
    └── tests/
        ├── fixtures/                 recorded HTML, RSS, CSV samples; no network in tests
        ├── test_config.py  test_prices.py  test_news.py  test_press_releases.py
        ├── test_adapters.py  test_events.py  test_guidance.py  test_schemas.py
        (minimum set; add test_<module>.py for any other core module that gains logic)

    prompts/ (local only, gitignored): one Claude Code prompt per PLAN.md step.

## 3. Data flow

    config/watchlist.yaml ──┐
    data/*.yaml, guidance.json ──┤
                                 ▼
    GitHub Actions (daily) ─► pipeline/run.py ─► core.* collectors ─► docs/data/*.json ─► commit
                                                      │                                      │
                                                      └─► status.json (per-source health)    ▼
                                                                                   GitHub Pages renders docs/
    new flagged press releases ─► GitHub Issue "curate needed" ─► you run /curate in Claude Code
                                                                     │
                                                                     ├─ fetch source, draft guidance records
                                                                     ├─ pipeline/verify_quote.py must pass
                                                                     ├─ write data/guidance.json, kpis.yaml, events.yaml
                                                                     └─ write data/curate_state.json, commit
    Claude Code / Cowork ─► mcp_server/server.py ─► core.* (reads docs/data by default, live on request)

Write boundaries: Actions commits docs/data/ (the step 03 backfill of prices.json is the one
laptop commit). data/ is written by /curate or by hand, never by code. The pipeline
copies data/ into docs/data/ (YAML to JSON) so the site has one read location. Full rule
in CLAUDE.md, hard rule 4.

## 4. Core library: signatures and contracts

All functions are pure with respect to the repo: they read config and data files, they may
fetch the network, they return plain dicts or lists validating against schemas/. None of
them write files; `pipeline/run.py` (and `pipeline/backfill.py`) do all writing.
`append_latest` returns a new dict and `status.record` mutates the dict it is given.

Read locations: prices, FX and status read committed `docs/data/` (history only exists
there). Events, guidance and KPIs read their source of truth in `data/`. News and press
releases fetch live; their committed copies are in `docs/data/`.

```python
# core/config.py
def load_watchlist(path: str = "config/watchlist.yaml") -> dict:
    """Return the parsed watchlist; raise ValueError if required keys are missing."""

def get_company(code: str, watchlist: dict | None = None) -> dict:
    """Return one company entry by short code (e.g. 'PUB'); raise KeyError if unknown."""

# core/util.py
def fetch(url: str, *, timeout: int = 20, retries: int = 1, headers: dict | None = None) -> requests.Response:
    """GET with a descriptive User-Agent, one retry on 5xx/timeout; raise on final failure."""

def now_iso() -> str:
    """Current UTC time as ISO 8601 with 'Z'."""

def classify(title: str, company: dict) -> tuple[str, bool]:
    """Return (category, flagged) for a press release title using global and per-company patterns."""

# core/prices.py
def get_price_history(code: str, start: str | None = None, end: str | None = None) -> dict:
    """Return the committed daily close series for one company from docs/data/prices.json, sliced by date."""

def fetch_latest_closes(codes: list[str], fx_pairs: list[str]) -> dict:
    """One batched yfinance call (period 5d); return {symbol: [{date, close}, ...]} for completed sessions, never raise."""

def append_latest(prices: dict, latest: dict, today: str) -> dict:
    """Append every close dated after a series' last date; never fabricate a value; set stale_days
    (weekdays since the last close, minus one); recompute market cap; return a new prices dict.
    Gaps are not filled in storage; the site forward-fills when aligning dates for the chart."""

def get_fx(pair: str) -> dict:
    """Return the committed daily series for an FX pair keyed by its yfinance symbol
    (EURUSD=X, GBPUSD=X, JPY=X; JPY=X is USD/JPY, i.e. yen per dollar)."""

# core/news.py
def get_news(code: str, days: int = 30) -> list[dict]:
    """Return Google News RSS items for the company query, redirect URLs decoded, deduped by title."""

# core/press_releases.py
def get_press_releases(code: str, since: str | None = None) -> list[dict]:
    """Route to the company's adapter; return classified items newer than `since`, newest first."""

# core/adapters/<company>.py   (identical interface in every adapter)
def fetch_items(company: dict) -> list[dict]:
    """Return raw items {title, url, published, summary, channel} from the company's IR source;
    raise on failure, including when zero items parse (a format change must not look like ok)."""

def parse_fixture(html_or_xml: str, company: dict) -> list[dict]:
    """Pure parser used by fetch_items and by tests; same return shape."""

# core/events.py
def get_events(code: str | None = None, past_days: int = 365, future_days: int = 180) -> list[dict]:
    """Return events from data/events.yaml within the window, optionally for one company, sorted by date."""

# core/guidance.py
def get_guidance(code: str | None = None, current_only: bool = True) -> list[dict]:
    """Return guidance records from data/guidance.json; current_only drops superseded records."""

# core/kpis.py
def get_kpis(code: str | None = None, quarters: int = 8) -> list[dict]:
    """Return the last N quarterly KPI rows per company from data/kpis.yaml."""

# core/status.py
def record(status: dict, source: str, *, ok: bool, items: int, ms: int, error: str | None = None) -> None:
    """Mutate the status dict with one source's result."""

def get_status() -> dict:
    """Return docs/data/status.json."""
```

Pipeline entry point: `python -m pipeline.run` runs every collector in order (prices,
news, press_releases, events, guidance, kpis), tolerates failures, computes
`new_since_last_curate`, writes docs/data/*.json and docs/data/status.json, exits 0.
The MCP server's default reads are the same committed files, so they are deterministic and
need no network.

## 5. Config schema: config/watchlist.yaml

```yaml
dashboard:
  name: string            # shown in the page title
  base_currency: USD      # for market cap only
  fx_pairs: [EURUSD=X, GBPUSD=X, JPY=X]   # yfinance symbols, used as keys everywhere
  user_agent: "holdco-intel/0.1 (+https://github.com/carsonstubstad/holdco-intel)"
                          # sent by fetch(); no email
classification:          # global title patterns; see config/watchlist.yaml for the full list
  flagged_categories: [results, guidance, m_and_a, capital_markets]
  categories: {results: [regex, ...], guidance: [...], ...}   # first match wins, in order
  default_category: other
companies:
  - code: PUB             # short, uppercase, unique; used as key everywhere
    name: Publicis Groupe
    ticker: PUB.PA        # yfinance symbol
    exchange: Euronext Paris
    currency: EUR
    color: "#1f77b4"      # chart line colour
    shares_outstanding_m: 254.0        # millions, approximate
    shares_verified: false             # flip to true after checking at results
    news_query: '"Publicis Groupe"'    # Google News query
    press_releases:
      adapter: publicis                # module name in core/adapters/
      url: https://...                 # IR index or feed URL the adapter starts from
    results_title_patterns:            # regex, case-insensitive, per company
      - "revenue"
      - "results"
    fiscal_year_end: 12-31
```

## 6. Output schemas

Formal JSON Schema lives in `schemas/`. Summary of each file:

- prices.json: `{as_of, base_currency, series: {SYMBOL: {currency, dates[], closes[], stale_days}}, market_cap_usd_m: {CODE: number|null}}`
- news.json: `{as_of, items: [{company, title, url, publisher, published, source, fetched_at}]}`
- press_releases.json: `{as_of, last_curate_at, items: [{id, company, title, url, published, category, flagged, source, fetched_at}], new_since_last_curate: [id]}`
- events.json: `{as_of, items: [{company, date, type, title, confirmed, source_url}]}`
- guidance.json: `{as_of, records: [{id, company, metric, period, value, unit, status, set_date, quote, source_url, supersedes, curated_at}]}`
- kpis.json: `{as_of, definitions: {CODE: text}, rows: [{company, period, organic_growth_pct, revenue_local_m, currency, margin_metric, margin_pct, source_url, note}]}`
- status.json: `{run_at, runtime_ms, run_id, sources: {name: {ok, items, ms, error, last_ok}}, guidance_age_days, counts: {companies, sources_total, sources_ok, press_releases, flagged_new, news, events_upcoming}}`

- companies.json: `{as_of, companies: [{code, name, ticker, exchange, currency, color}]}` (display subset of the watchlist)
- runs.jsonl: one JSON object per line `{run_at, runtime_ms, sources_ok, sources_total, flagged_new}`

If this summary and a file in `schemas/` disagree, the schema wins.

Workflow: `daily.yml` runs at 22:30 UTC every day (after the US close in both EST and EDT,
so every exchange has a completed session) and on manual dispatch. Nothing else triggers it.

The "new since last run" contract: `data/curate_state.json` holds `last_curate_at`.
The pipeline sets `press_releases.json.new_since_last_curate` to the ids of flagged items
with `published > last_curate_at`. When `last_curate_at` is null (never curated), flagged
items published in the last 30 days count as new. `/curate` consumes that list and then writes a new
`last_curate_at`. The GitHub Issue nudge fires only when the list is non-empty, and
updates the open "Curate needed" Issue rather than opening a second one.

## 7. Site (docs/)

One page, six panels in v1: scan strip, relative performance chart (base 100, window
selector, event markers), guidance tracker, events (next 90 days), press releases (flagged
first), data health footer. v1.5 (step 12) adds the organic growth grid. v2 adds the news
panel (the collector already runs from step 04) and the deal tracker. Chart library: Plotly via CDN (range selector and hover come free). No build step.
Base-100 rebasing happens client-side per selected window. All returns are local currency;
the chart footnote says so. Market cap is USD and labelled approximate.

## 8. MCP server (mcp_server/)

FastMCP app exposing tools with the same names and arguments as the core functions:
`get_price_history, get_news, get_press_releases, get_events, get_guidance, get_kpis,
get_status`, plus `refresh(source)` which calls the live collector. Default reads are from
committed files (docs/data, and data/ for events, guidance and KPIs) so demos are
deterministic. Registered in Claude Code with
`claude mcp add holdco -- uv run python -m mcp_server.server`.

## 9. Decisions and rationale (short)

- Prices: history committed once from a laptop (pipeline/backfill.py); Actions appends one
  day via a single batched yfinance call; forward-fill and stale flags on misses. Stooq was
  dropped (access denied, robots disallow). Alpha Vantage free key is the named fallback,
  added only if yfinance fails on the runner for several days.
- No EDGAR in v1: organic growth is non-GAAP and absent from XBRL for all six.
- Sources: yfinance and company IR sites only, for all six companies. Press releases come
  from each company's own IR site (RSS/Atom, JSON endpoint or static HTML); there is no
  Google News fallback because news.google.com robots.txt disallows the RSS path.
  EDGAR and LSE RNS were dropped to keep pulls uniform and avoid a public contact email.
- Guidance is structured and quote-verified by a script, not freeform bullets.
- Six panels in v1 to keep curation to one file (guidance.json) plus events.
- Pages serves /docs because deploy-from-branch supports only root or /docs.
- The repo is public: free GitHub Pages requires it, and the dashboard is public anyway.
- `mcp_server/` not `mcp/` to avoid shadowing the `mcp` package.

## 10. Known risks

IR sites that render client-side (Havas, Dentsu, possibly Publicis) may need an RSS/JSON
endpoint hunt (no third-party fallback); Omnicom and Stagwell IR may need it too. Yahoo is unofficial.
Shares outstanding drift with buybacks. Omnicom organic growth is not comparable across
the IPG close. Record every surprise in docs/FAILURES.md.
