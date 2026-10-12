# Design brief (approved 2026-10-09, revised 2026-10-11)

Revision 2026-10-11 (maintainer): the chart moves above organic growth and gets shorter
(M1), and the guidance list becomes a one-row-per-company matrix with a summary line and
a company filter (G1 to G6, step 12f).

Revision 2026-10-11 (maintainer, second): 12e refinements R1 to R6 (legend click, end
label spacing, focused tile and line, focused events, one Esc handler). See section 5.

## 1. Principles
- Answer three questions first: who is growing, who changed guidance, and what is coming next. Share price is context and sits below them.
- Numbers lead. Use tabular figures, show a sign on every change, and keep each figure as reported.
- Color means company identity or direction, never both at once, and never color alone.
- Every panel falls back to one grey sentence, and the page prints as a meeting handout.

## 2. Tokens
| Property | Value |
|---|---|
| `--fs-xs/-sm/-base/-md/-lg/-xl` | 12 / 13 / 14 / 16 (h2) / 20 (tile close) / 24 (h1) px. Badges go from 11 to 12 |
| `--fw-regular/--fw-strong` | 400 / 600 |
| `--sp-1…--sp-5` | 4 / 8 / 12 / 16 / 24 px |
| `--radius/--radius-chip/--radius-pill` | 8 / 3 / 999 px |
| Neutrals | keep `--bg --panel --text --muted --faint --border`; add `--grid: #eef0f2` |
| Status | keep `--up #1a7f37`, `--down #cf222e`, `--warn #9a6700`; `--focus: #0969da` |
| Chart | `--bench: #5f6368`, `--event: #c4c8cc` |

## 3. Must / Should / Could

**Must**
- **M1 Panel order.** In `index.html` `<main>`, the order is: header → tiles → chart → organic growth → guidance | events → press → health. The KPI definitions go into a `<details>` that is closed on screen and open in print (`renderKpis`).
  - Why: in desktop.png at 1440px, the growth grid started at the fold and guidance about 1,370px down. 12d moved the chart below guidance; on 2026-10-11 the maintainer moved it back to the top as the page's visual entry point, and made it shorter so growth still starts on the first screen.
  - Chart height: `#chart` is 300px above 720px (was 420px); 340px at 720px and below is unchanged.
  - Step 13 placement: the intro line replaces `.tagline`, and the freshness note goes in `.header-meta`.
  - Check: at 1440×900, the whole chart panel and the growth grid's heading and first two company rows are visible without scrolling.
- **M2 Compact guidance** (`renderGuidance`, `td.quote`, `td.value`). Sort raised, cut and new before held, then newest `set_date` first. Value gets `min-width: 16ch`. Quote is clamped to 2 lines. At 720px and below, hide Quote and Age only. Keep a source link on every row (the set date links to `source_url`). Rule 3: every record carries a public source_url.
  - Why: in desktop.png, the "slight operating margin…" value wraps to 9 lines, Quote is clipped at the panel edge, and the Events panel beside it is mostly blank. In phone.png, the Status column is off-screen.
  - Check: at 390px, every row's status is visible.
  - Built in 12d. Replaced by the guidance matrix (G1 to G6) in step 12f.
- **M3 Growth grid on phone** (`renderKpis`, `th.kpi-company`). After render, scroll `.table-wrap` to the right end. Make the company column sticky and show the company code at 720px and below.
  - Why: phone.png shows only Q3 2024 and Q4 2024, the oldest quarters.
  - Check: at 390px, Q2 2026 is visible on load.
- **M4 Tiles** (`renderScan`, `.tile`). Label the badge "Guidance raised · 16 Jul" and the event "Results 13 Oct (4d)". Use fixed row tracks so badges line up across tiles.
  - Why: in desktop.png, "Omnicom Group (incl. IPG)" wraps to two lines, so its badge sits lower than its neighbours'.
  - Check: badges sit at the same height across the row.
- **M5 Focus ring.** In `style.css`, add `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`. Today only `td.kpi-cell` has one.
  - Check: Tab through the window buttons and links.
- **M6 Print** (`@media print`; none exists today).
  - Hide `.windows` and `.modebar`.
  - `.panel { break-inside: avoid }`.
  - `.two-col` becomes one column.
  - `print-color-adjust: exact`.
  - `@page { margin: 12mm }`.
  - On `beforeprint`, call `Plotly.Plots.resize`.
  - Check: print preview on A4 and Letter shows KPI fills and company colors, and no panel splits across pages.
- **M7 Chart legibility** (`drawChart`).
  - Why: in hover.png, the y-axis "60" overlaps "Jan 2026", and more than 20 event lines use the same grey dashes as the S&P 500 line.
  - Check: you can tell the benchmark from the event lines at a glance. At 375px the legend is horizontal, wraps to at most 3 lines, and the plot area stays at least 220px tall (phone.png shows a vertical legend that squeezes the plot).
