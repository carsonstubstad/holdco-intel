# Design brief (approved 2026-10-09, rewritten for v2.0 on 2026-10-15)

Revision 2026-10-15 (step 16, maintainer pick): v2.0 page in direction A, "Broadsheet
ledger". Rules instead of boxes on a white page, small-caps kickers, our numbers in the
system sans and management's words in a system serif. Cards three per row, tick chips
(all ticked at the start, a click hides or shows one company), the Strategy tab prefers
strategy material, and one company selected folds its empty themes into one line. This
rewrite supersedes M1's panel order, M2, M3, M4, G1 to G6 (G1's summary line and G3's
record lines are reused in Q6), R1, R3 to R5 and section 5's tile and legend rows.
Kept: the tokens (with the changes in section 2), M5 to M8 (M6 amended by K7), R2, the
one Esc handler (R6, now resetting the selection), the chart spec, S2.
Revision 2026-10-15 (step 17 polish, maintainer): each card gets a light square box
(K4); the S&P 500 toggle matches the window buttons (K6); phone cards are wider and
shorter (K5). Step 20 runs a quality pass with the frontend-design and dataviz skills.
Revision 2026-10-15 (step 18 polish, maintainer): theme buttons on the left (Q1); an age
line under each quote's label, no period in the attribution (Q2); the lower id breaks a
tie (Q3); fold summaries say what is inside and look clickable (Q6).
Revision 2026-10-15 (step 19, as built): press follows the selection with key releases
first, a scope line, an "Other releases" label and badges in words (P1 to P3).
Earlier revisions (2026-10-11 and 2026-10-12) are in git history.

## 1. Principles
- Answer, per company: who is growing and is it speeding up, what margin it makes, what it guides to, how the market took its last results, and when it reports next. Share price is context and sits below the quotes.
- One selection. The chips decide which companies every panel shows. Cards, All guidance, quotes, chart and press always agree.
- Two voices. Everything we compute or copy as a number is set in the sans; management's verbatim words are set in the serif. Quotes are never cut short on screen.
- Numbers lead. Tabular figures, a sign on every change, each figure as reported, and every figure carries its period, basis or date.
- Color means company identity (a card's top rule, a chip's edge, a chart line) or direction (growth change, guidance status), never both at once, and never color alone. Share figures are plain text with a sign.
- Every panel falls back to one grey sentence, and the page prints as a meeting handout: all six cards, folded sections open, nothing split.

## 2. Tokens
| Property | Value |
|---|---|
| `--fs-xs/-sm/-base/-md/-lg/-xl` | 12 / 13 / 14 / 16 / 20 (h2, chart headline) / 24 (h1, card figure) px |
| `--fw-regular/--fw-strong` | 400 / 600 |
| `--sp-1…--sp-5` | 4 / 8 / 12 / 16 / 24 px |
| `--radius/--radius-chip/--radius-pill` | 8 / 3 / 999 px (cards and panels no longer use `--radius`) |
| Neutrals | keep `--panel --text --muted --faint --border --grid`; `--bg` becomes `#ffffff` (was `#f6f7f9`); add `--rule: #1f2328` |
| Type | add `--serif: "Iowan Old Style", Charter, Georgia, "Times New Roman", serif` (system fonts only, nothing from a CDN) |
| Layout | add `--measure: 68ch` (quote line length), `--tap: 32px` (minimum chip and theme-button height) |
| Status | keep `--up #1a7f37`, `--down #cf222e`, `--warn #9a6700`; `--focus: #0969da` |
| Chart | `--bench: #5f6368`, `--event: #c4c8cc` |

Kicker: a class, not a token. `.kicker { font-size: var(--fs-xs); font-weight: var(--fw-strong); text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted) }`.

Status glyphs, always with the word: ▲ Raised, ▼ Cut, = Held, + New, × Withdrawn. Direction: a sign plus ▲ or ▼ ("▲ +0.2 pp").

## 3. Must / Should for v2.0
Each item names its files and a check a reader can do in a browser. Step 17 items are K, step 18 items are Q, step 19 items are P.

### Step 17: chips, cards, chart

- **K1 Section heads** (style.css, index.html). Must. Panels lose their box: no background box, no border, no radius. Each panel opens with a 2px `--rule` top border, then its h2 at `--fs-lg`. The page background is `--bg` (white). Applies to every panel, including press and data health.
  - Check: at 1440px the page reads as one white sheet with black section rules; no grey page background and no rounded panel boxes.
