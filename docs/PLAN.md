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

Planned 2026-10-15 (maintainer-approved in the planning chat). The page becomes three
main panels, in this order: compare chips with one scorecard per company, "In their
words" (verbatim management quotes by theme), then the share price chart. What changed,
Press releases and Data health stay. Commentary gains sources beyond results releases.
Step prompts are in `prompts/v2.0/`.
- Removed: 08d (dropped, see Day 2) and 12h (replaced by the design gate, 16 and 17).
- Moved: 13 keeps its number and runs last, after 17 and the press tweak.
- Left out on purpose: no LLM-written summary on the site (quotes only; the 14b
  headlines stay in the data for the MCP tool), no "just reported" line, Data health
  stays a full panel, and the compare selection is shared by link, not remembered in
  the browser.
- Absorbed from the Backlog: the "Management says" panel (17), Esc collapses the press
  list (press tweak), visual identity and the first-screen check (design gate), log scale
  (retired: the compare chips rescale the chart), results dates shown three times (16),
  the phone growth grid opening at its oldest quarter (17), Dentsu commentary (15).
- Order: 15, then the design gate (it may run during 15 but edits only `prompts/` until
  15 lands), then 16, 17, the press tweak and 13. Q3 `/curate` runs happen between
  steps, never during one.

- [ ] **15 Strategy documents and estimated dates.** Two sessions, plan mode, no site
  change. (0) First make `make check` green again: since the 14b data commits,
  `tests/test_pipeline.py` fails because its repo fixture copies the real `data/` and
  expects no commentary.json; the test must not depend on live data. (1)
  `pipeline/verify_quote.py`: `--text --from N` reads past the 60,000-character
  output limit (matching already searches the full text); prints the final URL after
  redirects; `--company CODE` refuses a URL whose registered domain is not that company's
  or whose final host's robots.txt disallows it (stdlib robotparser). (2) `/curate
  --commentary CODE <url>` quotes one pasted, dated document: call transcript, results
  slides, annual or integrated report, investor day or strategy material, or an
  announcement already in press_releases.json. Transcripts: management only, never
  analysts. At most 6 quotes per transcript, 4 per report or plan, 3 per slide deck, 2 per
  announcement; NOT FOUND is dropped as before. (3) `schemas/commentary.schema.json`:
  optional `source_type` (missing means results_release); `core/commentary.py`
  `latest_only` keeps each company's newest document per source_type, so report and
  investor day quotes are not hidden. (4) `core/calendar.py`: a found date equal to an
  unconfirmed events.yaml date becomes a candidate to confirm (today it is skipped, so a
  correct estimate stays "(est.)"). (5) An `ai_and_products` press category (not flagged,
  word-bounded so "campaign" does not match), schema enum and classifier tests; cut first
  if the step runs long. (6) Stagwell's robots.txt re-checked and its FAILURES.md row
  corrected; ARCHITECTURE.md sections 5 and 6 updated. Session 2 runs `/curate
  --commentary` on at most two documents per company (listed in the step prompt), and the
  maintainer hand-enters an estimated next results date (`confirmed: false`) for each
  company without a confirmed one. Tests use plain text and stubs, no network.
  Acceptance: `make check` and `make validate` green; a test reads text past 60,000
  characters with `--from`; an off-domain URL is refused before any fetch;
  commentary.json uses at least four source_types and has DENTSU and STGW strategy quotes,
  or a FAILURES.md row says why; after `make pipeline` every company has a next results
  date in events.json (then `git checkout -- docs/data`).
  Commits: `step 15: commentary documents, long PDFs, AI press category`, the `curate: ...`
  data commits, then `step 15: strategy documents run` (ticks the box, as in 09 and 14b).

- [ ] **Design gate (before 16).** Planning chat, no executor session. Screenshots of
  today's page; a design-reviewer full brief and 2 to 3 creative-director directions for
  the v2.0 page (scorecard card, compare chips, "In their words" rows and tabs, chart,
  phone swipe row, print). The maintainer picks one. A `plan:` commit rewrites
  docs/DESIGN.md (supersedes M1's order, M3, M4, G1 to G6 and R3 to R5; adds the scorecard,
  chips, quotes panel, phone and print specs; decides whether cards carry small 8-quarter
  bars) and finalizes the 16 and 17 prompts. Acceptance: every Must item for 16 and 17
  names a file and a check. Commit: `plan: v2.0 design brief`.

- [ ] **16 Compare chips, scorecards and chart.** Site only. (1) Compare chips: one
  page-wide company selection, default all six, carried in the URL hash (`#PUB,WPP`;
  12f's `#PUB` still works; unknown codes ignored); "All" and Esc reset it. It replaces
  the tile focus and the guidance chips; a legend click toggles the same selection, and
  unselected companies stay in the legend (`legendonly`) so they can be clicked back.
  (2) One card per selected company replaces the tiles, same rows in every card: organic
  growth (latest period, 12g's delta); margin (latest period and its basis); guidance
  "Top line" (organic growth, else revenue) and "Profit" (operating margin, else EPS),
  each by G2's headline-record rule, with status badge and date link; shares (YTD, the
  2-day move from the close before the latest results date to the close after it,
  labelled, "pending" until that close exists, market cap approx; no price level,
  currency or 1D move); next results date ("(est.)" when unconfirmed). (3) The Events
  panel is removed; "Coming up" in What changed keeps upcoming dates. (4) The chart shows
  only selected companies plus the benchmark and rescales; event markers only when a
  subset is selected; the headline covers the shown companies. (5) Phone: cards in a
  swipe row, no sideways page scroll; print: all six cards.
  Acceptance: three cards match a hand check against kpis, guidance, events and prices
  (including the 2-day move); `/#PUB,WPP` opens with two companies and Esc restores six;
  a legend click hides and restores a company; hiding STGW rescales the chart; no event
  markers with all six shown; every chip works with Tab, Enter and Space; no sideways
  scroll at 375px; zero console errors or CSP violations; `make check` green.
  Commit: `step 16: compare chips, scorecards and chart`.