- **M8 Colorblind safety** (`drawChart`). OMC was `#ff7f0e` (2.5:1 on white); changed to `#d95f02` (3.8:1) by tweak in config/watchlist.yaml. Havas red and WPP green collide for deuteranopes. Add company-code labels at the right end of each line and set line width to 2.5. Do not change the hex values.
  - Check: in a grayscale screenshot, every line can be identified.

**Should**
- **S2** In `renderChart`, hide `.windows` when the chart shows its empty state. Today the buttons stay live with no chart.
- **S3** In `fmtTimestamp`, change "10/9/2026, 6:51:50 PM", which reads ambiguously outside the US, to "9 Oct 2026, 01:51 UTC".

**Could**
- **C1** In `renderPress`, show the first 10 items plus a "Show all (n)" button. In phone.png, the press list runs about 3,000px.
- **C2** Use a roving tabindex in the KPI grid. Today it has 48 tab stops.
- **C3** When a tile highlights a company, tint that company's KPI row and guidance rows with 10% of its color.

### Guidance matrix (step 12f, added 2026-10-11)
Why: after 12d the tracker is still 15 rows in one list. A reader has to read every row to see who raised, and the list needs scrolling. The panel should answer "who changed guidance" in one glance and fit on one screen.

- **G1 Summary line** above the matrix, computed from current records (no LLM). Counts in a fixed order: raised, cut, new, then held; withdrawn appears only when above zero. Raised and cut always show, even at 0, because "0 cut" is a takeaway. Each count is a status badge with its word (never color alone), e.g. `2 raised · 0 cut · 3 new · 10 held`. A second muted line lists companies in companies.json with no current record: "No guidance on file: OMC, DENTSU".
- **G2 Matrix.** One row per company, in companies.json order (same as tiles and the growth grid). Columns: Company | Organic growth | Margin | More. Margin means `operating_margin` only.
  - Headline record per company and metric: the record whose period is in the current calendar year (FY, H1, H2 or Q of that year). Otherwise use the earliest period, then the newest set_date.
  - Cell: the value (strong, tabular, clamped to 2 lines, full text in `title`). Below it, a muted line: status badge, then the set date linked to `source_url` ("Raised · 16 Jul"); "source" if there is no valid date. When the period is not "FY <current year>", prefix it muted ("H2 2026:").
  - An empty cell shows a muted "–". A company with no records gets one muted cell: "No guidance on file".
- **G3 More.** A `<button aria-expanded>` reading "+n more" (n = records not shown as headlines), or "Quotes" when n is 0. It opens a full-width detail row under that company listing every current record: metric (underscores to spaces), period, value, status badge, set date linked to source, quote clamped to 2 lines. Every record keeps its public link (rule 3).
- **G4 Company filter.** A chip row above the matrix: "All", then each code from companies.json, as `<button aria-pressed>`, single select. Each chip has a 3px left border in the company color, and the code is always shown. Choosing a company shows only its row with the detail open; "All" restores the matrix.
  - The filter and the 12e tile highlight share one "focused company": a tile click filters guidance, a chip click highlights the chart line, and Esc clears both. Changes are announced through the 12e aria-live region.
- **G5 Layout.** Above 720px, `.two-col` becomes `2fr 1fr` (guidance wider than events). At 720px and below, each company row stacks: the company chip, then "Organic growth" and "Margin" as label/value pairs, then More. Chips wrap. No sideways scroll inside the panel.
- **G6 Print.** Chips are hidden, the filter is ignored (all companies print), and every detail row prints open (reuse the `beforeprint`/`afterprint` pattern from `renderKpis`).
- Check: at 1440px with all details closed, the guidance panel shows all six companies and is no taller than 480px. At 375px there is no sideways scroll, and each company's two headline values show without horizontal scrolling. Tab reaches the chips and the More buttons, and Enter or Space works each one.

## 4. Chart spec
```
margin {l:48, r:56, t:24, b:36}; hovermode 'x unified'
hoverlabel {bgcolor:'rgba(255,255,255,0.95)', bordercolor:'#d8dee4', font:{size:12}}
xaxis {showgrid:false, ticks:'outside', ticklen:4, tickformat:'%b %Y', automargin:true}
yaxis {gridcolor:'#eef0f2', zeroline:false, ticksuffix:' ', automargin:true}
legend {orientation:'h', x:0, y:1.08, yanchor:'bottom', font:{size:12}}
company line {width:2.5}; end label annotation per series: code, font color = company color, xanchor 'left'
benchmark {color:'#5f6368', width:1.5, dash:'dash'}
event lines {color:'#c4c8cc', width:1, dash:'dot'}; markers {size:7, color:'#80868b'}
baseline 100 {color:'#d8dee4', width:1, solid}
config {displaylogo:false, modeBarButtonsToRemove:['lasso2d','select2d','zoomIn2d','zoomOut2d','autoScale2d']}
transition {duration:0}
```
For event hover text, use "Publicis Groupe · Deal · {title}". Company names still go through `escapeHtml`.