- **K2 Tick chips** (index.html, app.js, style.css). Must. A `role="group"` row labelled "Companies", directly above the cards: "All", then each code from companies.json, each a `<button aria-pressed>`. All six start ticked (pressed, ✓ before the code, dark fill); "All" is pressed when all six are. A click on a code hides or shows that company. The last ticked company cannot be unticked (the click does nothing and `#announce` says "At least one company stays shown"). "All" and Esc tick all six. Under the row, a muted "Showing 4 of 6" when fewer than six are ticked. Each chip keeps the 3px company-color left edge (`safeColor`) and `min-height: var(--tap)`. The selection lives in one variable with one setter that redraws cards and chart, writes the hash (`#PUB,WPP`, cleared when all six) with `history.replaceState`, and announces "Showing Publicis Groupe, WPP". Old `#PUB` links still parse; unknown codes are ignored. A chart legend click on a company calls the same setter.
  - Check: open `/#PUB,WPP`, see two cards and two ticked chips; untick WPP, one card; press Esc, six cards and "All" pressed. Tab, Enter and Space work on every chip.
- **K3 Card grid** (style.css, app.js). Must. Three cards per row above 960px, two from 721px to 960px. Each card uses `grid-template-rows: subgrid` over the card rows so rows line up across a row of cards. Cards keep their column width when fewer are selected. Unselected cards are hidden on screen only (print shows all six, K7).
  - Check: at 1440px, two rows of three; the guidance rows of the three cards start at the same height. Untick three companies: the remaining cards keep their width.
