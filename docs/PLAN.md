# Build plan

Each step is under 90 minutes, has acceptance criteria you can check in under two minutes,
and ends with one commit that also ticks the box here. One step per Claude Code session.
The exact Claude Code prompts for each step live in `prompts/` (gitignored, local only);
this file is the contract and wins on any conflict. Verification commands per step follow
CLAUDE.md "Verify your own work": `make check` always, `make pipeline` and `make validate`
from step 06, `make serve` from step 07. The repo is public (needed for free Pages).

Legend: [ ] todo, [x] done. Add a one-line note under a step if reality differed.

## Day 1: something live

- [x] **01 Bootstrap.** `uv sync` works, `make check` is green with two smoke tests
  (watchlist shape, schemas are valid 2020-12), `pipeline/validate.py` exists and
  `make validate` passes on `data/` (docs/data files skipped until they exist).
  `.claude/settings.json` (shared allowlist; `settings.local.json` stays gitignored),
  `.python-version`, `config/`, `schemas/`, `data/`, `docs/*.md`, `uv.lock` are committed.
  Git identity uses the GitHub noreply email. `dashboard.user_agent` is already set in
  `config/watchlist.yaml` (project name and repo URL, no email).
  Acceptance: `make check` prints 0 ruff errors and 2 passed; `make validate` exits 0.
  Commit: `step 01: bootstrap repo, tooling and schemas`.

- [x] **02 Config loader and symbol check.** `core/config.py` with `load_watchlist` and
  `get_company`, `tests/test_config.py`. A local script `pipeline/check_symbols.py` calls
  yfinance once for all 6 tickers and 3 FX pairs and prints last close and date per symbol.
  Acceptance: all 9 symbols return a close dated within the last 5 trading days (note any
  that do not in docs/FAILURES.md). Commit: `step 02: config loader and symbol check`.

- [x] **03 Price history: backfill and append.** `pipeline/backfill.py` writes 2 years of
  daily closes for all 9 symbols into `docs/data/prices.json` (run locally once).
  `core/prices.py` implements `fetch_latest_closes`, `append_latest` (no stored
  forward-fill, stale_days), `get_price_history`, `get_fx`, and market cap in USD using shares from config
  (WPP pence to pounds). This is the one step where `docs/data/` is committed from a
  laptop (CLAUDE.md rule 4). Acceptance: `prices.json` validates against the schema, has ~500
  dates per equity, and running append twice in a row does not duplicate the last date.
  Commit: `step 03: price backfill, daily append and market cap`.
  Note: Havas did a 1:10 consolidation in Nov 2025 (shares now ~97.7m); WPP pence unit is
  config (`price_currency: GBX`); stale_days is always weekdays strictly between last date
  and today, so append is idempotent.

- [ ] **04 News collector.** `core/news.py` via Google News RSS with redirect decoding
  and title dedupe; fixture `tests/fixtures/news_pub.xml`; test. Acceptance: `get_news("PUB")`
  returns items; each has `url_decoded`, and the decoded share is reported honestly (Google
  changed its token format in 2024, so zero decoded is acceptable if logged in
  FAILURES.md); test passes offline.
  Commit: `step 04: Google News RSS collector`.
  Blocked: news.google.com robots.txt disallows the RSS path; collector parked, `core/util.py` landed.

- [x] **05 Press releases: framework, classifier, first two adapters.** `core/util.classify`,
  `core/press_releases.py` router, `core/adapters/wpp.py` and `core/adapters/omnicom.py`
  with fixtures and tests. Channel per adapter is chosen by the discovery order on the
  company's IR site: RSS/Atom, then static HTML, then a JSON endpoint the IR page itself
  loads; recorded in FAILURES.md. No third-party fallback.
  Acceptance: both adapters return at least 10 items from fixtures; classifier test covers
  one title per category; `press_releases.json` validates. Commit:
  `step 05: press release framework, classifier, WPP and Omnicom adapters`.
  Note: Omnicom is on Q4 IR RSS (investor.omc.com; exactly 10 items), WPP on static HTML with
  dates from the inline Next.js payload. No Google News fallback. Adapters raise on zero items.

- [x] **06 Pipeline, validation and the live workflow.** `pipeline/run.py` (tolerant
  orchestration, status.json, new_since_last_curate, companies.json, runs.jsonl),
  `pipeline/nudge.py`, core readers for events, guidance, kpis and status, a new
  `.github/workflows/daily.yml` with SHA-pinned actions and least-privilege permissions
  (show it before saving), `.github/dependabot.yml`, `docs/.nojekyll`.
  Ask the maintainer before pushing, then push, enable Pages from `main` `/docs`, and run
  the workflow manually. The first run may open a "Curate needed" Issue, because
  `last_curate_at` is null; that is expected.
  Acceptance: Actions run is green, `docs/data/status.json` is committed by the bot, Pages
  URL serves `/data/status.json`. Commit: `step 06: pipeline runner, validation, live workflow`.
  Account/secret note: none needed. GitHub Pages and Actions are free on public repos.
  Note: no news source (step 04 parked); press releases from WPP and OMC only, others
  skipped until step 08; bot commit message has no `[skip ci]` (it could skip Pages).