## 5. Interactivity spec
| Behavior | Trigger | Keyboard | Esc |
|---|---|---|---|
| Window selector | click | Tab, then Enter/Space; `aria-pressed` | no change (a deliberate choice) |
| Benchmark toggle | "S&P 500" button next to `.windows`, not inside its "Chart window" group | Enter/Space; `aria-pressed` | no change |
| Tile highlights a company | click the tile name (a `<button aria-pressed>`): other chart lines drop to opacity 0.25 | Enter/Space | clears the highlight |
| KPI cell pin | click or focus | Tab | unpins and restores the hint |
| Legend click | Plotly click: a company entry sets the focused company (R1); the benchmark entry acts as the "S&P 500" button | the benchmark toggle and tile buttons are the keyboard path | n/a |
| Motion | the 150ms opacity fade on highlight | none under `prefers-reduced-motion` | n/a |

### 12e refinements (added 2026-10-11)
These settle how the 12e items above are built. They are not new features.
- **R1 Legend click.** In `plotly_legendclick`, a company trace calls the focused-company setter and returns `false`, so Plotly does not hide it. The benchmark trace runs the same handler as the "S&P 500" button, so the button's `aria-pressed` and the trace visibility always match. Legend double-click is disabled (`legenddoubleclick` returns `false`).
- **R2 End labels do not overlap.** Sort the end labels by last value and push them apart so they sit at least 12px apart vertically (convert with the y-axis range and plot height). Each label is the company code, escaped. The benchmark gets no end label; it stays in the legend.
- **R3 Focused tile.** The tile name is a `<button aria-pressed>` styled as plain text: no background or border, inherited font and weight, left-aligned, same 2-line clamp, and `cursor: pointer`. When pressed, the tile shows a 2px outline in the company color (`safeColor`), on top of the M5 focus ring.
- **R4 Focused line.** The focused company's line is 3.5 wide and drawn last (on top). The other company lines go to opacity 0.25. The benchmark stays as it is, so the comparison still reads.
- **R5 Focused events.** While a company is focused, the event lines and markers show only that company's events. Clearing the focus brings all of them back.
- **R6 One Esc handler.** One `keydown` listener on `document` handles Esc: it clears the focused company through the setter and unpins a pinned KPI cell, restoring the hint. It does nothing when nothing is focused or pinned. 12f adds the guidance filter to the same setter, not a second listener.
- Check: in a grayscale screenshot at 1440px and 375px, no two end labels overlap; Tab to a tile name, press Enter, and only that company's line and events stand out; Esc restores everything and the live region announces it.

## 6. Scope split
- **12d (90 min):**
  - Tokens and type, including `tabular-nums` on `td.value` and `ul.facts` (15)
  - M1 (20)
  - M2 (25)
  - M3 (15)
  - M4 (15)
- **12e (90 min):**
  - M7 plus the chart spec (20)
  - M8 (15)
  - M5 plus reduced motion (10)
  - Benchmark toggle (10)
  - Tile highlight, chart only, and Esc (20). Keep the focused company in one variable with one setter, so 12f's guidance filter can share it.
  - M6 (15)
  - R1 to R6 fold into the items above (legend click into the benchmark toggle, R2 into M8, R3 to R6 into the tile highlight)
- **Tweak (2026-10-11, before 12e):** the revised M1 order and chart height (`index.html`, `style.css`).
- **12f (90 min):** G1–G6 (guidance matrix, summary line, company filter). Runs after 12e, because G4 reuses 12e's focused-company state and aria-live region.
- **Deferred:** S2 and C1 go to the polish tweak after 12f (see PLAN.md backlog); C2 and C3 go to a later tweak, and S3 to step 13's freshness work. C3 (tinting a focused company's rows) is partly covered by G4's filter.
- **Not design items:**
  - The What-changed strip (backlog 12g) goes in the full-width slot under the header, above the tiles. This is a placement note only; no empty slot is added to the markup. It must not repeat G1's counts: it lists dated changes and upcoming results, and links to the guidance panel.
  - A derived "Δ vs prior quarter (pp)" column with ▲/▼ in the growth grid, which answers "accelerating or slowing", is part of backlog step 12g. Rule: the delta is shown only when both adjacent quarters exist, otherwise "–" (this covers Dentsu half-years and OMC Q4 2025).
  - The "Management says" panel (backlog 14c) goes after guidance | events and before press.

## 7. Out of scope
- **Google-hosted fonts.** Ruled out by the CSP rule. A self-hosted font would be allowed, but the system stack is enough.
- **OMC color.** OMC color fails 3:1 contrast; fix via a tweak to config/watchlist.yaml, not in 12d/12e.
- **Sparklines via D3 or another library.** No new dependency.
- **Tailwind or a component grid.** No framework or build step.
- **Rich-text hover labels or bold in quotes.** Text goes in via textContent and hover text is escaped.
- **Sorting the unified hover by value.** Plotly 2.35.2 has no option for it, and a custom hover layer would break the "no new code paths for untrusted text" spirit of the escaping rule.
