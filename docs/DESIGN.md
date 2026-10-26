# Design brief (approved 2026-10-09, rewritten for v2.0 on 2026-10-15 and for Plot Sheet on 2026-10-26)

Revision 2026-10-26 (step 20, maintainer pick after five design rounds with a Claude Cowork
agent): "Plot Sheet". A comps sheet on grey paper: white panels, one peer table instead of six
cards, one big share price chart, and a dark filter capsule pinned while scrolling, the page's
one bold element. It replaces direction A ("Broadsheet ledger"): K1 to K7, Q1, Q2, Q6's look,
Q7, the v2.0 tokens, chart spec and interactivity spec. Kept, some amended, in section 5: Q3,
Q4, Q5, Q6's content, P1 to P3, G1, G3, M5 to M8, R2, R6, S2. The mockups are in
`prompts/design/cowork/final/` (local, not in the repo); each item names the one it comes from,
and where a mockup and this file differ, this file wins. Built in four sessions, 20a to 20d
(section 8). Earlier revisions (2026-10-09 to 2026-10-15) are in git history.

## 1. Principles
- Answer, per company: who is growing and is it speeding up, what margin it makes, what it guides to, how the market took its last results, and when it reports next. The peer table answers all five in one sweep. Share price is context and sits below the quotes.
- One place to pick companies. The capsule's selection drives everything under it: What changed, the table, All guidance, the quotes, the chart and press. The chart key is a key, not a control. Print always shows all six.
- Two voices. What we compute or label is set in the system sans; management's verbatim words in the system serif. Quotes are never cut short on screen. Guidance values are data and may clamp, with the full text one hover or one fold away.
- Numbers lead. Tabular figures, the true minus, a sign on every change, each figure as reported with its period, and the period one click from its source. Every change names what it is compared against ("vs Q2 26"); every dash says why.
- Color has one job each. Company colors appear only in the chart (lines, key swatches, end dots, leaders). Green and red mean direction and always come with ▲ or ▼ and a sign. Coral is the brand mark only. Nothing relies on color alone.
- Spend boldness once: the dark capsule. Everything else is quiet: no shadow but the capsule's, no gradient, no hover lift.
- Every panel falls back to one grey sentence, and the page prints as a meeting handout whose page 1 stands alone.

## 2. Tokens
| Token | Value | Use (contrast on white / on paper) |
|---|---|---|
| `--paper` | #eef2f6 | the page, screen only; the table's header band |
| `--dot`, `--dot-pitch` | #d6dee7, 22px | 1px dot grid on the paper, screen only (texture, 1.2:1) |
| `--panel` | #ffffff | panels |
| `--hover` | #f5f7fa | table-row and fold-summary hover tint |
| `--ink` | #1b2a41 | text, wordmark, primary panel borders, pressed segments (14.4 / 12.8) |
| `--ink-2` | #4f5f74 | secondary text, labels, scope lines, axis text (6.5 / 5.8; 6.1 on `--hover`) |
| `--hairline` | #dbe2ea | separators inside panels, never a control edge |
| `--border-2` | #7f8c9d | secondary panel borders, category pills (3.4 / 3.0) |
| `--capsule` | #1b2a41 | the capsule. On it: text #ffffff (14.4), muted #c7d0dc (9.3), unpressed pill edge #8fa0b6 (5.4), hover fill rgba(255,255,255,.12), focus ring #ffd166 (10.0) |
| `--shadow` | 0 6px 16px rgba(27,42,65,.18) | under the capsule only |
| `--accent` | #ff6b4a | the mark's centre dot only, never data (ΔE 20.7 from `--down`) |
| `--link` | #1d4ed8 | links to company documents and in-page links (6.7 / 6.0) |
| `--up`, `--down` | #157a3a, #b42334 | ▲/▼ changes, Raised, Cut (5.4 / 4.8; 6.5 / 5.8) |
| `--focus` | #1d4ed8 | the focus ring on white and paper |
| Chart | grid #e6ebf1, axis text #4f5f74, baseline #c9d3dd, benchmark #6b7a8f, events #8a97a8 | section 7 |

Type: the system stacks only. Sans `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`; serif `"Iowan Old Style", Charter, Georgia, "Times New Roman", serif`. Major third (1.25) from 14px, rounded. Sentence case everywhere; no uppercase labels, no letter-spaced capitals.

| Role | Size / line height / weight |
|---|---|
| Wordmark | 35 / 1 / 700, −0.03em (28 at 720px and below) |
| Panel title, chart headline | 22 / 1.15 / 600, −0.01em |
| Lead figure (organic growth) | 28 / 1 / 500, −0.01em (26 in the company blocks) |
| Table headline | 20 / 1.25 / 400, its figures 600 (16 at 720px and below) |
| Margin figure | 17 / 1.1 / 600 |
| Quote | serif 17 / 1.6 / 400, measure 62ch of the serif itself (about 37rem; `ch` on a sans container comes out narrower) |
| Body, table cells, press titles | 14 / 1.45 / 400 |
| Small: labels, scope lines, periods, status lines, meta | 12 / 1.45 / 400 |
| Pills, track segments | 13 / 500 |

