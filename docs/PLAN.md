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
  The maintainer copies approved candidates into events.yaml by hand (08d, which would
  have automated this, was dropped). A failing
  calendar parser is a failed source in status.json, never "ok, 0".
  Acceptance: fixtures and a parse test per calendar; a candidate missing from events.yaml
  appears in event_candidates.json and raises the Issue in a manual workflow run.
  Commit: `step 08c: calendar watch and review nudge`.
  Note: DENTSU's E-IR feed (ssl4.eir-parts.net) is robots-disallowed; do not use it. Use
  group.dentsu.com pages or the press release RSS instead (see FAILURES.md).
  Note: calendars for PUB, WPP, HAVAS, STGW (static HTML) and OMC (Q4 GetEventList JSON);
  DENTSU has none (E-IR widget only), its dates come from press releases and by hand.
  Issue verified 2026-10-08: a test date opened #2, the revert closed it.

- **08d Approve events from the dashboard.** Dropped 2026-10-15 (v2.0 plan): a new
  workflow and a hard-rule amendment for a few approvals a quarter, and v2.0 removes the
  Events panel it would have lived in. Calendar candidates stay a hand copy into
  `data/events.yaml` from the "Calendar review needed" Issue.

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

## Day 4: benchmark and design

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

- [x] **12d Layout and type.** Build the DESIGN.md items assigned to 12d: tokens, type
  scale, spacing, panel hierarchy, tiles, badges and chips, empty states, phone layout.
  Mostly `docs/style.css`; markup changes only where the brief needs them.
  Acceptance: before/after screenshots at 1440px and 390px; no horizontal scroll at 390px;
  zero console errors or CSP violations; `make check` green.
  Commit: `step 12d: layout, type and phone pass`.
  Note (2026-10-11): after review, the maintainer moved the chart back above organic
  growth at 300px tall (DESIGN.md M1 revised; built as a tweak before 12e). The 12d
  guidance list is replaced by the 12f matrix.

- [x] **12e Chart and interactivity.** Build the DESIGN.md items assigned to 12e: Plotly
  layout matching the tokens, benchmark styling, a keyboard-operable benchmark toggle,
  window selector states, the panel linking the brief specifies, focus styles, reduced
  motion, the print layout (M6), and refinements R1 to R6 (legend click, end label spacing,
  focused tile and line, focused events, one Esc handler). Acceptance: every control works
  with Tab, Enter and Space and shows a focus ring; each linking behavior works and Esc
  resets it; no two end labels overlap at 1440px or 375px; print preview shows no split
  panels; zero console errors or CSP violations; `make check` green.
  Commit: `step 12e: chart styling and interactivity`.
  Note (2026-10-12): Plotly wraps the horizontal legend at the plot-area width, so at 375px
  the phone legend takes 4 rows of company codes. The maintainer chose a 420px chart at 720px
  and below (was 340px) to keep the plot at least 220px (DESIGN.md M1 and M7 revised).

- [x] **12f Guidance matrix and company filter.** Build DESIGN.md G1 to G6 in
  `renderGuidance` and `docs/style.css`: a summary line counted from current records, a
  one-row-per-company matrix (Organic growth | Margin | More) in companies.json order, a
  "+n more" detail row with every record's quote and source link, company filter chips
  that share 12e's focused-company state (a tile click filters guidance, Esc clears both),
  and the phone and print layouts. Site only: no data, schema or pipeline change, no LLM.
  Text goes in via textContent and links via `link()`.
  Acceptance: at 1440px with details closed, the guidance panel shows all six companies
  and is no taller than 480px; the summary line's counts match `docs/data/guidance.json`
  (hand count); every record is reachable with its source link; chips and More buttons
  work with Tab, Enter and Space, and Esc clears the filter; at 375px there is no sideways
  scroll; with guidance.json hidden the panel shows its empty sentence; zero console
  errors or CSP violations; `make check` green.
  Fold-in (2026-10-11, from the Backlog): a company link. On load, a URL hash matching a
  code in companies.json (e.g. `#PUB`) calls the focus setter; the setter keeps the hash
  in sync (`history.replaceState`, cleared with the focus). Any other hash is ignored.
  Acceptance: opening `/#PUB` loads with Publicis focused and guidance filtered; Esc
  clears the hash; `#xyz` changes nothing.
  Commit: `step 12f: guidance matrix and company filter`.
  Note (2026-10-12): two tweaks followed: `tweak: press show-all, health details, event
  merge` (DESIGN.md C1, S2, P1) and `tweak: company filter for press releases` (its own
  chip row, separate from the focused company; Esc resets it).

- [x] **12g What changed.** Site only (`docs/index.html`, `app.js`, `style.css`): no data,
  schema or pipeline change, no LLM; everything is computed in the browser from files the
  site already loads, text via textContent and links via `link()`.
  (1) A "What changed" strip in a new full-width section under the header, above the
  tiles (DESIGN.md section 6 placement): "Coming up", results events in the next 14 days,
  soonest first ("Reports today" on the day); then "Recent guidance", records whose
  `set_date` is in the last 30 days, newest first, each as status badge, company, metric,
  period, value and date, linked to its `source_url`. At most 6 lines, then a link to the
  guidance panel. It never repeats the guidance summary line's counts. When both lists
  are empty, one muted sentence.
  (2) A "Δ q/q" column in the organic growth grid, right after the company name: each
  company's newest quarter minus the quarter directly before (maintainer's decision at
  the plan gate, so one early reporter doesn't blank the other rows), in percentage
  points, with ▲/▼ and a sign (never color alone), the quarters named in the cell's
  title; "–" unless both quarters exist (covers Dentsu half-years, OMC Q4 2025, STGW
  gaps).
  Fold-ins (2026-10-12, from the Backlog): (3) results day: on a company's results date
  the tile's event line reads "Reports today" with a visible badge. (4) Chart headline:
  one computed line above the chart for the selected window, e.g. "YTD: Stagwell leads
  +76.9%, Omnicom trails −5.3% · S&P 500 +12.0%", from the same rebased series the chart
  draws (companies only for lead and trail), updated on window change. (5) Chart
  footnote: the static "S&P 500" in the footnote under the chart is filled from
  companies.json's benchmark name, like the headline (moved from step 13).
  Acceptance: with today's data the strip lists PUB and HAVAS results with correct day
  counts and shows the guidance group or its absence correctly (hand-check against
  events.json and guidance.json); setting the browser date to a results day shows
  "Reports today" in the tile and the strip; the Δ column matches a hand calculation for
  three companies and shows "–" for DENTSU; the YTD headline's lead and trail match the
  chart's last values; switching window updates it; the footnote and headline name the
  same benchmark (static text only as a fallback when companies.json lacks it); no
  sideways scroll at 375px; every
  new link and control works with Tab and Enter; zero console errors or CSP violations;
  `make check` green. Commit: `step 12g: what changed, growth delta, chart headline`.

