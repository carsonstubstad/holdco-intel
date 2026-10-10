# Design brief (approved 2026-10-09)

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
- **M1 Panel order.** In `index.html` `<main>`, the order becomes: header → tiles → organic growth → guidance | events → chart → press → health. The KPI definitions go into a `<details>` that is closed on screen and open in print (`renderKpis`).
  - Why: in desktop.png at 1440px, the first ~900px holds only the header, tiles and chart. The growth grid starts at the fold and guidance starts about 1,370px down, so questions 1 and 2 go unanswered on the first screen.
  - Step 13 placement: the intro line replaces `.tagline`, and the freshness note goes in `.header-meta`.
  - Check: at 1440×900, the grid and the first guidance rows are visible without scrolling.
- **M2 Compact guidance** (`renderGuidance`, `td.quote`, `td.value`). Sort raised, cut and new before held, then newest `set_date` first. Value gets `min-width: 16ch`. Quote is clamped to 2 lines. At 720px and below, hide Quote and Age only. Keep a source link on every row (the set date links to `source_url`). Rule 3: every record carries a public source_url.
  - Why: in desktop.png, the "slight operating margin…" value wraps to 9 lines, Quote is clipped at the panel edge, and the Events panel beside it is mostly blank. In phone.png, the Status column is off-screen.
  - Check: at 390px, every row's status is visible.
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
  - Check: you can tell the benchmark from the event lines at a glance.
- **M8 Colorblind safety** (`drawChart`). OMC was `#ff7f0e` (2.5:1 on white); changed to `#d95f02` (3.8:1) by tweak in config/watchlist.yaml. Havas red and WPP green collide for deuteranopes. Add company-code labels at the right end of each line and set line width to 2.5. Do not change the hex values.
  - Check: in a grayscale screenshot, every line can be identified.

**Should**
- **S2** In `renderChart`, hide `.windows` when the chart shows its empty state. Today the buttons stay live with no chart.
- **S3** In `fmtTimestamp`, change "10/9/2026, 6:51:50 PM", which reads ambiguously outside the US, to "9 Oct 2026, 01:51 UTC".

**Could**
- **C1** In `renderPress`, show the first 10 items plus a "Show all (n)" button. In phone.png, the press list runs about 3,000px.
- **C2** Use a roving tabindex in the KPI grid. Today it has 48 tab stops.
- **C3** When a tile highlights a company, tint that company's KPI row and guidance rows with 10% of its color.

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
| Legend toggle | Plotly click | the benchmark toggle and tile buttons are the keyboard path | n/a |
| Motion | the 150ms opacity fade on highlight | none under `prefers-reduced-motion` | n/a |

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
  - Tile highlight, chart only, and Esc (20)
  - M6 (15)
- **Deferred:** S2 and C1–C3 go to a later tweak, and S3 to step 13's freshness work.
- **Not design items:**
  - The What-changed strip (backlog 12f) goes in the full-width slot under the header, above the tiles. This is a placement note only; no empty slot is added to the markup.
  - A derived "Δ vs prior quarter (pp)" column with ▲/▼ in the growth grid, which answers "accelerating or slowing", is part of backlog step 12f (Executive snapshot). Rule: the delta is shown only when both adjacent quarters exist, otherwise "–" (this covers Dentsu half-years and OMC Q4 2025).
  - The "Management says" panel (backlog 14c) goes after guidance | events and before the chart.

## 7. Out of scope
- **Google-hosted fonts.** Ruled out by the CSP rule. A self-hosted font would be allowed, but the system stack is enough.
- **OMC color.** OMC color fails 3:1 contrast; fix via a tweak to config/watchlist.yaml, not in 12d/12e.
- **Sparklines via D3 or another library.** No new dependency.
- **Tailwind or a component grid.** No framework or build step.
- **Rich-text hover labels or bold in quotes.** Text goes in via textContent and hover text is escaped.
- **Sorting the unified hover by value.** Plotly 2.35.2 has no option for it, and a custom hover layer would break the "no new code paths for untrusted text" spirit of the escaping rule.