- **K4 Ledger card** (app.js `renderScan` replaced, style.css `.card`). Must. A light square box (1px `--border`, no radius, `--sp-3` side padding) with a 3px top rule in the company color, the company name in bold with its code muted on the right, then rows separated by hairlines (`--border`). Each row opens with a kicker that states its period or basis.
  - **Organic growth · Q2 26**: the figure at `--fs-xl`, tabular, as reported; then the 12g delta "▲ +3.9 pp vs Q1" in `--up`/`--down`. "–" when the quarter before is missing (DENTSU half-years, STGW), with a `title` saying why.
  - **Margin · H1 26 · headline operating profit margin**: the figure at `--fs-xl`. The basis is `margin_metric` as worded in kpis.json and may wrap to two lines; when it is null the kicker shows the period only.
  - **Guidance**: two label/value lines, "Top line" (organic_growth, else revenue) and "Profit" (operating_margin, else eps), each by G2's headline-record rule (a period in the current year first). A muted prefix names the fallback metric ("Revenue", "EPS") and any period that is not FY of the current year ("H2 2026:"). The value wraps to at most three lines, full text in `title`. Under it: the status glyph and word, then the set date linked to `source_url` ("= Held · 6 Aug ↗"). A metric with no record shows "–". A company with no current record shows "No guidance on file" in the Top line slot and "–" for Profit, so the row keeps its height (OMC and DENTSU today).
  - **Shares**: "+16.9% YTD" (same start as the chart's YTD), then "Share move on H1 results +34.0%", both plain text color. The move's `title` is "close before results day to close after it". Before that close exists: "Share move on Q3 results: pending" muted. No price level, currency, 1D move or market cap.
  - **Next · Q3 · 29 Oct (est.)**: date linked to its source; "(est.)" when `confirmed` is false; a "Reports today" badge on the day; "No date yet" when none.
  - Check: three cards match the plan's hand table; at 1440×900 the chips and the whole first row of cards are visible without scrolling; in a grayscale screenshot every status and direction still reads.
- **K5 Phone swipe row** (style.css, at 720px and below; index.html for the region). Must. The cards become one horizontal row: `display: flex; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain`. Each card `flex: 0 0 calc(100vw - 48px); scroll-snap-align: start`, so the edge of the next card shows. The chart headline drops to `--fs-md`. The row may bleed to the screen edge with a negative inline margin equal to its container's side padding, plus matching `padding-inline` and `scroll-padding-inline`, and never more, so only the row scrolls sideways. 4px block padding keeps focus rings from being clipped (M5). The row is a region with `tabindex="0"` and `aria-label="Scorecards"`. Chips wrap to two lines.
  - Check: at 375px, `document.documentElement.scrollWidth` is 375; part of the next card shows; one swipe moves one card; the page never moves sideways.
- **K6 Chart follows the selection** (app.js `drawChart`, index.html, style.css). Must. Unselected companies stay in the legend as `legendonly`; the y-axis rescales to the shown lines. R2's end labels and their label range use shown lines only. Event lines and markers only when fewer than six are selected, and only theirs. The panel's h2 reads "Share price, rebased to 100" as a kicker, and the computed headline sits under it at `--fs-lg`, covering the shown companies; with one company, e.g. "YTD: WPP +15.1% · S&P 500 +13.1%" (no "leads"). Window buttons and the S&P 500 toggle become underlined text buttons (same pattern as Q1's theme buttons); the y-axis uses `nticks: 8`.
  - Check: untick STGW and the y-axis top drops; with all six, no event markers; a legend click hides WPP, its chip unticks, and a second click brings both back.
- **K7 Print, step 17** (style.css `@media print`). Must. Chips hidden; the hash is ignored on paper: all six cards in three columns, `overflow: visible` on the card row, `.card { break-inside: avoid }`. `break-inside: avoid` moves from `.panel` (M6) to items (cards, list rows), so tall panels do not leave blank pages. `h2 { break-after: avoid }`. The chart prints as shown on screen.
  - Check: untick to PUB only, open print preview on A4 and Letter: six cards in two rows, none cut, no chips.

### Step 18: In their words, folded sections

- **Q1 In their words panel** (index.html, app.js, style.css). Must. A `<section>` between the cards and the chart. h2 "In their words", muted subline "Verbatim from company documents". Theme buttons Strategy, AI & data, Clients, Outlook as `<button aria-pressed>` styled as underlined text (a 2px `--rule` underline on the pressed one), so they never look like the company chips, on the left directly under the subline (step 18 polish). Default Strategy. Follows the K2 selection.
  - Check: Tab to "Outlook", press Enter: every row changes to Outlook quotes.
- **Q2 Quote row** (app.js, style.css). Must. Desktop: three columns `7rem | minmax(0, var(--measure)) | 1fr`: the company chip with a muted `--fs-xs` age line under it ("today", "3 days ago", "5 months ago", whole months of 30 days, "over a year ago" from 365 days; not on "no quote" rows; step 18 polish); the quote in `--serif` at `--fs-md`, line height 1.5, inside curly quote marks, not italic, never clamped; the attribution in the sans, muted, `--fs-sm`: speaker (left out when null, never "Unknown"), then the source label, then the date linked to `source_url`, kept on one line ("Joanne Wilson, CFO · Call transcript · 6 Aug 2026 ↗"; no period, the date says it). Labels from a fixed map of the schema enum: Results release (also for a missing `source_type`), Call transcript, Results slides, Annual report, Investor day, Strategy plan, Announcement; anything else "Company document". Rows in companies.json order. From 721 to 960px two columns, the attribution under the quote. At 720px and below each row stacks: chip, quote at full width, attribution. Headlines from commentary.json are never shown.
  - Check: WPP's Outlook row shows "Joanne Wilson, CFO · Call transcript · 6 Aug 2026" and its link opens the PDF; no quote ends in "…".
- **Q3 Which quote shows** (app.js). Must. Strategy tab: the newest quote whose `source_type` is investor_day, annual_report or strategy_plan and whose `release_date` is at most 365 days before today; if none, the newest quote. Every other theme: the newest by `release_date`. Ties: a named speaker beats none, then call_transcript beats results_release, then the lower `id`. A blank speaker counts as none.
  - Check: OMC's Strategy row is the 12 Mar 2026 Investor Day quote (55% of revenue), not the 28 Jul release line; WPP's Strategy row is the 26 Feb 2026 investor day quote; WPP's AI & data row is Cindy Rose on the 6 Aug call, not the unattributed release line.
- **Q4 One company selected** (app.js). Must. The theme buttons hide. One row per theme that has a quote, in this order: Strategy, AI & data, Clients, Outlook, Performance, Capital allocation (Q3's rule per theme). Themes with no quote fold into one muted line: "No quote yet on: Strategy, Clients, Outlook, …".
  - Check: `/#WPP` shows six rows; `/#DENTSU` shows one quote and one grey line.
- **Q5 Empty states** (app.js). Must. A company with no quote on the theme: one muted line "No quote on this theme yet." at one line's height. Missing or empty commentary.json: "No management quotes on file yet." and the theme buttons hidden (as S2 does for the chart).
  - Check: Clients tab shows DENTSU's grey line; renaming commentary.json locally shows the empty sentence.
- **Q6 Folded sections** (index.html, app.js, style.css). Must. Two `<details>` directly under the cards, above In their words, each summary with a full-size `--text` ▸/▾ marker and an underline on hover. "All guidance (15) · 1 raised · 2 new · 12 held" (muted plain text, zero counts left out, following the selection): G1's summary line, then every current record in G3's line format (label, value, status, date link, quote), in companies.json order, following the selection; the guidance matrix panel and its CSS go. "Quarterly history · organic growth, as reported": the growth grid, its hint and definitions. Opening Quarterly history scrolls the grid to the newest quarter on the `toggle` event (this replaces M3: scrolling inside a closed `<details>` does nothing). What changed's link opens "All guidance" and moves focus to its summary.
  - Check: at 375px, open Quarterly history and Q3 2026 is visible; the What changed link opens All guidance.
- **Q7 Print and phone, step 18** (style.css, app.js). Must. Print: both `<details>` open (the `beforeprint`/`afterprint` pattern), In their words prints the pressed theme for all six companies with the theme name kept visible, `break-inside: avoid` on each quote row and guidance record line, not on the panels.
  - Check: print preview shows no quote split across pages and both folded sections open.

### Step 19: press

- **P1 Key releases first** (app.js, style.css). Must. Press follows the K2 selection (its own chip row is gone). Key categories are results, guidance, m_and_a, capital_markets, leadership, client and ai_and_products; key releases show first, newest first (higher id breaks a tie), then a "Show 14 other releases" button (singular for one) that becomes "Show fewer". When expanded, a muted `--fs-xs` "Other releases" label row sits before the rest, newest first. A selection with no key release shows all its releases and no button. Key rows are normal links; the rest are `--muted`.
  - Check: with all six, 14 key rows and "Show 14 other releases" (15 Oct data); `/#DENTSU` shows all six Dentsu rows and no button.
- **P2 Scope line and badges** (app.js, style.css). Must. A muted `--fs-xs` line above the list says what is shown: "All six companies · 14 key releases of 28", "PUB · 2 key releases of 3", "DENTSU · 6 releases, none key", or "… · all 28, key releases first" when expanded; it prints. Every key row carries its category in words: Results, Guidance, Deal, Capital markets, People, Client, AI & products.
  - Check: untick to PUB only and the line reads "PUB · 2 key releases of 3".
- **P3 Esc and print** (app.js). Must. R6's Esc collapses an expanded list and scrolls only when the button has gone above the top of the screen. Print shows every release for all six companies, expanded, and puts the screen state back afterwards.
  - Check: expand, scroll up to the cards, press Esc: the page does not jump; print preview lists all 28.

## 4. Kept from v1 (still in force)
- **M5 Focus ring.** `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`. Check: Tab through chips, theme buttons, window buttons and links; no ring is clipped (K5).
- **M6 Print.** Hide `.windows` and `.modebar`; `print-color-adjust: exact`; `@page { margin: 12mm }`; on `beforeprint`, `Plotly.Plots.resize`. Amended by K7: `break-inside: avoid` sits on items, not panels.
- **M7 Chart legibility.** At 720px and below the legend shows company codes and wraps to at most 4 rows, the x-axis uses at most 3 ticks, `#chart` is 420px tall (300px above 720px).
- **M8 Colorblind safety.** Brand hex values unchanged; end-of-line codes carry identity; line width 2.5. Check: in a grayscale screenshot every line can be identified.
- **R2 End labels do not overlap**, now over shown lines only (K6).
- **R6 One Esc handler** on `document`: ticks all six companies through the K2 setter and unpins a pinned KPI cell; it also collapses an expanded press list (P3). It never changes the theme or the chart window.
- **S2** Hide `.windows` when the chart shows its empty state.
- **G1 summary line and G3 record lines** survive only inside Q6's "All guidance".

## 5. Chart spec
```
margin {l:48, r:56, t:24, b:36}; hovermode 'x unified'
hoverlabel {bgcolor:'rgba(255,255,255,0.95)', bordercolor:'#d8dee4', font:{size:12}}
xaxis {showgrid:false, ticks:'outside', ticklen:4, tickformat:'%b %Y', automargin:true}
yaxis {gridcolor:'#eef0f2', zeroline:false, ticksuffix:' ', automargin:true}
legend {orientation:'h', x:0, y:1.08, yanchor:'bottom', font:{size:12}}
company line {width:2.5}; unselected company: visible 'legendonly'
end label annotation per shown series: code, font color = company color, xanchor 'left'
benchmark {color:'#5f6368', width:1.5, dash:'dash'}
event lines {color:'#c4c8cc', width:1, dash:'dot'}; markers {size:7, color:'#80868b'}
  (only when fewer than six companies are selected)
baseline 100 {color:'#d8dee4', width:1, solid}
config {displaylogo:false, modeBarButtonsToRemove:['lasso2d','select2d','zoomIn2d','zoomOut2d','autoScale2d']}
no layout.transition (with one, Plotly.react froze the y range after a selection change); font family = the page's sans stack
yaxis nticks: 8 (6 still showed only two labels)
```
Event hover text: "Publicis Groupe · Deal · {title}"; events on one date share one marker whose hover lists each, one per line. Company names and titles go through `escapeHtml`.

## 6. Interactivity spec
| Behavior | Trigger | Keyboard | Esc |
|---|---|---|---|
| Company chips (K2) | click a code to hide or show; "All" ticks all six | Tab, then Enter/Space; `aria-pressed` | ticks all six |
| Chart legend (K6) | click a company: same setter as its chip; benchmark entry = the "S&P 500" button; double-click disabled | the chips and the "S&P 500" button are the keyboard path | n/a |
| Window selector | click | Enter/Space; `aria-pressed` | no change |
| Benchmark toggle | "S&P 500" button next to `.windows` | Enter/Space; `aria-pressed` | no change |
| Theme buttons (Q1) | click | Tab, then Enter/Space; `aria-pressed` | no change |
| Folded sections (Q6) | click the summary | Enter/Space (native `<details>`) | no change |
| Press other releases (P1) | "Show N other releases" / "Show fewer" | Enter/Space; `aria-expanded` | collapses (P3) |
| KPI cell pin | click or focus | Tab | unpins and restores the hint |
| Motion | none added; `prefers-reduced-motion` respected | | |

## 7. Scope split (v2.0)
- **17 (about 90 min):** K1 (10), K2 (20), K3 and K4 (35), K5 (10), K6 (15), K7 (5). If it runs long, K6 becomes 17b in a fresh session.
- **18 (about 90 min):** Q1 and Q2 (25), Q3 to Q5 (20), Q6 (25), Q7 (10), ARCHITECTURE.md (10). If it runs long, Q1 to Q5 commit as a partial and Q6 to Q7 become 18b.
- **19 (built):** P1 to P3. Press follows the K2 selection (its own chips went), key releases first with "Show N other releases", a scope line, badges in words, R6 collapses the list; rows use K1's section head and hairlines.
- **20 (final design pass):** judged on the built page. First, the maintainer's pick after 19: one clear company filter for the whole page (Backlog 2026-10-15, step 19 build check). Other candidates already noted: a shorter What changed (held records folded into one "Reaffirmed: PUB, HAVAS" line), a quick way to show one company only, the print chart following the selection or showing all six.
- **21:** the intro line replaces `.tagline`; the freshness note (prices as of, curated as of) goes in `.header-meta`; **S3** dates read "9 Oct 2026, 01:51 UTC".
- **Deferred:** C2 (roving tabindex in the KPI grid) to a later tweak.

## 8. Out of scope
- **Fonts from a CDN** (Google Fonts or any other). Ruled out by the CSP rule; the serif and sans are system stacks.
- **Market cap, 8-quarter bars on cards, an "All themes" tab, LLM-written text.** Decided in v2.0 planning.
- **Remembering the selection in the browser.** It is shared by link only.
- **Sparklines via D3 or another library.** No new dependency.
- **Tailwind or a component grid.** No framework or build step.
- **Rich-text hover labels or bold in quotes.** Text goes in via textContent and hover text is escaped.
- **Sorting the unified hover by value.** Plotly 2.35.2 has no option for it.
- **Redrawing the chart for print.** It prints as on screen (step 20 may revisit).