## Day 5: management commentary (MCP)

- [x] **14a Commentary data path and MCP tool.** `schemas/commentary.schema.json`
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

- [x] **14b /curate commentary and first run.** `.claude/commands/curate.md` gains a
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

## v2.0: scorecards, strategy quotes, share

Planned 2026-10-15 (maintainer-approved in the planning chat), reviewed and renumbered
the same day. The page becomes three main panels, in this order: compare chips with one
scorecard per company, "In their words" (verbatim management quotes by theme), then the
share price chart. What changed, Press releases and Data health stay. Commentary gains
sources beyond results releases. Step prompts are in `prompts/v2.0/`.
- Order: 15a, 15b, 16, 17, 18, 19, 20 (built as 20a to 20f, then 20g-1 and 20g-2), 21, in number order. Q3
  `/curate` runs happen between steps, never during one (expected, last year plus 364
  days: OMC about 20 Oct,
  WPP about 29 Oct, STGW about 5 Nov, DENTSU about 13 Nov).
- Renumbered 2026-10-15: old 15 became 15a (build) and 15b (run); the design gate became
  16; old 16 and 17 became 17 and 18; the press tweak became 19 and took the AI &
  products category from old 15; 20 (final design pass) is new; 13 Ready to share became
  21 and runs last. Earlier mentions of "step 13" mean 21.
- Removed: 08d (dropped, see Day 2) and 12h (replaced by 16 to 18 and 20).
- Left out on purpose: no LLM-written summary on the site (quotes only; the 14b
  headlines stay in the data for the MCP tool), no "just reported" line, Data health
  stays a full panel, and the compare selection is shared by link, not remembered in
  the browser. No market cap on the cards (it stays in the data and the MCP tool), no
  8-quarter bars on the cards (Quarterly history covers the trend), no "All themes"
  quotes tab (one company selected shows all its themes).
- Absorbed from the Backlog: the "Management says" panel (18), Esc collapses the press
  list (19), visual identity and the first-screen check (16 and 20), log scale (retired:
  the compare chips rescale the chart), results dates shown three times (17), the phone
  growth grid opening at its oldest quarter (18), Dentsu commentary (15b).
- Design items found in the 17 to 19 reviews that do not fit that step's polish round go
  to the Backlog marked "for 20".

- [x] **15a Strategy documents: build.** Executor, plan mode, no site change. (0) First
  make `make check` green again: since the 14b data commits, `tests/test_pipeline.py`
  fails because its repo fixture copies the real `data/` and expects no commentary.json;
  the test must not depend on live data. (1) `pipeline/verify_quote.py`: `--text --from
  N` reads past the 60,000-character output limit (matching already searches the full
  text); prints the final URL after redirects; `--company CODE` refuses a URL whose
  registered domain is not that company's, or whose final host's robots.txt disallows it
  (robots.txt fetched through `core/util.fetch()`, parsed with stdlib
  `urllib.robotparser`). (2) `/curate --commentary CODE <url>` quotes one pasted, dated
  document: call transcript, results slides, annual or integrated report, investor day or
  strategy material, or an announcement already in press_releases.json. Transcripts:
  management only, never analysts. At most 6 quotes per transcript, 4 per report or plan,
  3 per slide deck, 2 per announcement; NOT FOUND is dropped as before. (3)
  `schemas/commentary.schema.json`: optional `source_type` (missing means
  results_release); `core/commentary.py` `latest_only` keeps each company's newest
  document per source_type, so report and investor day quotes are not hidden. (4)
  `core/calendar.py`: a found date equal to an unconfirmed events.yaml date becomes a
  candidate to confirm (today it is skipped, so a correct estimate stays "(est.)");
  `pipeline/nudge.py` drops the "arrives in step 08d" sentence from the Calendar Issue,
  and its test follows. (5) Stagwell's robots.txt re-checked and its FAILURES.md row
  corrected; ARCHITECTURE.md section 6 (commentary fields) updated. Tests use plain text
  and stubs, no network.
  Acceptance: `make check` and `make validate` green; a test reads text past 60,000
  characters with `--from`; an off-domain URL is refused before any fetch; a test shows a
  found date equal to an estimate becoming a candidate; the 23 existing commentary
  records still validate. Commit: `step 15a: commentary documents and long PDFs`.

- [x] **15b Strategy documents: run.** The maintainer, in a fresh session (commands load
  when a session starts). `/curate --commentary` on at most two documents per company,
  listed in the step prompt: strategy material and the latest quarter first (OMC's Investor
  Day transcript now; its Q3 transcript with the Q3 run). Then an estimated next results
  date (`confirmed: false`) by hand for each company without one: last year's date for the
  same period plus 364 days (PUB needs one lookup: no FY 2025 results row is on file).
  When the real date appears, the Calendar review Issue flags it for a hand copy.
  Acceptance: commentary.json uses at least four source_types and has DENTSU and STGW
  strategy quotes, or a FAILURES.md row says why; after `make pipeline` every company has
  a next results date in events.json (then `git checkout -- docs/data`).
  Commits: the `curate: ...` data commits, then `step 15b: strategy documents run`
  (ticks the box, as in 09 and 14b).