- [x] **07 Site v1.** `docs/index.html`, `app.js`, `style.css`: scan strip, base-100 chart
  with window selector and event markers (Plotly via CDN), guidance tracker (empty state),
  events (next 90 days), press releases (flagged first), health footer from status.json.
  Acceptance: `make serve` renders all six panels with real data locally; Pages URL shows
  the same after push; page loads on a phone without horizontal scroll.
  Commit: `step 07: dashboard v1 with six panels`.

## Day 2: curation loop and full coverage

- [ ] **08 Events calendar and remaining adapters.** Fill `data/events.yaml` from each
  company's published financial calendar (hand). Add `stagwell.py`, `publicis.py`,
  `havas.py`, `dentsu.py`, each with fixture and test; record any client-side-rendered site
  and the endpoint found in
  FAILURES.md. Acceptance: status.json shows 6 of 6 press release sources ok (each
  from the company's own IR site, channel visible in `source`); events panel shows the next
  results date for all six.
  Commits: `step 08a: events calendar, stagwell and publicis adapters`, then
  `step 08b: havas and dentsu adapters` (ticks the box).
  Note: events.yaml committed separately (545bbdf). On 2026-10-06 only PUB and HAVAS had
  published their next results date; the others fill in via step 08c as they announce.

- [ ] **08c Calendar watch.** `core/calendar.py` reads each company's own IR calendar
  (new `calendar` URL per company in the watchlist; static HTML for PUB, WPP, HAVAS, STGW,
  the IR page's JSON feed for OMC and DENTSU) plus results-scheduling press releases, every
  daily run. The pipeline writes `docs/data/event_candidates.json`: dates found that are not
  in `data/events.yaml`, including real dates that replace `confirmed: false` estimates.
  `pipeline/nudge.py` opens or updates a "Calendar review needed" Issue when candidates are
  new. A local `/events` command lists candidates, the maintainer accepts or rejects each,
  and it writes `data/events.yaml` and commits. Code never writes `data/` (rule 4); no bot
  PRs. A failing calendar parser is a failed source in status.json, never "ok, 0".
  Acceptance: fixtures and a parse test per calendar; a candidate missing from events.yaml
  raises the Issue in a manual workflow run; `/events` adds it after approval.
  Commit: `step 08c: calendar watch and review nudge`.

- [ ] **09 Quote verification and first /curate run.** `pipeline/verify_quote.py` (HTML and
  PDF, normalized substring match, exit codes) with tests, and `.claude/commands/curate.md`
  (the /curate command; supports `--all`). Commit those first. Then the maintainer runs
  `/curate --all` in a fresh session on the latest results releases, reviews, and /curate
  commits `data/`. Acceptance: `data/guidance.json` has at least one verified record per
  company that has given guidance; guidance panel renders them; `curate_state.json` has a
  timestamp. Commits: `step 09a: quote verifier and /curate command`, then the data commit
  made by /curate (`curate: ...`), then `step 09: first curation run` which ticks the box.

- [ ] **10 Nudge test and README skeleton.** Close any open "Curate needed" Issue, set
  `last_curate_at` to just before the newest flagged release, run the workflow manually,
  confirm a `curate` labelled Issue is created, restore state with `git revert`.
  Write README headings (Phase 4 fills them). Acceptance: one open Issue titled
  "Curate needed"; README renders. Commit: `step 10: curation nudge verified, README skeleton`.

## Day 3: MCP and fundamentals

- [ ] **11 MCP server.** `mcp_server/server.py` with FastMCP tools mirroring core, reading
  `docs/data` by default, `refresh(source)` for live. Register with
  `claude mcp add holdco -- uv run python -m mcp_server.server`. Verify shares outstanding
  for all six from latest results and flip `shares_verified`. Acceptance: in a fresh Claude
  Code session, "which holdcos cut guidance this year?" answers from the MCP tool with
  source links. Commit: `step 11: FastMCP server and verified share counts`.

- [ ] **12 KPI backfill and organic growth grid (v1.5).** Hand-enter 8 quarters per company
  into `data/kpis.yaml` with source links; add the grid panel. Acceptance: grid shows 6 x 8
  cells with no blanks except Havas pre-listing; definitions footnote renders.
  Commit: `step 12: KPI backfill and organic growth grid`.

- [ ] **12b Design pass.** Visual polish of `docs/style.css` (markup or class changes in
  `docs/index.html` and `docs/app.js` only where styling needs them): type scale and
  spacing, panel hierarchy, tile layout, status badge and chip colors, Plotly layout to
  match, empty states, phone layout. No framework, build step or new dependency; CSP
  unchanged (system fonts, or self-hosted fonts under `docs/`); the step 07 textContent,
  link and escaping rules still hold; company colors still come from `companies.json`.
  Acceptance: before/after screenshots at desktop and 390px width, zero console errors or
  CSP violations, `make check` green. Commit: `step 12b: design pass`.

- [ ] **13 Proof.** Instrumentation summary script, README sections (architecture diagram,
  demo GIF, failures and fixes, why the LLM step is local), 60-second demo recording.
  Acceptance: README numbers come from status.json and git log, not estimates.
  Commit: `step 13: README, demo and instrumentation`.

## Parked (v2)

- Deal tracker (`data/deals.yaml`, panel, /curate extension).
- News panel on the site (collector exists from step 04; data is in docs/data/news.json).
- EDGAR reported financials as enrichment.
- AI value chain watchlist (`config/ai-value-chain.yaml`).
- Alpha Vantage fallback (only if yfinance fails on the runner for several days).
