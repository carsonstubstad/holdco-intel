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

- [x] **08 Events calendar and remaining adapters.** Fill `data/events.yaml` from each
  company's published financial calendar (hand). Add `stagwell.py`, `publicis.py`,
  `havas.py`, `dentsu.py`, each with fixture and test; record any client-side-rendered site
  and the endpoint found in FAILURES.md. Revisit Omnicom (403 from Actions on the RSS feed).
  Acceptance: after a manual workflow run, status.json shows press_releases ok for every
  company with a reachable IR channel (each from the company's own IR site, channel visible
  in `source`) and a loud failure plus FAILURES.md row for any without; events.json carries
  the committed calendar.
  Commits: `step 08a: stagwell and publicis adapters`, then
  `step 08b: havas, dentsu and omnicom adapters` (ticks the box).
  Note: events.yaml committed separately (545bbdf). On 2026-10-06 only PUB and HAVAS had
  published their next results date; the others fill in via step 08c as they announce.
  Note: STGW, HAVAS and DENTSU are on their own RSS (shared `_rss` parser, publisher-local
  dates), PUB on static HTML, OMC moved to the Q4 JSON feed (same host; Actions unverified).

- [x] **08c Calendar watch.** `core/calendar.py` reads each company's own IR calendar
  (new `calendar` URL per company in the watchlist; static HTML for PUB, WPP, HAVAS, STGW,
  the IR page's JSON feed for OMC and DENTSU) plus results-scheduling press releases, every
  daily run. The pipeline writes `docs/data/event_candidates.json`: dates found that are not
  in `data/events.yaml` (each with a stable `id`, company, date, type, title, source_url),
  including real dates that replace `confirmed: false` estimates. `pipeline/nudge.py` opens
  or updates a "Calendar review needed" Issue when candidates are new, linking to the site.
  Until 08d, the maintainer copies approved candidates into events.yaml by hand. A failing
  calendar parser is a failed source in status.json, never "ok, 0".
  Acceptance: fixtures and a parse test per calendar; a candidate missing from events.yaml
  appears in event_candidates.json and raises the Issue in a manual workflow run.
  Commit: `step 08c: calendar watch and review nudge`.
  Note: DENTSU's E-IR feed (ssl4.eir-parts.net) is robots-disallowed; do not use it. Use
  group.dentsu.com pages or the press release RSS instead (see FAILURES.md).
  Note: calendars for PUB, WPP, HAVAS, STGW (static HTML) and OMC (Q4 GetEventList JSON);
  DENTSU has none (E-IR widget only), its dates come from press releases and by hand.
  Issue verified 2026-10-08: a test date opened #2, the revert closed it.

- [ ] **08d Approve events from the dashboard.** The events panel lists pending candidates
  with an Approve and a Reject button. Each button is a plain link to a pre-filled GitHub
  "new issue" page (title `approve-event: <id>` or `reject-event: <id>`); no token or
  secret in the site. A new workflow `.github/workflows/approve-event.yml` (on
  `issues: opened`, show the diff first) acts only when the issue author is the repo owner,
  reads the id from the title via env (regex-validated, never `${{ }}` in `run:`), looks it
  up in the committed `event_candidates.json` (issue text is never copied into data),
  appends the event to `data/events.yaml` or records the rejection so it is not raised
  again, commits, and closes the issue. Permissions: `contents: write`, `issues: write`.
  Amends CLAUDE.md hard rule 4 to allow this one workflow to write `data/events.yaml`
  (maintainer approval by authenticated issue). Acceptance: approving a test candidate
  from the live site adds it to events.yaml and the events panel within one Pages deploy;
  an issue opened by another account is ignored. Commit: `step 08d: approve events from
  the dashboard`.
  Note (2026-10-08): deferred; not built yet.

- [x] **09 Quote verification and first /curate run.** `pipeline/verify_quote.py` (HTML and
  PDF, normalized substring match, exit codes) with tests, and `.claude/commands/curate.md`
  (the /curate command; supports `--all`). Commit those first. Then the maintainer runs
  `/curate --all` in a fresh session on the latest results releases, reviews, and /curate
  commits `data/`. Acceptance: `data/guidance.json` has at least one verified record per
  company that has given guidance; guidance panel renders them; `curate_state.json` has a
  timestamp. Commits: `step 09a: quote verifier and /curate command`, then the data commit
  made by /curate (`curate: ...`), then `step 09: first curation run` which ticks the box.
  Note (2026-10-08): Dentsu has no guidance records; its 2026-08-14 results notice is a
  pointer page with no same-domain PDF, so /curate had nothing to read (see FAILURES.md;
  hand entry or a later /curate run). Omnicom's Q2 release has no forward guidance (KPI row only).

- [x] **10 Nudge test and README skeleton.** Close any open "Curate needed" Issue, set
  `last_curate_at` to just before the newest flagged release, run the workflow manually,
  confirm a `curate` labelled Issue is created, restore state with `git revert`.
  Write README headings (Phase 4 fills them). Acceptance: one open Issue titled
  "Curate needed"; README renders. Commit: `step 10: curation nudge verified, README skeleton`.
  Note (2026-10-08): nudge test opened Issue #3 (run 37839110330); state restored by revert.

## Day 3: MCP and fundamentals

- [x] **11 MCP server.** `mcp_server/server.py` with FastMCP tools mirroring core, reading
  `docs/data` by default, `refresh(source)` for live. Register with
  `claude mcp add holdco -- uv run python -m mcp_server.server`. Verify shares outstanding
  for all six from latest results and flip `shares_verified`. Acceptance: in a fresh Claude
  Code session, "which holdcos cut guidance this year?" answers from the MCP tool with
  source links. Commit: `step 11: FastMCP server and verified share counts`.
  Note (2026-10-08): mcp 2.x renamed FastMCP to `MCPServer` (`mcp.server.mcpserver`); 8 tools,
  no get_news (step 04 parked); refresh accepts only `prices` and `press_releases:<CODE>`.
  Register with `uv run --directory "<repo>" python -m mcp_server.server`. Shares verified for
  PUB, OMC (diluted averages), WPP, HAVAS (outstanding). NOT FOUND: DENTSU (2026-08-14 notice
  is a pointer page with no same-domain PDF), STGW (Q2 release states no share figure and
  links no results PDF); both stay `shares_verified: false`.

- [x] **12 KPI backfill and organic growth grid (v1.5).** Hand-enter 8 quarters per company
  into `data/kpis.yaml` with source links; add the grid panel. Acceptance: grid shows 6 x 8
  cells with no blanks except Havas pre-listing; definitions footnote renders.
  Commit: `step 12: KPI backfill and organic growth grid`.
  Note (2026-10-08): the grid has expected blanks, each documented in docs/FAILURES.md:
  DENTSU half-year only (no quarterly figures on its own domain), STGW organic not stated
  Q1 2025 to Q1 2026, OMC Q4 2025 organic not stated; Havas Q3 2024 is pre-listing.
  kpis.json now carries every row (`get_kpis(quarters=None)`); the 8-row cap counted H1/FY
  rows and dropped quarters. The MCP `get_kpis` quarters cap still counts H1/FY rows
  (follow-up, not this step).

## Day 4: benchmark, design and share

- [x] **12b S&P 500 benchmark.** `dashboard.benchmark` in `config/watchlist.yaml`
  (`symbol: "^GSPC"`, `name: S&P 500`, `currency: USD`); the index, not SPY, because readers
  expect the index level and every line on the chart is price-only. Not a company: it never
  appears in `companies` in companies.json, the scan strip, KPIs, press releases or market
  cap. `companies.json` gains an optional top-level `benchmark` object (`symbol`, `name`)
  and the schema says so. `core/prices.py`: `build_prices` sets its currency;
  `fetch_latest_closes` includes it (so the daily run and MCP `refresh("prices")` append it);
  `get_benchmark_history`. `pipeline/backfill.py --only <symbol>` merges one new series into
  the existing prices.json and leaves every other series byte-identical; run once from the
  laptop (CLAUDE.md rule 4 exception). MCP `get_price_history` accepts code `BENCHMARK`.
  Chart: one grey dashed trace named from companies.json, in the legend, toggled by legend
  click, hover "S&P 500: 104.2", plus a footnote: lines are rebased to 100 in their own
  trading currency, price only; the S&P 500 is a rough US-dollar reference for the
  non-US stocks. Tests with a fixture, no network.
  Acceptance: `make check` and `make validate` green; prices.json has a `^GSPC` series of
  about 500 dates and `git diff docs/data/prices.json` adds only that series; companies.json
  still lists six companies plus `benchmark`; under `make serve` the chart shows the dashed
  S&P 500 line, a legend click hides it, the scan strip shows six tiles, the footnote
  renders. Commit: `step 12b: S&P 500 benchmark on the chart`.

- [x] **12c Design brief.** A read-only project subagent `.claude/agents/design-reviewer.md`
  reviews hand-taken screenshots (desktop 1440px, phone 390px, chart hover) and `docs/`
  source, and returns a design brief: visual hierarchy, type scale, spacing, neutrals,
  chart styling (including the benchmark), empty states, phone layout, interactivity
  (hover, toggles, window selector, panel linking, keyboard, accessibility). The maintainer
  approves it; it is committed as `docs/DESIGN.md`. Constraints for every design step: no
  framework, build step or new dependency; CSP unchanged (system fonts or self-hosted under
  `docs/`); textContent, http(s)-only links and Plotly hover escaping still hold; company
  colors come from `companies.json`. Acceptance: `/agents` lists design-reviewer;
  `docs/DESIGN.md` has Must/Should/Could tiers, a token table and a 12d/12e split; no
  change to `docs/*.html|js|css`. Commit: `step 12c: design reviewer agent and approved brief`.

- [ ] **12d Layout and type.** Build the DESIGN.md items assigned to 12d: tokens, type
  scale, spacing, panel hierarchy, tiles, badges and chips, empty states, phone layout.
  Mostly `docs/style.css`; markup changes only where the brief needs them.
  Acceptance: before/after screenshots at 1440px and 390px; no horizontal scroll at 390px;
  zero console errors or CSP violations; `make check` green.
  Commit: `step 12d: layout, type and phone pass`.

- [ ] **12e Chart and interactivity.** Build the DESIGN.md items assigned to 12e: Plotly
  layout matching the tokens, benchmark styling, a keyboard-operable benchmark toggle,
  window selector states, the panel linking the brief specifies, focus styles, reduced
  motion. Acceptance: every control works with Tab, Enter and Space and shows a focus
  ring; each linking behavior works and Esc resets it; zero console errors or CSP
  violations; `make check` green. Commit: `step 12e: chart styling and interactivity`.

- [ ] **13 Ready to share.** `pipeline/stats.py` (computed numbers from runs.jsonl,
  status.json history and git log, "n/a" rather than estimates). README rewritten around
  the live Pages link: what it is, who it is for, the numbers, architecture (Mermaid),
  data sources and limits, why the LLM step is local, failures and fixes, run it yourself,
  disclaimer. Site: a one-line "what am I looking at" intro and a data-freshness note
  (prices as of, curated as of, from status.json), meta description and Open Graph
  title/description, inline SVG favicon. No GIF, no recording.
  Acceptance: `uv run python -m pipeline.stats` prints real numbers; README's first screen
  has the link, the one-line description and the disclaimer; the live Pages URL works on a
  real phone without horizontal scroll and on desktop with zero console errors.
  Commit: `step 13: ready to share`.

## Day 5: management commentary (MCP)

- [ ] **14a Commentary data path and MCP tool.** `schemas/commentary.schema.json`
  (records: verbatim quote of at most 400 characters, theme from performance, strategy,
  ai_and_data, clients_and_new_business, outlook or capital_allocation, speaker only when
  attributed, release_date, period, source_url, verified true; headlines: one curator
  sentence per company and release, `headline_by: curator`). `core/commentary.py`
  `get_commentary(code, theme, latest_only)` (missing file means empty lists), a pipeline
  copy to `docs/data/commentary.json` (source "commentary" in status.json), validate.py
  coverage, MCP tool `get_commentary` with a note that quotes are management's words and
  headlines are paraphrase. No LLM in this code: the calling Claude summarizes. Tests
  with a fixture. The site does not read it yet.
  Acceptance: `make check` and `make validate` green; the fixture shows latest_only and
  theme filtering; in a fresh session the MCP tool returns empty lists plus the note (no
  error) before 14b. Commit: `step 14a: commentary data path and get_commentary MCP tool`.

- [ ] **14b /curate commentary and first run.** `.claude/commands/curate.md` gains a
  "Management commentary" section and a `--commentary` flag: 3 to 6 verbatim quotes per
  results release (at most 50 words each), each verified with verify_quote (NOT FOUND
  means dropped, never reworded), plus an optional neutral headline backed by those
  quotes. Then `/curate --all --commentary` in a fresh session.
  Acceptance: `data/commentary.json` validates and has records for every company with
  readable same-domain results text, plus a FAILURES.md row for any company without; a
  fresh session's "summarize each holdco's latest strategy commentary" answer cites only
  source_urls from the file.
  Commits: `step 14b: /curate drafts management commentary`, the `curate: ...` data
  commit, then `step 14b: first commentary run` (ticks the box, as in step 09).

## Parked (v2)

- Deal tracker (`data/deals.yaml`, panel, /curate extension).
- News panel on the site (collector exists from step 04; data is in docs/data/news.json).
- EDGAR reported financials as enrichment.
- AI value chain watchlist (`config/ai-value-chain.yaml`).
- Alpha Vantage fallback (only if yfinance fails on the runner for several days).

## Backlog (unsorted ideas)

One dated line per idea. The planning chat sorts each into a tweak, an existing step, a
new step, Parked (v2), or no (breaks a hard rule), then moves the line.

- 2026-10-08: "Management says" panel on the site from docs/data/commentary.json
  (after 14b; small step: one panel, textContent only).
  2026-10-09: proposed as its own step 14c after 14b: per company, the curator headline
  plus 2 to 3 verbatim quotes grouped by theme (strategy, ai_and_data, outlook first),
  each linked to its source_url; empty state when commentary.json is missing. Strategy
  themes are the main reason executives use this page over a quote site.
- 2026-10-09: "What changed" strip at the top of the site, for strategy executives who
  want what is new since they last looked: guidance records whose set_date is in the last
  30 days (raised, cut, new, held), and results dates in the next 14 days, one line each,
  newest first, linked to source_url. Built deterministically from guidance.json and
  events.json; no new data, no LLM. Proposed as step 12f (after 12e, before 13), with the
  design-reviewer's placement from docs/DESIGN.md.