- [x] **16 Design the v2.0 page.** Planning chat, no executor session. Runs after 15b's
  closing commit and before 17, so the mockups use real document quotes and (est.)
  dates. Screenshots of today's page; a design-reviewer full brief and 2 to 3
  creative-director directions for the v2.0 page (scorecard card, compare chips, "In
  their words" rows and tabs, chart, phone swipe row, print). The step ends when the
  maintainer picks one direction. Then docs/DESIGN.md is rewritten: it supersedes M1's
  order, M3, M4, G1 to G6, R1, R3 to R5 and section 5's tile and legend rows (keeps the
  tokens, M5 to M8, R2, the one Esc handler and the chart spec unless the pick changes
  them); adds the scorecard, chips, quotes panel, phone and print specs, split between 17
  and 18; carries the intro line and freshness note placement forward for 21. The 17 and
  18 prompts are finalized, and two stale lines in `.claude/agents/` (12h, step 13) are
  fixed. Step 20 revisits the look on the built page, so 16 sets the direction and need
  not settle every detail. Acceptance: every Must item for 17 and 18 names a file and a
  check. Commit: `step 16: v2.0 design brief`.

- [x] **17 Compare chips, scorecards and chart.** Site only. (1) Compare chips: one
  page-wide company selection, default all six, carried in the URL hash (`#PUB,WPP`;
  12f's `#PUB` still works; unknown codes ignored); "All" and Esc reset it. It replaces
  the tile focus and the guidance chips (the guidance matrix shows all six until 18
  removes it); a legend click toggles the same selection, and unselected companies stay
  in the legend (`legendonly`) so they can be clicked back. (2) One card per selected
  company replaces the tiles, same rows in every card: organic growth (latest period,
  12g's delta); margin (latest period and its basis); guidance "Top line" (organic
  growth, else revenue) and "Profit" (operating margin, else EPS), each by G2's
  headline-record rule, with status badge and date link; shares (YTD, and the 2-day move
  from the close before the latest results date to the close after it, labelled e.g.
  "Share move on Q3 results", "pending" until that close exists; no price level,
  currency, 1D move or market cap); next results date ("(est.)" when unconfirmed). (3)
  The Events panel is removed; "Coming up" in What changed keeps upcoming dates. (4) The
  chart shows only selected companies plus the benchmark and rescales; event markers only
  when a subset is selected; the headline covers the shown companies. (5) Phone: cards in
  a swipe row, no sideways page scroll; print: all six cards.
  Acceptance: three cards match a hand check against kpis, guidance, events and prices
  (including the 2-day move); `/#PUB,WPP` opens with two companies and Esc restores six;
  a legend click hides and restores a company; hiding STGW rescales the chart; no event
  markers with all six shown; every chip works with Tab, Enter and Space; no sideways
  scroll at 375px; zero console errors or CSP violations; `make check` green.
  If it runs long, the chart part (4) becomes 17b in a fresh session.
  Commit: `step 17: compare chips, scorecards and chart`.

- [x] **18 In their words and folded sections.** Site only, plus ARCHITECTURE.md
  sections 2 and 7. (1) "In their words" between the cards and the chart, from
  commentary.json: tabs Strategy, AI & data, Clients and Outlook; one row per selected
  company with its newest quote on the theme (Strategy prefers strategy material up to a
  year old, DESIGN.md Q3), the speaker when present, the source type, the date and a link
  to source_url; with one company selected, one row per theme that has a quote (all six
  themes, so performance and capital allocation show there) and one muted line naming
  the themes without one (Q4). A company with no quote
  on the theme shows "No quote on this theme yet"; a missing commentary.json shows the
  panel's empty sentence. Headlines are not shown. (2) Two collapsed sections under the
  cards: "All guidance (n)" (G1's summary line and every current record with quote and
  source; the guidance matrix panel is removed) and "Quarterly history" (the growth grid
  and its definitions; on phones it opens at the newest quarter). Both print open. (3)
  The What changed link points at "All guidance". (4) ARCHITECTURE.md section 7 describes
  the v2.0 page; section 2's "step 13 stats" note reads step 21.
  Acceptance: every tab shows a quote or the "no quote" line for each selected company,
  and three quote links open the right document; WPP alone shows one row per theme; each
  folded section opens in one click and prints open; hiding commentary.json shows the
  empty sentence; no sideways scroll at 375px; zero console errors; `make check` green.
  If it runs long, Part 1 commits as `step 18: partial, in their words` and Parts 2 to 4
  become 18b. Commit: `step 18: in their words and folded sections`.

- [x] **19 Press: AI & products and key items.** (1) A new `ai_and_products` press
  category after `client` (config/watchlist.yaml classification,
  schemas/press_releases.schema.json enum, classifier tests, ARCHITECTURE.md section 5):
  not flagged, for product, platform, partnership and AI launches, word-bounded so
  "campaign" does not match; the plan lists every fixture and live title that moves out
  of "other". (2) Site (`docs/app.js`, `docs/style.css`): press shows key categories by
  default (results, guidance, m_and_a, capital_markets, leadership, client,
  ai_and_products) with "Show all (n)" for the rest, and their badges in words; press
  follows the compare chips (its own chips go); Esc also collapses an expanded list;
  print shows every item.
  Acceptance: `make check` and `make validate` green; a classifier test keeps a
  "campaign" title out of ai_and_products; after `make pipeline` the moved titles match
  the plan's list (then `git checkout -- docs/data`); the default count per company
  matches a hand count from press_releases.json; Esc collapses the list; no sideways
  scroll at 375px; zero console errors. Commit: `step 19: press AI & products and key
  items`.
  Built 2026-10-15 with a maintainer-approved polish round: a scope line, an "Other
  releases" label, newest first, and `pipeline/run.py` reclassifies stored press items on
  every run (DESIGN.md P1 to P3).

**20 Final design pass: "Plot Sheet".** Designed 2026-10-26 with a Claude Cowork design
agent over five rounds (mockups in `prompts/design/cowork/final/`, local only), reviewed
by design-reviewer and written into docs/DESIGN.md by `plan: v2.0 final design`. Grey
dotted paper with white panels; a dark filter capsule pinned while scrolling, where one
click shows one company; one peer table instead of six cards; a quotes grid; one big
chart with a key; print as a handout with all six companies. It replaces the one-session
plan: the design work grew into six executor sessions of about 90 minutes (then two more, 20g-1 and 20g-2), in order,
each from its own prompt in `prompts/v2.0/` and ticking its own box. Site only
(docs/index.html, app.js, style.css; 20f and 20g-2 also ARCHITECTURE.md section 7): no new panel,
data field, schema, pipeline change or dependency; anything bigger goes to the Backlog.
"Neither page taller than before" is replaced by first-screen checks (in 20c to 20e).
Every part: its DESIGN.md checks pass; `make check` green; zero console errors or CSP
violations; no sideways scroll at 375 and 320px; before and after screenshots at 1440
and 375px with page heights noted. Each part commits locally; the maintainer pushes after
the last part, so the live page changes once.
Re-split 2026-10-27 (maintainer, after 20c): Share price under the Peer table, In their
words and Press releases as closed folds, What changed as a dated brief, a marker for
results out but not yet on file, and a tidier table (each figure beside its guidance,
guidance in full). 20d to 20f replace the old 20d (DESIGN.md section 8). Still one push,
after the last part (maintainer): /curate runs in between, such as WPP's and Stagwell's Q3
on 29 Oct, commit locally and reach the live site with that push.
Extended 2026-10-27 (maintainer, final design review after 20f): 20g-1 and 20g-2 polish the
built page before step 21 (DESIGN.md J1 to J6 and L1 to L4). The one push follows 20g-2.
Absorbed from the Backlog (lines dated 2026-10-15): the unclear company filter (step 19
build check: B1 to B4), a quick way to show one company (B2), the dark chips' weight
(B1), the phone header and What changed height (A2, B5, D1), a shorter What changed with
reaffirmations folded (B5), Coming up listing capital markets days and deals (B5; AGMs
stay out), the printed chart showing all six (D6), pressable theme buttons (A4), folded
"no quote" rows (D4), the phone press cap (D5).

- [x] **20a Look.** DESIGN.md A1 to A7: tokens and the dotted paper, header and mark,
  white panels in two weights, pill tracks for themes and chart windows, folds as panels,
  loading and empty states, data health on the paper. Cards, chips and rows keep their
  content until 20b to 20d. Acceptance: each A check; a fold, a track and the press panel
  work by keyboard with a visible ring; renaming press_releases.json shows the grey
  sentence and no count. Commit: `step 20a: plot sheet look`.
  Built 2026-10-26 with a maintainer-approved polish round: the quote column set in rem (the
  serif's 62ch), the press scope line on its header row, data health warnings in ink, not
  red. Status words in All guidance carry their glyph. Page height at 1440: 3,415px (3,336
  before); at 375: 5,273px (4,892), the new panel padding. The 3,390px whole-page budget
  after 20d now depends on 20c's table being shorter than the cards.

- [x] **20b Filter and What changed.** B1 to B6: the sticky capsule with the solo-first
  rule, the phone opener, the chart legend no longer filtering, What changed following
  the selection, Esc. Acceptance: each B check; the capsule stays visible while scrolling
  at 1440 and 375 and nothing shows above it; `/#PUB,WPP` and `/#WPP` links still work;
  Shift+Tab never leaves the focused control under the capsule. If it runs long, What
  changed (B5) becomes 20b2 in a fresh session. Commit: `step 20b: filter capsule and
  what changed`.
  Built 2026-10-26 with a maintainer-approved polish round: the page's dot grid is
  viewport-fixed like the band's, so the two line up while scrolling; focus clearance at
  720px and below is 80px (the band is 68px tall); the band is hidden when companies.json
  is missing. On the day of a capital markets day or a deal the pill reads "Today". Kept
  the paper band over a free-floating capsule (maintainer, at the build check). Page height
  at 1440: 3,386px (3,415 before), /#WPP 2,482 (2,555); at 375: 5,098px (5,273), /#WPP
  3,853 (4,096). From 20c the executor saves the before and after screenshots itself.

- [x] **20c Peer table.** C1 to C7: the table, every Change naming its base ("vs Q2 26")
  or a reason, period links to sources, the headline, the foot line, the true minus and
  formatting rules, the 961 to 1100px fit. Acceptance: each C check; three rows match a
  hand check against kpis, guidance, events and prices (including the two-day move); at
  1440×900 the whole table is on the first screen (last row at or above 860px); at 1024
  no column is cut. Commit: `step 20c: peer table`.
  Built 2026-10-27 with a maintainer-approved polish round: the columns grouped under
  Organic growth, Margin, Guidance, Share price and Next results, with thin rules between
  the groups; guidance on one line with "See all ↓" to All guidance; links inside the table
  grey, so green and red are its only colors; the change on the growth figure's line. The
  margin basis stays in full ("headline operating profit"). Last row at 1440×900: 834px.
  Page height at 1440: 3,101px (3,420 before), /#WPP 2,269 (2,482); at 375: 5,507px
  (5,157), /#WPP 3,745 (3,853), taller until D1's company blocks replace the scrolling table.

- [x] **20d Phone blocks and chart.** D1 to D3 and D8: company blocks at 960px and below
  (each figure beside its guidance), the chart key and end-code leaders, Share price under
  the Peer table. Acceptance: each D1 to D3 and D8 check; at 375×812 the capsule and the
  first company's growth figure are on the first screen. Commit: `step 20d: phone blocks
  and chart`.
  Built 2026-10-27 with two maintainer-approved polish rounds. First: the YTD ticks show day
  and month while the window is under 92 days (no "Jan, Jan, Jan" in January); dragging the
  chart no longer zooms (the window track is the only time control, and a swipe over the
  chart scrolls the page); the headline drops the S&P 500 figure while its line is off;
  every end code sits 16px right of its line's end, one column; the right margin is 72px (a
  moved DENTSU code was cut at 64). Second (maintainer, at the build check: the phone chart
  read tall and narrow, as the mockup's did): at 720px and below the chart is 280px tall and
  the plot takes the panel's full width (plot 223×232 at 375, was 199×372). Last row at
  1440×900: 834px; the chart panel's top: 902px. Page height at 1440: 3,288px (3,127
  before), /#WPP 2,457 (2,295); at 375: 6,332px (5,469), /#WPP 3,703 (3,706); the 375×812
  first screen ends Publicis Groupe's growth figure at 592px. Left for 20f: two YTD codes
  sit 11px apart at 1440 and 840 (leader offsets rounded to whole pixels; a one-line fix in
  `endLabelAnnotations`); print page 1 now also holds the chart and ends on In their words'
  title, until D6's page break after the table.

- [x] **20e What changed and the table.** E1 to E3: What changed as a dated brief (the last
  14 days, then the next dates), a marker for results out but not yet on file, and the
  table with each figure beside its guidance, guidance in full and the margin basis naming
  the profit. Acceptance: each E check; the rows match a hand check on the build day; with
  the marker on two rows the 1440×900 last row is at or above 860px and the 375×812 check
  passes. Commit: `step 20e: what changed and the table`.
  Built 2026-10-27 with one planned polish round and two small ones at the maintainer's call.
  What changed is now "What’s new": three rows (with four the table ended at 868px), then
  "Next 14 days", the dates in the next two weeks only (the table's Next results column keeps
  every date); its titles and links are dark like the table's. In the table each guidance
  column is at least 184px wide at 1280px and up and takes three lines from 961 to 1279px
  (two cut five figures at 1101); every guidance ↗ sits at its cell's top right; the margin
  line may wrap below 1280px (one line pushed the table 6px wide at 1101); a withdrawn value
  is struck through, its word not. Accepted: Publicis's Profit guidance cut before "18.2%";
  newest first at three rows (on 27 Oct two deals push Havas's and Publicis's Q3 results out).
  "Definitions" is hidden in print from now, with "All guidance" (D6's rule, brought
  forward). Last row at 1440×900: 844px, the same with the marker on Publicis and Omnicom
  (889px at 1200×900; the 860px line is checked at 1440 only). At 375×812 Publicis Groupe's
  growth figure ends at 702px (741 with both marked, before the 14-day Next line took 20px
  off). Page height at 1440: 3,298px (3,288 before), /#WPP 2,444 (2,457); at 375: 6,337px
  (6,332), /#WPP 3,650 (3,703).

- [x] **20f Quotes, press, folds and print.** D4, D5, F1, D6, D7: the quotes grid and press
  rows inside closed folds, the A4 and Letter handout, ARCHITECTURE.md section 7.
  Acceptance: each check; at 1440 with all six the page is at most 3,390px; print is at
  most 4 pages on A4 and on Letter with page 1 holding the header, What’s new and all six
  table rows; every printed end code is whole; no company color outside the chart. If it
  runs long, the phone press cap (D5) is cut first; if D4, D5 and F1 fill the session, D6
  and D7 become 20g, and their checks (heights, print, end codes) move with them. Commit:
  `step 20f: quotes, press, folds and print`.
  Built 2026-10-27 in one session with one maintainer-approved polish round. Print is 5 pages
  on A4 and on Letter, not 4 (maintainer, at the build check): the 4-page print before 20f
  was Chrome shrinking an oversized page, and at true size (11px text, every release) the
  first build printed 6 on A4 and 7 on Letter, with Letter's foot line alone on page 2; a
  print-only spacing pass brought both to 5, keeping D6's sizes (4 needed 10px text and key
  releases only). Page 1 holds the header, What’s new and the whole table with its foot line
  (123px to spare on A4, 88 on Letter); page 2 the chart and all the quotes, three across on
  paper (two across ran onto page 3); All guidance prints one record per line. The printed
  chart is all six at 677×260 in the pressed window with the benchmark as toggled, and the
  screen chart comes back at once afterwards. End codes sit on whole pixel rows, at least 12px
  apart in every window, on screen and in print. One company's quote count is out of the six
  themes its grid lists ("WPP: quoted on 6 of 6 themes"). Last row at 1440×900: 844px; at
  375×812 Publicis Groupe's growth figure ends at 702px. Page height at 1440: 1,963px (3,298
  before; 3,080 at the v2.0 start), /#WPP 1,593 (2,444); at 375: 3,381px (6,337; 4,357 at the
  v2.0 start), /#WPP 1,908 (3,650).

- [x] **20g-1 Table, colors and arrows.** J1 to J6: the share price move on results named as
  the two-day move it is ("On results" over "Q3 · 2 days"), YTD and that move in green or red
  with ▲/▼, one quiet ↗ on every link to a company document (All guidance's and Quarterly
  history's no longer blue), guidance with only its figures bold, the table's group labels at
  the left, and phone blocks spaced in pairs. Files: docs/app.js and docs/style.css.
  Acceptance: each J check; at 1024 and 1101 the table does not scroll; at 1440×900 the last
  row ends at or above 860px; at 375×812 the capsule and the first company's growth figure
  are on the first screen; every table guidance value listed as it reads at 1440 and 1101;
  print at most 5 pages on A4 and on Letter, page 1 ending with the table's foot line; no
  company color outside the chart. If it runs long, J6 goes first, then J5. Commit:
  `step 20g-1: table colors, arrows and labels`.
  Built 2026-10-27 in one session with one maintainer-approved polish round: all six items, no
  cut. The ▲/▼ needed no 12px fallback: the table does not scroll at 1024, 1101, 1200, 1280 or
  1440, and the margin line stays on one line at 1280 and 1440. The YTD glyph took 15px from
  the company column, so "Publicis Groupe" takes two lines at 1440 (accepted: rows stay 63px;
  with the results-out marker forced on Publicis and Omnicom the last row ends at 856px). No
  guidance figure newly cut; regular text shows more at 1440 (Publicis's Profit to "versus…",
  its "18.2%" still cut as accepted in 20e; Omnicom's Top line to "constant…", was "4%…"), and
  1101 is unchanged. Polish: no line in a company block starts or ends with "·" (What’s new's
  separator, grey); "(2 days)" goes under its figure at 320 to 366px and 721 to 747px, and
  under WPP's wider figure up to 375 and 764px (accepted). Last row at 1440×900: 844px; at
  375×812 Publicis Groupe's growth figure ends at 702px. Page height at 1440: 1,963px
  (unchanged), /#WPP 1,593 (unchanged); at 375: 3,647px (3,381; each block 44px taller, 24 from
  J6's gaps and 20 from the share line's second line), /#WPP 1,953 (1,908). Print is 5 pages on
  A4 and on Letter, page 1 ending with the foot line: 123px to spare on A4 (unchanged), 56 on
  Letter (88; on paper the share columns took about 25px from the guidance columns, so two
  guidance values wrap one more line); page 2 holds the chart and all the quotes.

- [x] **20g-2 Clean tops and takeaways.** L1 to L4: every panel's top holds only its title
  and its controls (the scope and count lines go; what still matters moves to the bottom),
  the peer table and the chart each end with a computed Key takeaway (who grows fastest and
  slowest and whether growth is speeding up; the share price leader, laggard and how many are
  ahead of the benchmark), What’s new keeps results first when it leaves rows out, and
  ARCHITECTURE.md section 7 follows. Files: docs/index.html, docs/app.js, docs/style.css and
  docs/ARCHITECTURE.md. Acceptance: each L check; at 1440×900 the last table row ends at or
  above 860px and the table's takeaway at or above 900px; print at most 5 pages on A4 and on
  Letter, page 1 ending with the table's foot line and page 2 holding the chart and all the
  quotes; the whole-page checks in DESIGN.md section 8. Commit: `step 20g-2: clean panel
  tops and takeaways`. Then the one push of step 20 (maintainer): `git pull --rebase && git
  push`, and the live page shows What’s new, the peer table and both takeaways.
  Built 2026-10-28 in one session with one maintainer-approved polish round: no-break spaces in
  both takeaways ("the S&P 500 (+12.1%)", "3 companies"), "Show" never alone under a wrapped
  fold title on phones, and the chart's takeaway set close under the plot. The table's takeaway
  needed neither 16px nor the short form: at 1440×900 it is one line ending at 876px, the same
  with Publicis Groupe forced to the lead; the last row ends at 844px. With the Next line at its
  longest (three dates, two companies on most; forced), What’s new's note takes its own line at
  1440, the last row ends at 861px and the takeaway at 894px (accepted). The first build printed
  6 pages on Letter (page 1 grew 75px: 44 from the table's takeaway, 31 from results rows that
  wrap on paper where the deals they replace did not); a print-only pass (table cells 4px, 12px
  between panels, quote cells 8px) brought it back to 5. Print is 5 pages on A4 and on Letter:
  page 1 ends with the foot line, 64px to spare on A4 (123 before) and 28 on Letter (56; 44 with
  the results-out marker on two rows); page 2 holds the chart, its takeaway and every quote,
  ending with the theme and "Verbatim from company documents", 83px to spare on A4 and 16 on
  Letter; each takeaway prints on two lines. At 375×812 Publicis Groupe's growth figure ends at
  686px (702). Page height at 1440: 1,999px (1,963 before; 3,080 at the v2.0 start), /#WPP
  1,629 (1,593); at 375: 3,671px (3,647; 4,357 at the v2.0 start), /#WPP 1,942 (1,953). DESIGN.md
  section 8's whole-page checks pass. Measured on 27 Oct's data; from 28 Oct Publicis's 13 Oct
  results leave the 14-day window, so What’s new shows Stagwell's deal third ("3 of 4 shown").

- [x] **21 Ready to share** (was 13). Runs last, after 20, so the README and the intro
  line describe the final v2.0 page. `pipeline/stats.py` (computed numbers from
  runs.jsonl, status.json history and git log, "n/a" rather than estimates). README
  rewritten around the live Pages link: what it is, who it is for, the numbers,
  architecture (Mermaid), data sources and limits, why the LLM step is local, failures and
  fixes, run it yourself, disclaimer. Site: a one-line "what am I looking at" intro (no
  hardcoded benchmark name) and a data-freshness note (prices as of, curated as of, from
  status.json), dates shown as DESIGN.md S3 says ("9 Oct 2026, 01:51 UTC"), meta
  description and Open Graph title/description, inline SVG favicon (the six-around-one
  mark, DESIGN.md section 8). No GIF, no recording.
  Acceptance: `uv run python -m pipeline.stats` prints real numbers; README's first screen
  has the link, the one-line description and the disclaimer; the live Pages URL works on a
  real phone without horizontal scroll and on desktop with zero console errors.
  Commit: `step 21: ready to share`.
  Built 2026-10-28 in one session with one maintainer-approved polish round (DESIGN.md
  revision 2026-10-28, step 21). Header at 1440: 91.3px before and after, the intro on one
  line; at 1024 and 840 111.6 (intro on two lines); at 375 116 → 153 (intro on three lines,
  the note on two; accepted), 170 at 320. First screen: at 1440×900 the last row ends at
  843.6px and the table's takeaway at 876 (both unchanged); at 375×812 Publicis Groupe's
  growth figure at 702.8 (666 before, on 28 Oct's data). A stale-price line adds 12px at 1440
  (Dentsu: last row 856, takeaway 889); three companies at once (the Tuesday after Easter)
  wrap it to two lines, last row 873 and takeaway 906 (accepted, about once a year). Print: 5
  pages on A4 and Letter, page 1 ending with the foot line, 83px to spare on A4 and 65 on
  Letter (PDF; unchanged). Stats on 28 Oct: 32 runs, median 32.3 s, p95 37.5 s, 25 of 32 runs
  with every source ok (Dentsu's press feed failed in 6 snapshots, Omnicom's in 1), 9 curate
  commits, 25 verified guidance records, 525 trading days of prices. Decisions: the prices
  line gives the newest close date, not a fetch time; og:image yes; Copy link above 1100px and
  in the phone list; the mark stays inline twice; Quarterly history gains "Organic growth" and
  "Q/Q change"; "About and sources" does not print.

- [x] **22 Data audit.** Executor, plan mode, read only. One sweep of every data input and
  output before the v2.0 link is shared, from the data as of the commit it starts from
  (WPP's and Stagwell's Q3 results of 29 Oct are out of scope). (1) Every KPI row, guidance
  record and quote against its source document, and HAVAS's share count. (2) The numbers the
  page computes, recomputed from `docs/data/`. (3) Every `source_url` in `data/` and the press
  links of the last 30 days: opens, sits on the company's own domain, matches its title and
  date. (4) Each gap (Quarterly history blanks, companies without guidance, Dentsu's single
  quote): what the company published, where, and the next action. (5) Source health from the
  status.json history. (6) Upcoming dates against the company's own announcement. Company
  documents only through `verify_quote --company CODE`, each URL once; throwaway scripts in
  the executor's scratchpad, no LLM. Findings go in a local report,
  `prompts/audit/audit-2026-10.md` (gitignored); fixes are sorted at its gate into /curate
  runs, hand edits, tweaks or a 22b, never made in this step. Files: `docs/FAILURES.md` (rows
  for sources that misbehaved), `docs/PLAN.md` (the tick) and, only with the maintainer's text
  verbatim, README.md's "Data sources and their limits". Never `data/`, `docs/data/`,
  `config/`, `schemas/`, code or `.github/`.
  Acceptance: the report names its starting commit and opens with counts (figures checked and
  matched, links checked and broken or off-domain, gaps by next action, sources with
  failures), then one line per finding with what the page shows, what the source says and the
  URL; "not in the document" and "could not read the document" are separate findings;
  `make check` and `make validate` green.
  Commit: `step 22: data audit`.
  From the Backlog (2026-10-28, maintainer, before step 21 was built): a full data audit
  before the link is shared: every figure traced to the document it cites, every link
  checked, each gap (Dentsu half-years only, Stagwell's organic growth "not stated" in 5 of 8
  quarters) filled from the company's own site or stated as a limit, and source health over
  time (Dentsu's press feed failed in 6 of 32 snapshots).

## Parked (later, after v2.0)

Renamed from "Parked (v2)" on 2026-10-15, so it is not confused with the v2.0 steps.

- Deal tracker (`data/deals.yaml`, panel, /curate extension).
- News panel on the site (collector exists from step 04; data is in docs/data/news.json).
- EDGAR reported financials as enrichment.
- AI value chain watchlist (`config/ai-value-chain.yaml`).
- Alpha Vantage fallback (only if yfinance fails on the runner for several days).

## Backlog (unsorted ideas)

One dated line per idea. The planning chat sorts each into a tweak, an existing step, a
new step, Parked, or no (breaks a hard rule), then moves the line.

- 2026-10-11: guidance records with metric `other` read as "other" on the site (STGW
  $475-525m, WPP £800-900m), which tells a reader nothing. Option: an optional
  `metric_label` in the guidance schema (e.g. "adjusted EBITDA"), filled by /curate from
  the source's own wording. A schema change, so its own small step or part of the next
  /curate step.
- 2026-10-12: the chart footnote in index.html names "S&P 500" as static text instead of
  companies.json's benchmark name (noticed in 12e). Fold into step 13, which already
  edits index.html.
  2026-10-12: moved into step 12g as fold-in (5), next to the new chart headline.
- 2026-10-11: dark mode (a second token set plus Plotly colors). Candidate for Parked.
- 2026-10-15 (v2.0 review): show the S&P 500's move over the same two days next to a
  card's results move. 2026-10-26: it would sit beside the peer table's "On results"
  column.
- 2026-10-15 (v2.0 review): print follows the chosen companies (a peer-set handout).
- 2026-10-15 (v2.0 review): once `metric_label` exists (2026-10-11 line), Stagwell's
  adjusted EBITDA guidance as its card's Profit line.
- 2026-10-15 (15a): `/curate` document mode could also draft guidance and KPI rows from
  slides or transcripts when the results release lacks them (e.g. Dentsu FY rows, guidance
  given only on the call). Decide after 15b shows what the documents yield.
- 2026-10-15 (15a review): verify_quote checks robots.txt on a redirect's final host only
  after the download; checking each hop before following it needs a change to
  `core/util.fetch()`.
- 2026-10-15 (15a review): each `--from` chunk downloads and parses the whole document
  again, so a very long PDF is slow to read in 15b. Note how slow in 15b before deciding.
- 2026-10-15 (15b verify, for 21): status.json's last_curate_at comes from
  `data/curate_state.json`, which document mode leaves unchanged on purpose (so new
  releases stay in the Curate-needed queue), so after a document run it understates
  freshness. `get_commentary` was fixed in `tweak: commentary as_of counts document runs`
  (newer of the two). Step 21's "curated as of" note should use the same rule.
  2026-10-28 (21): done; the header's "Curated" time uses that rule.
- 2026-10-15 (step 17): figures lose trailing zeros ("11%" for 11.0, "+5%" for 5.0)
  because JSON drops them; showing "11.0%" needs the value as reported, a schema
  question. Not in 20 (a schema change); it shows in the peer table and its headline.
- 2026-10-15 (step 17, for 21): a card's YTD silently uses the last close when a
  company's prices are two or more days stale (the old tile said "stale"); the step 21
  freshness note should cover it.
  2026-10-28 (21): done; the header names a company two or more weekdays behind.
- 2026-10-15 (step 18 review): All guidance drops records whose company code is not in
  companies.json (the old tracker listed them). None exist today; not in 20.
- 2026-10-15 (step 18 review): /curate quotes must stand alone; leave out openers such
  as "At the same time," (PUB Clients, 13 Oct). A rule in `.claude/commands/curate.md`;
  sort before the next /curate run (OMC Q3, about 20 Oct).
- 2026-10-15 (step 19 review): a Financing press label (bond issues, buybacks,
  dividends, liquidity agreements) as a key, unflagged category. Today "Publicis prices
  EUR 500 million of bond issue" and "Havas share buyback documents" sit in Other.
  Config, schema, tests and a badge word, like step 19 Part 1.
- 2026-10-15 (step 19 review): `\blaunch(es)?\b` would label a title such as "Havas
  launches share buyback" AI & products; AI-themed research and talks (Havas "The
  Science of Desire", Publicis at the Croisette) also land there. Decide with the
  Financing line.
- 2026-10-15 (step 19 review): a press filter by label (e.g. only Deals across all six).
  A feature, so not step 20.
- 2026-10-26 (step 20 design): sort the peer table by a column (rank by growth or YTD).
- 2026-10-26 (step 20 design): hover a company in the chart key to highlight its line and
  dim the others.
- 2026-10-26 (step 20 review): PUB #9A7D2E and OMC #d95f02 are hard to tell apart on the
  chart (ΔE 3.3 for color-blind readers, 12.1 for normal vision); their end codes and the
  key carry them. Option: a second cue for one of them, such as a dash pattern.
- 2026-10-26 (step 20 design, for 21, needs a yes there): a link-preview image
  (`og:image`, 1200×630, no figures so it never goes stale), drafted by Cowork as
  `prompts/design/cowork/final/og-image.png`; it would be a new file in `docs/`.
  2026-10-28 (21): yes, built as docs/og-image.png, unchanged.
- 2026-10-26 (step 20 design, for 21, needs a yes there): a "Copy link" pill in the
  capsule for the current peer set (the URL hash already holds it).
  2026-10-28 (21): yes, built (above 1100px; on phones the opened list's last row).
- 2026-10-26 (20a build check): the maintainer asked whether every panel should take the
  primary panels' 2px ink edge; kept the two weights for now (the capsule and the peer
  table's title are not built yet). Look again at 20c's build check; if the secondary edges
  still feel weak, the lever is a darker `--border-2` (one token), not ink, since a 1px ink
  outline is the tracks' and pills' control style.
  2026-10-27 (20c build check): closed. With the table built, the 1px `--border-2` panels
  read clearly as panels and the 2px ink table as the main one; no change.
- 2026-10-27 (20c build check): the WPP release "WPP Enterprise Solutions named a Strong
  Performer in Loyalty Services, Q4 2026 Evaluation…" (27 Oct) is labelled Results and
  flagged key: the results rule matches "Q4 2026". A press label rule fix (config, tests);
  decide with the Financing line.
- 2026-10-27 (20c polish): one-line guidance in the peer table cuts the figure in three
  top-line values at 1440 (Omnicom "Revenue approximatel…", WPP "decline low …", Havas
  "between +2.0% and…"); the full text is on hover and in All guidance. Two lines no longer
  fit the 860px first screen. Options: a short curated value per record (a schema and
  /curate change, with the `metric_label` line), or more width for the guidance columns.
  2026-10-27: moved into 20e (E3: the status line goes, so the value takes two lines).
  2026-10-27 (20e): closed. Every guidance figure shows at 1440 except Publicis's "18.2%"
  (accepted); a short curated value stays an option with the `metric_label` line.
- 2026-10-27 (20e build check): What’s new shows three rows, newest first, so on 27 Oct two
  deals push Havas's and Publicis's Q3 results out. Option: list results before deals when
  rows are left out. Look again once a results week has gone through.
  2026-10-27 (final review after 20f): moved into 20g-2 (DESIGN.md L3: results, then
  guidance, then capital markets days, then deals, when rows are left out).
  2026-10-28 (20g-2): closed. On 27 Oct What’s new showed the three Q3 results.
- 2026-10-27 (20f build check): the four folds' titles are spans inside `<summary>`, not
  headings, so heading navigation skips In their words and Press releases (h2s before 20f),
  All guidance and Quarterly history. Option: an h2 inside each summary (HTML allows one),
  checked with VoiceOver so the summary keeps its button role.
- 2026-10-28 (21 build check): print the live site address on the handout's page 1, so a
  reader holding the paper can find the page (Letter's page 1 has 65px to spare).
- 2026-10-28 (21 plan): a test that keeps index.html's og:url and og:image in step with
  `dashboard.site_url`, which they copy as static text. A tweak.
- 2026-10-28 (21 plan): ARCHITECTURE.md's repo tree and section 7 do not name
  `pipeline/stats.py` or the header's freshness note. A tweak.
- 2026-10-28 (21 plan): og-image.png's subtitle is the old tagline and its hyphen renders
  spaced ("public - source"); a redraw is a tweak. `twitter:card` is left out, so X shows a
  small card.