- [ ] **17 In their words and folded sections.** Site only, plus ARCHITECTURE.md section
  7. (1) "In their words" between the cards and the chart, from commentary.json: tabs
  Strategy, AI & data, Clients, Outlook and All themes; one row per selected company with
  its newest quote on the theme, the speaker when present, the source type, the date and
  a link to source_url; with one company selected, one row per theme. A company with no
  quote on the theme shows "No quote on this theme yet"; a missing commentary.json shows
  the panel's empty sentence. Headlines are not shown. (2) Two collapsed sections under
  the cards: "All guidance (n)" (G1's summary line and every current record with quote
  and source; the guidance matrix panel is removed) and "Quarterly history" (the growth
  grid and its definitions; on phones it opens at the newest quarter). Both print open.
  (3) The What changed link points at "All guidance". (4) ARCHITECTURE.md section 7
  describes the v2.0 page.
  Acceptance: every tab shows a quote or the "no quote" line for each selected company,
  and three quote links open the right document; WPP alone shows one row per theme; each
  folded section opens in one click and prints open; hiding commentary.json shows the
  empty sentence; no sideways scroll at 375px; zero console errors; `make check` green.
  Commit: `step 17: in their words and folded sections`.
  Then `tweak: press defaults and Esc` (`docs/app.js`, `docs/style.css`): key categories
  by default (results, guidance, m_and_a, capital_markets, leadership, client,
  ai_and_products) with "Show all (n)" for the rest; press follows the compare chips (its
  own chips go); Esc also collapses an expanded list.

- [ ] **13 Ready to share.** Moved into v2.0 on 2026-10-15: runs last, so the README and
  the intro line describe the v2.0 page. `pipeline/stats.py` (computed numbers from runs.jsonl,
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
- 2026-10-12 (12g review): "Reports today" reuses the blue of the "New" guidance badge.
  Check for confusion on the first real results day; a tweak if it confuses.