`font-variant-numeric: tabular-nums lining-nums` on figures, table cells, dates and the history grid, not on running text.

Spacing 4 8 12 16 24 32 48 (`--sp-1` to `--sp-7`); panels 16px apart with 20px padding (12, 16 and 12 at 720px and below). Radii: 12px panels, 999px pills and the capsule, square inside panels (6px in print). Layout: max width 1280px, 24px gutters; breakpoints 1100px (tight table), 960px (company blocks, two columns) and 720px (phone). Breakpoints are screen-only (`@media screen and (max-width: …)`): an A4 page is about 703px wide and Letter about 725px, so print would otherwise pick up the phone layout. Print has its own rules (D6). Tap targets 32px. Motion: 150ms color transitions and the chevron turn only, none under `prefers-reduced-motion`.

Status glyphs, always with the word: ▲ Raised, ▼ Cut, = Held, + New, × Withdrawn. Changes: a sign plus ▲ or ▼ ("▲ +0.2 pp").

## 3. Rule changes (2026-10-26)
- Grey dotted paper replaces the white page on screen; print stays white.
- One shadow on the page, under the capsule. No other shadow, gradient, tinted panel or hover lift.
- Rounded white panels in two border weights, pills for controls, square corners inside panels. K1's rules on white go.
- Company colors only in the chart. The chip edges (K2) and the card top rules (K4) go.
- The inline SVG mark, six ink dots around one coral dot. Coral appears nowhere else.
- One filter, solo first, in a pinned capsule. No company is ever locked, and there is no per-row "Only". K2's tick rule goes.
- The chart key is a key: a legend click no longer changes the selection (K6's legend filter goes).
- What changed sits under the capsule and follows the selection.
- The quotes grid replaces quote rows (Q2).
- Print draws the chart with all six companies (the v2.0 out-of-scope line "Redrawing the chart for print" goes).

## 4. Must items
Every item is a Must. Each names its files, the mockup it comes from (in `prompts/design/cowork/final/`) and a check a reader can do in a browser. Letters match sessions: A is 20a, B is 20b, C is 20c, D is 20d.

### 20a Look: paper, panels, type, controls

- **A1 Tokens and paper** (style.css). Section 2's tokens replace today's on `:root`. The body is the paper with the dot grid (`radial-gradient(circle, var(--dot) 1px, transparent 1.2px) 0 0 / 22px 22px`) on screen; print is white. The `.kicker` style (uppercase, tracked) goes: labels are sentence case at 12px `--ink-2`. Every `max-width` breakpoint in style.css becomes screen-only (section 2), and the print rules that only undid a phone layout go. Mockup: top-1440.png.
  - Check: at 1440 the page is grey with faint dots behind white panels, and no label on the page is in capitals; print preview is white with no dots.
- **A2 Header and mark** (index.html, style.css). h1 "Holdco Intel" at 35/700, then the mark: inline SVG, `aria-hidden="true"`, viewBox 0 0 20 20, six ink dots (r 1.9) on a ring of radius 7.2 around one coral dot (r 3.2) at the centre, 0.62em tall (final/mark.svg is the same drawing). The tagline and the "as of" line keep today's words until step 21; tagline 14px `--ink-2` under the wordmark, "as of" and GitHub 12px `--ink-2` at the right. 12px of paper above the wordmark (the mockup has 20; the first screen needs the room). At 720px and below: one column, the wordmark at 28px, the tagline and "as of" at 12px, and the GitHub link moves to the footer (A7). Mockup: top-1440.png, top-375.png.
  - Check: six dark dots ring a coral one beside the title; a screen reader reads "Holdco Intel" and nothing for the mark; at 375 the header has no GitHub link.
- **A3 Panels** (index.html, style.css). Every section is a white panel with a 12px radius. Primary panels (the scorecards panel, from 20c the peer table, and the chart) have a 2px `--ink` border; secondary panels (What changed, the two folds, In their words, press) a 1px `--border-2` border. Anatomy: a header row (h2 at 22/600, a 12px `--ink-2` scope line, the panel's own controls at the right), a 1px `--hairline` under it, then the body (12px top, 20px sides, 16px bottom). Panels sit 16px apart in a 1280px column with 24px gutters. The chart's h2 becomes "Share price" with the scope line "Rebased to 100 at the start of the window". Until 20b the chip row and until 20c the cards stay inside the scorecards panel as they are. Mockup: full-1440.png.
  - Check: at 1440 the scorecards panel and the chart have a heavier dark border than the others, every panel title sits inside its panel, and nothing casts a shadow.
- **A4 Pill tracks** (index.html, app.js where `renderQuotes` and `renderChart` build buttons, style.css). The theme buttons and the window buttons become joined tracks: one 1px `--ink` outline, 32px segments at 13/500 divided by 1px `--ink` lines, the pressed segment filled `--ink` with white text, hover `--paper`. The S&P 500 toggle is a single pill in the same family ("- - - S&P 500", pressed filled `--ink`). They sit in the panel header's controls. A focus ring inside a pressed (ink) segment is white, since `--focus` on ink is 2.2:1. Replaces Q1's and K6's underlined text buttons. Mockup: scrolled-1440.png, components.png.
  - Check: Tab to "Outlook" and to the pressed "YTD": both show a clear ring; the tracks look nothing like the company filter.
- **A5 Folds** (index.html, style.css, app.js `renderGuidanceFold` and `renderKpis`). Each `<details>` is a secondary panel whose `<summary>` is its header row: a chevron that turns when open, the title, the count line ("15 records: 1 raised, 2 new, 12 held"; "organic growth, 8 quarters as reported") and "Show" or "Hide" at the right in `--ink-2`; the row tints `--hover` on hover. Content as Q6 (section 5), including the one "No guidance on file: Omnicom, Dentsu" line, by name, never an empty company heading. Company names in All guidance's headings and in the history grid's first column are plain text: no chip, no color edge. The definitions become a plain list after the grid (no longer a nested closed `<details>`) with `id="definitions"` and `tabindex="-1"`, open on screen and in print. Quarterly history keeps its blue-to-red scale (green-to-red fails for color-blind readers) but lighter: at most 18% tint over white, text always `--ink`. Its Δ column header reads "Change" with the `title` "Change vs the quarter before". Mockup: full-1440.png, print-p2.png (except its empty company headings).
  - Check: hover a fold and the whole row tints; Enter opens it and "Hide" replaces "Show"; All guidance lists no company without records; neither fold shows a company color.
- **A6 Loading, missing and empty states** (index.html, app.js `empty` and `failPanel`, style.css). Before the JSON arrives each panel shows its header row and one grey "Loading…" line (static in index.html, replaced on render; no shimmer). A missing or empty file shows the panel's existing grey sentence, padded like body text. While a panel is loading or empty its computed scope and count lines stay blank (the fold counts, the press scope); the fixed ones ("Verbatim from company documents", "Rebased to 100 at the start of the window") stay, as in the mockups (maintainer, 2026-10-26). Mockup: state-loading-1440.png, state-empty-1440.png (except their stale counts and the unpadded table sentence).
  - Check: rename press_releases.json locally: the press panel shows its title and one grey sentence in line with other panels' text, and no "key releases of" count.
- **A7 Data health and footer** (index.html, style.css, app.js `renderHealth`). Data health sits on the paper, not in a panel: 12px `--ink-2`, "Data health." in 600 `--ink`, then the run line and the status.json link; the disclaimer under it; on phones the GitHub link joins it. A warning ("16/17 sources healthy", a failing source's name) is `--ink` at 600, never red: red means direction only (20a polish, 2026-10-26). Mockup: full-1440.png (bottom).
  - Check: the footer has no border and no white box.

### 20b Filter and What changed

- **B1 The capsule** (index.html, style.css, app.js where the chip row is built). Replaces K2's chip row (`.compare`, `.compare-chip`, `.compare-note`), which leaves the scorecards panel. Between the header and the first panel, a full-width band in the paper (with the dots), `position: sticky; top: 0`, with 12px of paper above the capsule and 20px below it (8px and 16px at 720px and below), so nothing scrolls into view above it and the panel behind never shows as a cut line. The capsule: `--capsule` fill, 999px radius, 52px tall, the page's one shadow. Inside, left to right: the mark at 22px (its ink dots white), "Peer set" (12px, the group's label), the `role="group"` of pills ("All", then each code from companies.json), and for a subset "Showing 2 of 6 · Reset" ("Showing WPP only · Reset") at the right. Pills: 32px, 13/500, transparent with a 1px #8fa0b6 edge and white text; pressed: white fill, `--ink` text, "✓ " before the code; hover rgba(255,255,255,.12); focus ring 2px #ffd166. No company colors. From 721 to 960px the capsule stays one row: the "Showing…" words hide, and the "Peer set" label too where needed (it stays the group's accessible name); Reset stays. With companies.json missing the capsule shows no pills. The band is hidden in print, and the capsule's mark is `aria-hidden`. `html { scroll-padding-top: 100px }` (72px at 720px and below) keeps the band off a focused control and off in-page jumps. Mockup: top-1440.png, scrolled-1440.png, wpp-top-1440.png.
  - Check: scroll to the chart and the capsule stays at the top with nothing above it; with five companies selected the capsule is one row at 721 and at 840; Shift+Tab back up from the chart and every focused control is fully visible below the capsule.
- **B2 Solo-first click rule** (app.js `toggleCompany` replaced, `setSelection`). With all six shown, "All" is pressed and the company pills are not. From there, a company click shows that company only. In a subset, a click on an unpressed company adds it and a click on a pressed one removes it; removing the last one returns to all six. "All", "Reset" and Esc show all six. No pill is ever disabled, and the "At least one company stays shown" message goes. The hash is unchanged (`#WPP`, `#PUB,WPP`, empty for all; old links work; unknown codes are ignored). `#announce` says "Showing all companies", "Showing WPP only" or "Showing Publicis Groupe, WPP". The cost: showing five of six takes five clicks; peer comparisons usually start from one or two. Counts in words ("all six", "2 of 6") come from companies.json, never a fixed six, in every scope line that uses one: the capsule, What changed (B5), the table (C4), the quotes (D4) and press (D5; today `renderPress` hardcodes "All six companies"). Mockup: components.png (filter pills), wpp-top-1440.png.
  - Check: from all six, click WPP and only WPP shows with "Showing WPP only · Reset"; click PUB and both show; click WPP, then PUB, and all six return with "All" pressed; `/#PUB,WPP` opens with both pressed.
- **B3 Phone opener** (index.html, app.js, style.css; 720px and below). The capsule is one 44px row: the mark and a button "Peer set: all six ▾" ("Peer set: PUB, WPP ▾" for one or two companies, "Peer set: 5 of 6 ▾" for more, with Reset on the same row), with `aria-expanded` and `aria-controls` naming the pill group. Open, the pill grid shows in two rows inside the capsule. It closes after a choice, on Reset, on Esc, or on a second tap. Mockup: top-375.png, filter-open-375.png.
  - Check: at 375 tap the opener, then WPP: the grid closes and the opener reads "Peer set: WPP ▾"; with five selected the closed capsule is one row at 375 and at 320.
- **B4 The chart key is not a control** (app.js `drawChart`, `renderChart`). The chart draws only the selected companies plus the benchmark; unselected companies are left out of the traces (no `legendonly`). The `plotly_legendclick` and `plotly_legenddoubleclick` handlers go; until D2's HTML key the Plotly legend stays with `itemclick: false` and `itemdoubleclick: false`. The S&P 500 pill stays the benchmark's only control. Mockup: scrolled-1440.png.
  - Check: click "WPP" in the chart legend and nothing changes; the capsule is the only way to hide WPP.
- **B5 What changed** (app.js `renderChanges` rewritten and redrawn by `setSelection`, index.html, style.css). It follows the selection, with the scope line "All six companies", "PUB, WPP" or "WPP". Two columns above 720px, one at 720px and below; names, not codes.
  - **Coming up:** results, capital markets days and deals (`MARKER_TYPES`) in the next 14 days, soonest first, at most 3 rows, then a muted "and 2 more". A row reads "Omnicom Q3 results · 20 Oct (est.) ↗ · in 5 days" (the period from the event title, for results only; "capital markets day" and "deal" as the type words); the date links to `source_url`; "(est.)" when unconfirmed; "tomorrow"; a "Reports today" pill on the day. AGMs stay out. Empty: "No results, capital markets days or deals in the next 14 days."
  - **Guidance, last 30 days:** raised, cut, new and withdrawn records set in the last 30 days, newest first, at most 3 rows: glyph and word, company name, metric and period, value, the dated link. None: "No guidance raised, cut, set or withdrawn." Then held records fold into one line, "Reaffirmed Publicis Groupe 13 Oct, Havas 14 Oct" (each company once, at its newest held date). Then "See all guidance" on its own line ("See all guidance, 2 more moves" when rows were left out), which opens All guidance and moves focus to its summary.
  - The separators hide at 720px and below. Print shows all six (D6). Mockup: top-1440.png, wpp-top-1440.png.
  - Check: `/#WPP` shows only WPP's events (or Coming up's empty sentence) under the scope "WPP"; with all six the Reaffirmed line names each company once; "See all guidance" opens the fold.
- **B6 Esc** (app.js, the one `keydown` handler; R6 amended). If the phone opener is open, Esc closes it and does nothing else. Otherwise it shows all six, collapses an expanded press list and unpins a KPI cell, as today. Never a second listener.
  - Check: at 375 open the opener and press Esc: it closes and the selection stays; Esc again shows all six.

### 20c Peer table

- **C1 The table** (index.html, app.js `renderCards` and its card helpers replaced, style.css). Replaces K3, K4 and the card CSS. The scorecards panel becomes "Peer table", a primary panel. A `<table class="comps">` inside a `.comps-wrap` wrapper, with a visually hidden `<caption>` ("Peer table: the latest reported figures for the companies shown"), one header row of `th scope="col"` (Company · Organic growth · Change · Margin · Top line guidance · Profit guidance · Shares YTD · On results · Next results) and one row per selected company in companies.json order, its `th scope="row"` holding the name (600, `--ink`; no code, no color). The header row sits on a `--paper` band in 12px `--ink-2`, each numeric header aligned with its figures (right). Rows have hairlines, 7px top and bottom padding (the mockup has 9; the first screen needs the room) and a `--hover` tint on hover. Below 961px the table scrolls inside its panel until D1 replaces it there. Print shows all six (D6). Mockup: top-1440.png.
  - Check: a screen reader reads each growth cell with its company and column ("Omnicom, Organic growth, …"); every numeric header sits right above its figures.
- **C2 Growth and Change** (app.js). Organic growth: the latest row's figure (`latestRow`) at 28/500, and under it the period ("Q3 26") linked to that row's `source_url` through `safeUrl`, `rel="noopener noreferrer"`, `aria-label` "Publicis Groupe Q3 26 source". Change (maintainer, 2026-10-26: say what the change is measured against): "▲ +0.2 pp" in 12px `--up` or `--down`, and under it, in the same small `--ink-2` line as the period, its base: "vs Q2 26", always the quarter directly before ("vs Q4 25" across a year end). A dash says why under it: "half-year" (a half-year figure, Dentsu), "full-year", or "no Q1 26" (the quarter before is missing, Stagwell). The cell's `title` keeps the full sentence ("+0.2 pp, Q3 26 vs Q2 26"; "No Q1 26 figure to compare"), and its accessible text reads "up 0.2 points vs Q2 26". Mockup: top-1440.png, plus this rule (the mockup shows the change without its base).
  - Check: without hovering, every Change cell names a quarter or a reason; Publicis Groupe reads "▲ +0.2 pp" over "vs Q2 26".
- **C3 Margin, guidance, shares and next** (app.js).
  - **Margin:** the figure at 17/600; under it the period link, a comma, and the short basis (`margin_metric` without a trailing " margin"); the full wording in `title`; 196px minimum at 1101px and above so the basis fits one line where it can; a null basis shows the period only.
  - **Top line and Profit guidance:** G2's headline-record rule as K4 had it (Top line: organic_growth, else revenue; Profit: operating_margin, else eps; a period in the current year first). The value at 600, at most two lines (three from 961 to 1100px), its full text in `title` and in All guidance. A muted prefix names a fallback metric ("Revenue", "EPS") and any period that is not FY of the current year ("H2 2026:"). Under it the status line "= Held · 13 Oct ↗": Held in `--ink-2`; ▲ Raised and ▼ Cut in `--up` and `--down`; + New at 600 `--ink`; × Withdrawn struck through; the date links to `source_url`. A metric with no record shows "–" (`title` "No record"); a company with no current record shows "No guidance on file" in Top line and "–" in Profit, in `--ink-2`.
  - **Shares YTD:** "+12.9%" at 600, from the same start as the chart's YTD.
  - **On results:** the two-day move at 600 with its period under it ("Q3"); "pending" muted until the close after results day exists; `title` "close before results day to close after it".
  - **Next results:** the date linked to its source, "(est.)" when unconfirmed, the period under it ("Q3", "FY"); a "Reports today" pill on the day; "No date yet" when none.
  - Mockup: top-1440.png.
  - Check: three rows match a hand check against kpis, guidance, events and prices, including the two-day move; Omnicom's row shows its revenue and EPS guidance (curated 26 Oct).
- **C4 Headline** (app.js, style.css). On the panel title's row, where a scope line would sit (the mockup puts it on a second row; the first screen needs the room), 20px with its figures at 600. From the shown companies' latest growth figures, lead = highest and trail = lowest, each with its own period: "Omnicom grows fastest at +6.1% (Q2), WPP is shrinking at −2.8% (Q2)." When the trail is zero or above: "…, Havas grows slowest at +2.4% (Q3)." When all are negative: "{lead} shrinks least at …, {trail} shrinks most at …". A tie goes to the first in companies.json order, and the trail is never the lead company; companies without a figure are left out; with fewer than two figures the headline hides and the scope line ("WPP") shows. It wraps under the title below 961px. Names come from companies.json via `textContent`. Mockup: top-1440.png.
  - Check: `/#PUB,HAVAS` reads "Publicis Groupe grows fastest at +5% (Q3), Havas grows slowest at +2.4% (Q3)."
- **C5 Foot line** (app.js, style.css). One 12px line under the table: "Latest reported figures, as stated. Growth and margin as each company defines them. Definitions". "Definitions" opens Quarterly history and moves focus to `#definitions` (A5). Mockup: full-1440.png.
  - Check: click "Definitions": Quarterly history opens with its definitions in view below the capsule.
- **C6 Formatting rules** (app.js `signedPct`, `kpiText`, the change text, the history cells, the headline). The true minus (U+2212) on every computed signed figure, never a hyphen; "+" on positives; a value that rounds to zero reads "0.0%". Data text (guidance values) stays as written. "–" (en dash) means missing and always has a `title` saying why. Plurals: "1 day", "1 release", "1 record". Dates: "20 Oct" in the current year, "2 Feb 2027" otherwise.
  - Check: a negative growth figure reads with a true minus ("−2.8%", not "-2.8%") and lines up with the positive figures in its column.
- **C7 Widths and the first screen** (style.css). From 961 to 1100px every column fits without the table scrolling: 6px cell padding, company column 120px, guidance clamped at three lines, "(est.)" under the date. Mockup: top-1024.png shows the cut-off this fixes.
  - Check: at 1024, `.comps-wrap` has `scrollWidth` equal to its `clientWidth` and "Next results" is whole; at 1440×900 (a DevTools viewport, all six, the build day's data) the last table row ends at or above 860px.

### 20d Phone, chart, quotes, press, print

- **D1 Company blocks** (app.js, style.css; 960px and below). Replaces K5's swipe row. Inside the Peer table panel, one block per selected company with hairlines between: two columns from 721 to 960px, one at 720px and below. Each block: the name at 600, then a `dl` with a 92px label column. Organic growth: the figure at 26px, the period link, then the change and its base kept together ("▲ +0.2 pp vs Q2 26"). Margin: figure, period link, basis. Top line and Profit: the value with its status line inline; Profit clamps at three lines with the full text in `title`. Shares: "YTD +12.9% · Q3 results +1.3%", each pair kept on one line. Next: "Q3 results, 29 Oct (est.) ↗". The foot line under the last block. Mockup: top-375.png, top-840.png, full-375.png.
  - Check: at 375×812 the capsule and Publicis Groupe's growth figure are on the first screen; `document.documentElement.scrollWidth` is 375 (320 at 320).
- **D2 Chart frame and key** (index.html, app.js `drawChart`, style.css). The header row: "Share price", its scope line, then the window track and the S&P 500 pill at the right. Under it the headline (22/600, today's rule, the benchmark figure muted at 14px: "YTD: Stagwell leads +86.7%, Omnicom trails 0.0% S&P 500 +13.1%"; one company: "YTD: WPP +15.1%"). Then an HTML key (`<ul>`): an 18px line swatch in the company color (through `safeColor`) and the full name for each shown company, the dashed benchmark swatch with its name, and, when a subset is shown, "▾ Results, capital markets days and deals" in `--ink-2`. Names via `textContent`. Plotly's legend is off. The plot is 440px tall (400 from 721 to 960px, 420 at 720px and below); the footnote stays under it. Mockup: scrolled-1440.png.
  - Check: with all six the key lists six names and the S&P 500; with `#WPP` it shows WPP, the S&P 500 and the event line.
- **D3 Chart marks** (app.js `drawChart`, `placeEndLabels`; section 7). Lines 2px in the company colors; the benchmark 1.5px dashed #6b7a8f. At each line's last point, an 8px dot in the company color with a 2px white ring, and the code in `--ink` beside it, codes at least 12px apart. When spacing moves a code off its line's end, a 1px leader in the company color joins the dot to the code (an annotation with `showarrow: true, arrowhead: 0`). X-axis ticks by window: 1M and 3M "%-d %b", YTD "%b", 1Y and 2Y "%b %Y". Every company name, benchmark name, title and code that reaches hover text or an annotation goes through `escapeHtml`, including a trace's `meta`. Event markers only for a subset, as today. Mockup: scrolled-1440.png, plus the leaders.
  - Check: at 1440 YTD the bunched WPP, PUB and DENTSU codes each join their own line end; the 2Y ticks read "Jan 2025"; in a grayscale screenshot every code still leads to its line.
- **D4 Quotes grid** (app.js `renderQuotes` and `quoteRow`, style.css). Replaces Q2's rows. A grid of cells in companies.json order, three columns (two from 721 to 960px, one at 720px and below). Each cell: the company name at 600 (no code) with the age at the right (12px `--ink-2`); the quote in the serif at 17/1.6 inside curly quotes, the opening one hanging (`text-indent: -0.45em`), never clamped, at most 62ch; then the speaker (left out when null), the source label and the date link in 12px `--ink-2`, the date and its ↗ never split. Companies with no quote on the theme fold into one muted line under the grid, by name: "No Strategy quote yet: Dentsu". One company (Q4): the track hides and the grid shows one cell per theme that has a quote, labelled by theme in Q4's order, then "No quote yet on: …". Mockup: full-1440.png, wpp-top-1440.png.
  - Check: Strategy with all six shows one cell per company with a Strategy quote and one muted line naming the rest; `/#WPP` shows one cell per theme WPP has a quote on.
- **D5 Press rows** (app.js `renderPress`, style.css). A row is: the date (12px `--ink-2`), the code (12/600), the category as a small outlined pill (11px, `--border-2` edge, `--ink-2` text) in a fixed 110px column (key rows only), then the title in `--ink` with its ↗ in `--ink-2`, underlined on hover and focus. Other releases' titles are `--ink-2`. "Show 14 other releases" and "Show fewer" are pills. At 720px and below the title takes its own line under date, code and pill, and the collapsed list shows at most 8 key rows, then "Show 6 more key releases" (the first thing to cut if the session runs long). P1 to P3 otherwise unchanged. Mockup: scrolled-1440.png, full-375.png.
  - Check: press titles are dark text, not blue; at 375 the collapsed list ends after 8 key rows.
- **D6 Print** (style.css `@media print`, app.js `beforeprint`/`afterprint`). Replaces K7 and Q7; amends M6. A handout on A4 or Letter with 12mm margins and no forced page size. Print has its own layout and never takes a screen breakpoint's (section 2): the table, never the company blocks; What changed in two columns; the desktop header; body 11px, lead figure 18px, margin figure 13px, 5px cell padding. White page, no dots, no capsule, no controls (tracks, pills, fold cues, show buttons), "See all guidance" and "Definitions" hidden, 1px panel borders with a 6px radius, links in `--ink` without ↗. Page 1: the header, What changed and the whole peer table with its foot (`break-after: page` on the table panel). What changed, the table, All guidance, the quotes (the pressed theme, its name shown), the chart and press (every release, expanded) all show all six companies whatever the screen selection, and the screen comes back afterwards. The chart redraws for print with all six at A4's content width (so it fits Letter too) and 260px tall, every end code whole, the footnote kept. `break-inside: avoid` on table rows, quote cells, guidance lines and press rows; `h2 { break-after: avoid }`. Mockup: print.pdf, print-p1.png to print-p4.png (except the clipped end codes and the missing footnote on p3).
  - Check: with only WPP selected, print preview on A4 and on Letter: page 1 holds the header, What changed and all six table rows; at most 4 pages; every chart end code is whole; the footnote prints; nothing is split.
- **D7 ARCHITECTURE.md section 7** (docs/ARCHITECTURE.md). Describes the Plot Sheet page: the order, the capsule as the one control (solo first), What changed following it, the peer table, the chart key as a key, print with all six.
  - Check: section 7 no longer mentions chips, cards or a legend click.

## 5. Kept from v2.0 (amended where noted)
- **Q3 Which quote shows.** Unchanged: Strategy prefers investor_day, annual_report or strategy_plan up to 365 days old, else the newest; other themes the newest; ties: a named speaker, then call_transcript over results_release, then the lower `id`.
- **Q4 One company selected.** Unchanged rules; the layout is D4's grid.
- **Q5 Empty states.** A missing or empty commentary.json shows "No management quotes on file yet." and hides the track. Per-company gaps fold into one line (D4).
- **Q6 Folded sections, content.** All guidance: G1's summary line, every current record as a G3 line, in companies.json order, following the selection, companies with nothing on file in one "No guidance on file: …" line. Quarterly history: the growth grid and the definitions; opening it at 720px and below scrolls the grid to the newest quarter on `toggle`. What changed's link opens All guidance. Look: A5.
- **P1 to P3 Press.** Key releases first with "Show N other releases", the scope line, badges in words, Esc collapses, print shows every release. Look: D5.
- **G1, G3** survive inside All guidance.
- **M5 Focus ring,** amended: 2px `--focus` (#1d4ed8) with a 2px offset on white and paper, #ffd166 on the capsule, white inside a pressed track segment. B1's `scroll-padding-top` keeps focus clear of the capsule.
- **M6 Print,** amended by D6. `print-color-adjust: exact`; `@page { margin: 12mm }`; no mode bar to hide (`displayModeBar: false`).
- **M7 Chart legibility,** amended: at 720px and below the key wraps to at most 3 rows and the x-axis shows at most 4 ticks; heights as D2.
- **M8 Color-blind safety,** amended: brand hex values unchanged, lines 2px, and the end dot, the code in `--ink` and the leader carry identity. PUB and OMC are close (ΔE 3.3 for color-blind readers, 12.1 for normal vision), so their codes and the key carry them.
- **R2 End labels do not overlap,** over shown lines only, now with leaders (D3).
- **R6 One Esc handler,** amended by B6.
- **S2** Hide the chart's controls when the chart shows its empty state.

## 6. Interactivity
| Behavior | Trigger | Keyboard | Esc |
|---|---|---|---|
| Company pills (B2) | click: solo first, then add or remove | Tab, Enter/Space; `aria-pressed` | shows all six |
| All, Reset | click | Enter/Space | n/a |
| Phone opener (B3) | tap | Enter/Space; `aria-expanded` | closes it, nothing else |
| Chart key (D2) | none: a key | n/a | n/a |
| Window track | click | Enter/Space; `aria-pressed` | no change |
| S&P 500 pill | click | Enter/Space; `aria-pressed` | no change |
| Theme track | click | Enter/Space; `aria-pressed` | no change |
| Folds | click the header row | Enter/Space (native `<details>`) | no change |
| Press other releases | "Show N other releases" / "Show fewer" | Enter/Space; `aria-expanded` | collapses |
| KPI cell pin | click or focus | Tab | unpins |

## 7. Chart spec (replaces the v2.0 chart spec)
```
config {displaylogo:false, responsive:true, displayModeBar:false}
company trace {type:'scatter', mode:'lines', name:escapeHtml(name), meta:escapeHtml(name), line:{width:2, color:safeColor(<company>)},
  hovertemplate:'%{meta}: %{y:.1f}<extra></extra>'}
benchmark {line:{width:1.5, color:'#6b7a8f', dash:'dash'}, same hovertemplate}
end dots {mode:'markers', showlegend:false, hoverinfo:'skip', marker:{size:8, color:<company>, line:{color:'#ffffff', width:2}}}
events (subset only): lines {line:{color:'#8a97a8', width:1, dash:'dot'}, hoverinfo:'skip'};
  markers {marker:{symbol:'triangle-down', size:8, color:'#8a97a8'}, hovertext escaped, one per date}
layout {height:440 (400 from 721 to 960px, 420 at 720px and below; 260 in print),
  margin:{l:44, r:64, t:12, b:36}, hovermode:'x unified', showlegend:false,
  hoverlabel:{bgcolor:'#ffffff', bordercolor:'#c9d3dd', font:{size:12, family:<sans>, color:'#1b2a41'}},
  xaxis:{type:'date', showgrid:false, showline:true, linecolor:'#c9d3dd', ticks:'outside', ticklen:4,
    tickcolor:'#c9d3dd', tickformat: 1M/3M '%-d %b', YTD '%b', 1Y/2Y '%b %Y', automargin:true,
    nticks: 11 (4 at 720px and below), tickfont:{size:12, color:'#4f5f74'}},
  yaxis:{gridcolor:'#e6ebf1', zeroline:false, ticksuffix:' ', automargin:true, nticks:7, tickfont:{size:12, color:'#4f5f74'}},
  shapes: baseline at 100 {line:{color:'#c9d3dd', width:1}},
  annotations: per shown line {x, y at the line's last point, text:escapeHtml(code), font:{color:'#1b2a41', size:12}, xanchor:'left',
    in place: showarrow:false, xshift:8;
    moved: showarrow:true, arrowhead:0, arrowwidth:1, arrowcolor:<company>, ax:16, ay:<the move in px>, no xshift},
  paper_bgcolor:'#ffffff', plot_bgcolor:'#ffffff', font:{family:<sans>, size:12, color:'#1b2a41'}}
no layout.transition (with one, Plotly.react froze the y range after a selection change)
```
Event hover text: "Publicis Groupe · Deal · {title}"; events on one date share one marker whose hover lists each, one per line.

## 8. Sessions (about 90 minutes each, in this order)
The look goes first so nothing is styled twice.
- **20a Look:** A1 to A7.
- **20b Filter and What changed:** B1 to B6. If it runs long, B5 becomes 20b2 in a fresh session.
- **20c Peer table:** C1 to C7.
- **20d Phone, chart, quotes, press, print:** D1 to D7. If it runs long, D5's phone cap goes first; if D1 to D3 alone fill the session, D4 and D5 become 20e.
- **Whole-page checks after 20d:** at 1440, all six, the page is at most 3,390px tall (today 3,080, plus 10%); print is at most 4 pages on A4 and on Letter; the phone page is judged on its first screen (D1), since six blocks replace one swipe card (the mockup measured 5,554 against today's 4,357); no company color appears outside the chart.
- **Step 21:** S3, dates read "9 Oct 2026, 01:51 UTC". The intro line replaces the tagline, and the freshness note ("Prices as of 16 Oct 2026, 00:35 UTC. Curated 15 Oct 2026, 02:39 UTC.") replaces "as of" at the header's right (top-1440.png shows both). The mark becomes the favicon (final/mark.svg as a `data:` URI). Needing a yes there: the link-preview image (final/og-image.png) and a "Copy link" pill on the capsule.

## 9. Out of scope
- **Fonts from a CDN or self-hosted.** The system stacks only; DM Sans was tried in round 4 and declined (2026-10-26).
- **Market cap, 8-quarter bars, an "All themes" tab, LLM-written text.** Decided in v2.0 planning.
- **A peer median row.** The six growth figures cover different periods (Q3, Q2, H1).
- **Remembering the selection in the browser.** It is shared by link only.
- **Sparklines, D3 or any second chart library.** No new dependency.
- **Tailwind, a framework or a build step.**
- **Rich text in quotes or hover labels.** Text goes in via `textContent`; hover text is escaped.
- **Sorting the unified hover by value.** Plotly 2.35.2 has no option for it.
- **Sorting the table by a column, highlighting a line from the key, dark mode.** In the Backlog.
