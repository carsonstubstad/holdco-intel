'use strict';
// Holdco Intel dashboard. Plain DOM, no framework. All external text goes in via text nodes.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const MARKER_TYPES = ['results', 'capital_markets_day', 'deal'];
const DAY_MS = 86400000;

// ---------- DOM helpers ----------

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined) continue;
    if (k === 'className') node.className = v;
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number'
      ? document.createTextNode(String(c)) : c);
  }
  return node;
}

function safeUrl(u) {
  try {
    const url = new URL(String(u), document.baseURI);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch (e) {
    return null;
  }
}

function link(u, text) {
  const href = safeUrl(u);
  const label = String(text ?? u ?? '');
  if (!href) return document.createTextNode(label);
  return el('a', {href, target: '_blank', rel: 'noopener noreferrer'}, label);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}

function safeColor(c) {
  return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null;
}

function bodyOf(panelId) {
  return document.querySelector('#' + panelId + ' .body');
}

function empty(panelId, message) {
  const body = bodyOf(panelId);
  body.replaceChildren(el('p', {className: 'empty'}, message));
}

// ---------- date helpers (ISO date strings, never new Date(bare date)) ----------

function isIsoDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);
}

function dayNum(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDayNum(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

function todayIso() {
  const t = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

function daysBetween(a, b) {
  return dayNum(b) - dayNum(a);
}

function addDays(iso, n) {
  return fromDayNum(dayNum(iso) + n);
}

function addMonths(iso, n) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return fromDayNum(Date.UTC(ny, nm, Math.min(d, lastDay)) / DAY_MS);
}

function fmtDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function fmtDay(iso) {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function monthHeading(iso) {
  const [y, m] = iso.slice(0, 10).split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

function fmtTimestamp(ts) {
  const t = new Date(ts);
  return Number.isNaN(t.getTime()) ? String(ts) : t.toLocaleString();
}

// ---------- number helpers ----------

const fmt2 = new Intl.NumberFormat(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

function pct(a, b) {
  return (a / b - 1) * 100;
}

function signedPct(p) {
  return (p > 0 ? '+' : '') + p.toFixed(1) + '%';
}

function nonNullPoints(series) {
  const out = [];
  const dates = Array.isArray(series?.dates) ? series.dates : [];
  const closes = Array.isArray(series?.closes) ? series.closes : [];
  for (let i = 0; i < dates.length; i++) {
    if (isIsoDate(dates[i]) && typeof closes[i] === 'number' && Number.isFinite(closes[i])) {
      out.push([dates[i].slice(0, 10), closes[i]]);
    }
  }
  return out;
}

// ---------- data loading ----------

async function loadJSON(path) {
  try {
    const res = await fetch('data/' + path, {cache: 'no-cache'});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data === null || typeof data !== 'object') throw new Error('not a JSON object');
    return data;
  } catch (err) {
    console.warn('[holdco] could not load data/' + path + ':', err.message || err);
    return null;
  }
}

function companyLookup(companies) {
  const list = Array.isArray(companies?.companies) ? companies.companies : [];
  const byCode = {};
  for (const c of list) {
    if (c && typeof c.code === 'string') byCode[c.code] = c;
  }
  return {list, byCode};
}

function companyName(ctx, code) {
  return ctx.byCode[code]?.name || String(code ?? '');
}

function companyChip(ctx, code) {
  const chip = el('span', {className: 'chip company'}, ctx.byCode[code]?.code || String(code ?? ''));
  const color = safeColor(ctx.byCode[code]?.color);
  if (color) chip.style.borderLeftColor = color;
  chip.title = companyName(ctx, code);
  return chip;
}

function currentGuidance(guidance) {
  const records = Array.isArray(guidance?.records) ? guidance.records : [];
  const superseded = new Set(records.map((r) => r?.supersedes).filter(Boolean));
  return records.filter((r) => r && typeof r.id === 'string' && !superseded.has(r.id));
}

function upcomingEvents(events, today, horizonDays) {
  const items = Array.isArray(events?.items) ? events.items : [];
  const end = horizonDays === null ? null : addDays(today, horizonDays);
  return items
    .filter((e) => e && isIsoDate(e.date) && e.date.slice(0, 10) >= today
      && (end === null || e.date.slice(0, 10) <= end))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function statusBadge(status, ...label) {
  const s = typeof status === 'string' ? status : 'unknown';
  return el('span', {className: 'badge status-' + s.replace(/[^a-z_]/g, '')},
    ...(label.length ? label : [s]));
}

const STATUS_RANK = {raised: 0, cut: 0, new: 0, withdrawn: 0, held: 1};

// ---------- shared view state: one focused company, chart toggles ----------

let focusedCode = null; // the focused company's code, or null
let benchVisible = true;
let eventsVisible = true;
let redrawChart = null; // set by renderChart once the chart exists
let unpinKpi = null; // set by renderKpis
let filterGuidance = null; // set by renderGuidance

// Sets (code) or clears (null) the focused company and updates every view that shows it.
function setFocusedCompany(ctx, code) {
  const next = typeof code === 'string' && Object.hasOwn(ctx.byCode, code) ? code : null;
  if (next === focusedCode) return;
  focusedCode = next;
  for (const btn of document.querySelectorAll('#panel-scan .tile-name[data-code]')) {
    const on = btn.dataset.code === next;
    btn.setAttribute('aria-pressed', String(on));
    btn.closest('.tile')?.classList.toggle('is-focused', on);
  }
  if (redrawChart) redrawChart();
  if (filterGuidance) filterGuidance();
  // The URL carries the focused company (#PUB) without adding history entries.
  history.replaceState(null, '', next ? '#' + next : location.pathname + location.search);
  document.getElementById('announce').textContent = next
    ? 'Highlighting ' + companyName(ctx, next) : 'Highlight cleared';
}

// Shows or hides the benchmark line; the toggle button and the legend entry stay in sync.
function setBenchmarkVisible(on) {
  benchVisible = on;
  document.querySelector('#panel-chart .bench-toggle')?.setAttribute('aria-pressed', String(on));
  if (redrawChart) redrawChart();
}

// ---------- Panel A: scan strip ----------

function renderScan(ctx, data) {
  const panel = 'panel-scan';
  if (!ctx.list.length) return empty(panel, 'Company list unavailable.');
  const series = data.prices?.series && typeof data.prices.series === 'object' ? data.prices.series : null;
  const mcaps = data.prices?.market_cap_usd_m || {};
  const guidance = currentGuidance(data.guidance);
  const events = upcomingEvents(data.events, ctx.today, null);
  const body = bodyOf(panel);
  body.replaceChildren();

  for (const c of ctx.list) {
    const tile = el('article', {className: 'tile'});
    const color = safeColor(c.color);
    if (color) {
      tile.style.borderTopColor = color;
      tile.style.setProperty('--company', color);
    }
    const fullName = String(c.name ?? c.code);
    // The name is a toggle that highlights this company on the chart.
    const nameBtn = el('button', {type: 'button', className: 'tile-name', 'aria-pressed': 'false',
      'data-code': c.code, title: 'Highlight on chart',
      'aria-label': `Highlight ${fullName} on chart`}, el('span', {className: 'clamp'}, fullName));
    nameBtn.addEventListener('click',
      () => setFocusedCompany(ctx, focusedCode === c.code ? null : c.code));
    tile.appendChild(nameBtn);
    tile.appendChild(el('div', {className: 'tile-ticker'}, String(c.ticker ?? '')));

    const s = series ? series[c.ticker] : null;
    const pts = nonNullPoints(s);
    if (pts.length) {
      const [lastDate, last] = pts[pts.length - 1];
      tile.appendChild(el('div', {className: 'tile-close'}, fmt2.format(last) + ' ',
        el('span', {className: 'ccy'}, String(s.currency ?? ''))));
      const row = el('div', {className: 'tile-row'});
      if (pts.length > 1) {
        const d1 = pct(last, pts[pts.length - 2][1]);
        const cls = d1 > 0 ? 'up' : d1 < 0 ? 'down' : 'flat';
        const glyph = d1 > 0 ? '▲ ' : d1 < 0 ? '▼ ' : '';
        row.appendChild(el('span', {className: cls}, glyph + signedPct(d1) + ' 1D'));
      }
      const year = lastDate.slice(0, 4);
      const prior = pts.filter(([d]) => d.slice(0, 4) < year);
      if (prior.length) {
        const ytd = pct(last, prior[prior.length - 1][1]);
        row.appendChild(el('span', {className: 'muted'}, signedPct(ytd) + ' YTD'));
      }
      tile.appendChild(row);
      if (Number.isInteger(s.stale_days) && s.stale_days >= 2) {
        tile.appendChild(el('div', {className: 'stale'},
          `stale: last close ${fmtDate(lastDate)} (${s.stale_days} days)`));
      }
    } else {
      tile.appendChild(el('div', {className: 'tile-close muted'}, 'no price data'));
    }

    const mc = mcaps[c.code];
    tile.appendChild(el('div', {className: 'tile-mcap'},
      typeof mc === 'number' ? '$' + (mc / 1000).toFixed(1) + 'B ' : 'n/a ',
      el('span', {className: 'muted'}, 'mkt cap, approx.')));

    const mine = guidance.filter((g) => g.company === c.code && isIsoDate(g.set_date))
      .sort((a, b) => b.set_date.localeCompare(a.set_date));
    let badge = el('span', {className: 'badge status-none'}, 'no guidance yet');
    if (mine.length) {
      const g = mine[0];
      const s = typeof g.status === 'string' ? g.status : 'unknown';
      badge = statusBadge(s, el('span', {className: 'long'}, 'Guidance ' + s),
        el('span', {className: 'short'}, capitalize(s)), ' · ' + fmtDay(g.set_date));
    }
    tile.appendChild(el('div', {className: 'tile-guidance'}, badge));

    const next = events.find((e) => e.company === c.code);
    let eventText = 'no event scheduled';
    if (next) {
      const n = daysBetween(ctx.today, next.date);
      eventText = `${capitalize(String(next.type ?? '').replace(/_/g, ' '))} ${fmtDay(next.date)} `
        + (n === 0 ? '(today)' : `(${n}d)`);
    }
    tile.appendChild(el('div', {className: 'tile-event muted'}, eventText));

    body.appendChild(tile);
  }
}

// ---------- Panel B: relative performance ----------

function buildAligned(ctx, prices) {
  const series = [];
  for (const c of ctx.list) {
    const pts = nonNullPoints(prices.series[c.ticker]);
    if (pts.length) series.push({company: c, map: new Map(pts), first: pts[0][0]});
  }
  const union = [...new Set(series.flatMap((s) => [...s.map.keys()]))].sort();
  // Forward fill on the union calendar for display only; null until the first real value.
  for (const s of series) {
    let carry = null;
    s.filled = union.map((d) => {
      if (s.map.has(d)) carry = s.map.get(d);
      return carry;
    });
  }
  // Benchmark: forward-filled on the companies' calendar so company lines are unchanged.
  let bench = null;
  const pts = ctx.benchmark ? nonNullPoints(prices.series[ctx.benchmark.symbol]) : [];
  if (pts.length) {
    const map = new Map(pts);
    let carry = null;
    const filled = union.map((d) => {
      if (map.has(d)) carry = map.get(d);
      return carry;
    });
    bench = {name: String(ctx.benchmark.name ?? ctx.benchmark.symbol), filled};
  }
  return {series, union, bench};
}

function windowStart(win, union) {
  const last = union[union.length - 1];
  if (win === 'YTD') {
    const year = last.slice(0, 4);
    const prior = union.filter((d) => d.slice(0, 4) < year);
    return prior.length ? prior[prior.length - 1] : union[0];
  }
  const months = {'1M': 1, '3M': 3, '1Y': 12, '2Y': 24}[win] || 12;
  return addMonths(last, -months);
}

function rebased(vals) {
  const baseIdx = vals.findIndex((v) => v !== null);
  const base = baseIdx >= 0 ? vals[baseIdx] : null;
  return vals.map((v) => (v === null || base === null ? null : (100 * v) / base));
}

// At 720px and below the legend shows company codes, so it wraps to at most 3 lines.
const NARROW = window.matchMedia('(max-width: 720px)');
const END_LABEL_GAP_PX = 12;

let traceKeys = []; // per trace in the last draw: {kind: 'company'|'bench'|'events', code}
let endLabels = []; // per company line in the last draw: {code, color, x, y, dim}
let endAnnotations = []; // the last placed end labels, reused so a redraw never drops them

// Company-code annotations at the right end of each line, pushed at least 12px apart.
function endLabelAnnotations(ymin, ymax, h) {
  const gap = (END_LABEL_GAP_PX * (ymax - ymin)) / Math.max(h, 1);
  const sorted = [...endLabels].sort((a, b) => a.y - b.y);
  const ys = sorted.map((l) => l.y);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
  if (ys.length) ys[ys.length - 1] = Math.min(ys[ys.length - 1], ymax);
  for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap);
  return sorted.map((l, i) => ({
    x: l.x, y: ys[i], xref: 'x', yref: 'y', text: escapeHtml(l.code),
    showarrow: false, xanchor: 'left', yanchor: 'middle', xshift: 4,
    font: {color: l.color, size: 12}, opacity: l.dim ? 0.25 : 1,
  }));
}

// Re-spaces the end labels with the drawn y range and plot height.
function placeEndLabels(gd) {
  // Private Plotly API (_fullLayout, _size); safe because the version is pinned at 2.35.2.
  const range = gd._fullLayout?.yaxis?.range;
  const size = gd._fullLayout?._size?.h;
  if (!Array.isArray(range) || !isNum(range[0]) || !isNum(range[1])) return;
  const h = isNum(size) && size > 0 ? size : gd.clientHeight - 60;
  const next = endLabelAnnotations(range[0], range[1], h);
  if (JSON.stringify(next) === JSON.stringify(endAnnotations)) return;
  endAnnotations = next;
  return Plotly.relayout(gd, {annotations: next});
}

function drawChart(ctx, data, aligned, win) {
  const {series, union, bench} = aligned;
  const start = windowStart(win, union);
  let b = union.findIndex((d) => d >= start);
  if (b < 0) b = 0;
  const x = union.slice(b);
  const dimmed = (code) => focusedCode !== null && code !== focusedCode;

  const companyTraces = [];
  const companyKeys = [];
  endLabels = [];
  for (const s of series) {
    const code = s.company.code;
    const rank = ctx.list.indexOf(s.company);
    const color = safeColor(s.company.color);
    const fullName = escapeHtml(s.company.name ?? code);
    const y = rebased(s.filled.slice(b));
    companyTraces.push({
      type: 'scatter',
      mode: 'lines',
      uid: 'co' + rank,
      name: NARROW.matches ? escapeHtml(code) : fullName,
      meta: fullName,
      legendrank: rank + 1,
      x,
      y,
      opacity: dimmed(code) ? 0.25 : 1,
      line: {width: code === focusedCode ? 3.5 : 2.5, color: color || undefined},
      hovertemplate: '%{meta}: %{y:.1f}<extra></extra>',
    });
    companyKeys.push({kind: 'company', code});
    const lastIdx = y.findLastIndex((v) => v !== null);
    if (lastIdx >= 0) {
      endLabels.push({code, color: color || '#1f2328', x: x[lastIdx], y: y[lastIdx],
        dim: dimmed(code)});
    }
  }
  // The focused line is drawn last, so it sits on top; legendrank keeps the legend order.
  const f = companyKeys.findIndex((k) => k.code === focusedCode);
  const traces = companyTraces.filter((_, i) => i !== f);
  traceKeys = companyKeys.filter((_, i) => i !== f);

  let benchY = [];
  if (bench) {
    benchY = rebased(bench.filled.slice(b));
    const name = escapeHtml(bench.name);
    traces.push({
      type: 'scatter',
      mode: 'lines',
      uid: 'bench',
      name,
      meta: name,
      legendrank: 2000,
      visible: benchVisible ? true : 'legendonly',
      x,
      y: benchY,
      line: {width: 1.5, color: '#5f6368', dash: 'dash'},
      hovertemplate: '%{meta}: %{y:.1f}<extra></extra>',
    });
    traceKeys.push({kind: 'bench'});
  }

  const first = x[0];
  const last = x[x.length - 1];
  const items = Array.isArray(data.events?.items) ? data.events.items : [];
  const marks = items.filter((e) => e && isIsoDate(e.date) && MARKER_TYPES.includes(e.type)
    && e.date.slice(0, 10) >= first && e.date.slice(0, 10) <= last
    && (focusedCode === null || e.company === focusedCode));

  const shapes = [{
    type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: 100, y1: 100,
    line: {color: '#d8dee4', width: 1},
  }];
  if (marks.length) {
    const visible = eventsVisible ? true : 'legendonly';
    // Vertical event lines as one trace of null-separated segments, so the Events
    // legend entry toggles them together with the markers (shapes ignore the legend).
    traces.push({
      type: 'scatter',
      mode: 'lines',
      uid: 'ev-lines',
      name: 'Events',
      legendgroup: 'events',
      showlegend: false,
      visible,
      hoverinfo: 'skip',
      x: marks.flatMap((e) => [e.date.slice(0, 10), e.date.slice(0, 10), null]),
      y: marks.flatMap(() => [0, 1.04, null]),
      yaxis: 'y2',
      line: {color: '#c4c8cc', width: 1, dash: 'dot'},
    });
    traceKeys.push({kind: 'events'});
    // One small marker per event at the top of the plot carries the hover text.
    traces.push({
      type: 'scatter',
      mode: 'markers',
      uid: 'ev-marks',
      name: 'Events',
      legendgroup: 'events',
      legendrank: 3000,
      visible,
      x: marks.map((e) => e.date.slice(0, 10)),
      y: marks.map(() => 1),
      yaxis: 'y2',
      marker: {symbol: 'triangle-down', size: 7, color: '#80868b'},
      hovertext: marks.map((e) => [companyName(ctx, e.company),
        capitalize(String(e.type ?? '').replace(/_/g, ' ')), String(e.title ?? '')]
        .map(escapeHtml).join(' · ')),
      hovertemplate: '%{hovertext}<extra></extra>',
    });
    traceKeys.push({kind: 'events'});
  }
  if (f >= 0) {
    traces.push(companyTraces[f]);
    traceKeys.push(companyKeys[f]);
  }

  // Place the end labels before drawing with an estimated range (5% padding, the last plot
  // height), so they never disappear; placeEndLabels corrects them once the plot exists.
  const shown = [100, ...companyTraces.flatMap((t) => t.y), ...(benchVisible ? benchY : [])]
    .filter(isNum);
  const lo = Math.min(...shown);
  const hi = Math.max(...shown);
  const pad = (hi - lo) * 0.05;
  const gd = document.getElementById('chart');
  const h = gd._fullLayout?._size?.h || gd.clientHeight - 60;
  endAnnotations = endLabelAnnotations(lo - pad, hi + pad, h);

  const layout = {
    margin: {l: 48, r: 56, t: 24, b: 36},
    hovermode: 'x unified',
    hoverlabel: {bgcolor: 'rgba(255,255,255,0.95)', bordercolor: '#d8dee4', font: {size: 12}},
    showlegend: true,
    legend: {orientation: 'h', x: 0, y: 1.08, yanchor: 'bottom', font: {size: 12}},
    // Fewer x ticks on narrow screens keep the dates horizontal, so the plot keeps its height.
    xaxis: {type: 'date', range: [first, last], showgrid: false, ticks: 'outside', ticklen: 4,
      tickformat: '%b %Y', automargin: true, nticks: NARROW.matches ? 3 : undefined},
    yaxis: {gridcolor: '#eef0f2', zeroline: false, ticksuffix: ' ', automargin: true},
    yaxis2: {overlaying: 'y', range: [0, 1.04], visible: false, fixedrange: true},
    shapes,
    annotations: endAnnotations,
    transition: {duration: 0},
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    font: {family: getComputedStyle(document.body).fontFamily, size: 12},
  };
  return Plotly.react(gd, traces, layout, {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d'],
  });
}

function renderChart(ctx, data) {
  const panel = 'panel-chart';
  if (typeof Plotly === 'undefined') {
    console.warn('[holdco] Plotly did not load; chart disabled');
    return empty(panel, 'Chart library unavailable.');
  }
  if (!data.prices || typeof data.prices.series !== 'object' || data.prices.series === null) {
    return empty(panel, 'No price data available.');
  }
  if (!ctx.list.length) return empty(panel, 'Company list unavailable.');
  const aligned = buildAligned(ctx, data.prices);
  if (!aligned.union.length) return empty(panel, 'No price data available.');

  const gd = document.getElementById('chart');
  let win = 'YTD';
  // Every redraw reads the current window, focused company and benchmark/events visibility.
  const draw = () => drawChart(ctx, data, aligned, win).then(placeEndLabels)
    .catch((err) => console.warn('[holdco] chart draw failed:', err));

  const buttons = document.querySelectorAll('#panel-chart .windows button');
  const select = (next) => {
    win = next;
    buttons.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.window === win)));
    draw();
  };
  buttons.forEach((btn) => btn.addEventListener('click', () => select(btn.dataset.window)));

  const toggle = document.querySelector('#panel-chart .bench-toggle');
  if (toggle && aligned.bench) {
    toggle.textContent = aligned.bench.name;
    toggle.setAttribute('aria-pressed', String(benchVisible));
    toggle.hidden = false;
    toggle.addEventListener('click', () => setBenchmarkVisible(!benchVisible));
  }

  redrawChart = draw;
  NARROW.addEventListener('change', draw);
  window.addEventListener('beforeprint', () => Plotly.Plots.resize(gd));
  window.addEventListener('afterprint', () => Plotly.Plots.resize(gd));

  select('YTD');
  // Legend clicks route through the same setters as the buttons (R1); Plotly's own
  // hide/show and double-click isolate are turned off.
  gd.on('plotly_legendclick', (ev) => {
    const key = traceKeys[ev.curveNumber];
    if (key?.kind === 'company') setFocusedCompany(ctx, focusedCode === key.code ? null : key.code);
    else if (key?.kind === 'bench') setBenchmarkVisible(!benchVisible);
    else if (key?.kind === 'events') {
      eventsVisible = !eventsVisible;
      draw();
    }
    return false;
  });
  gd.on('plotly_legenddoubleclick', () => false);
  gd.on('plotly_relayout', (ev) => {
    const keys = Object.keys(ev || {});
    if (keys.some((k) => k === 'autosize' || k === 'width' || k === 'height'
      || k.startsWith('xaxis.') || k.startsWith('yaxis.'))) placeEndLabels(gd);
  });
}

// ---------- Panel G: organic growth grid ----------

const KPI_COLUMNS = 8;
const KPI_CLAMP = 8; // percentage points at which the color scale saturates
const KPI_ZERO = [247, 247, 247];
const KPI_POS = [33, 102, 172];
const KPI_NEG = [178, 24, 43];
const KPI_HINT = 'Hover, tap or focus a cell for its period, note and source.';

// Quarter index (year * 4 + quarter - 1) covered by a period; FY and unknown periods give [].
function periodQuarters(period) {
  const m = /^(Q[1-4]|H[12]|FY) ?(20\d{2})$/.exec(String(period ?? ''));
  if (!m) return [];
  const base = Number(m[2]) * 4;
  if (m[1][0] === 'Q') return [base + Number(m[1][1]) - 1];
  if (m[1] === 'H1') return [base, base + 1];
  if (m[1] === 'H2') return [base + 2, base + 3];
  return [];
}

function quarterLabel(i) {
  return `Q${(i % 4) + 1} ${Math.floor(i / 4)}`;
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// The stored number with a sign; never rounded.
function kpiText(v) {
  return isNum(v) ? (v > 0 ? '+' : '') + String(v) + '%' : '–';
}

function luminance(rgb) {
  const lin = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

// Diverging fill centered at zero; magnitude reads as darkness, so it also works in grayscale.
function kpiFill(v) {
  const t = Math.min(Math.abs(v) / KPI_CLAMP, 1);
  const end = v > 0 ? KPI_POS : KPI_NEG;
  const rgb = KPI_ZERO.map((z, i) => Math.round(z + (end[i] - z) * t));
  const lum = luminance(rgb);
  return {bg: `rgb(${rgb.join(', ')})`, dark: 1.05 / (lum + 0.05) > (lum + 0.05) / 0.05};
}

function renderKpis(ctx, data) {
  const panel = 'panel-kpis';
  const all = Array.isArray(data.kpis?.rows) ? data.kpis.rows : [];
  const rows = all.filter((r) => r && typeof r.company === 'string' && typeof r.period === 'string');
  if (!rows.length) return empty(panel, 'No KPI data yet.');
  if (!ctx.list.length) return empty(panel, 'Company list unavailable.');

  const codes = new Set(ctx.list.map((c) => c.code));
  const mine = rows.filter((r) => codes.has(r.company));
  const last = Math.max(...mine.flatMap((r) => periodQuarters(r.period)));
  if (!Number.isFinite(last)) return empty(panel, 'No KPI data yet.');
  const first = last - KPI_COLUMNS + 1;

  const detail = el('p', {className: 'kpi-detail', 'aria-live': 'polite'}, KPI_HINT);
  let pinned = null;
  let pressed = null;
  const show = (info) => {
    if (!info) return detail.replaceChildren(KPI_HINT);
    const r = info.row;
    detail.replaceChildren(
      el('strong', {}, companyName(ctx, r.company)), ' · ', String(r.period), ' · ',
      isNum(r.organic_growth_pct) ? kpiText(r.organic_growth_pct) : 'not stated',
      r.note ? ' · ' + String(r.note) : '', ' · ', link(r.source_url, 'source'));
  };
  const pin = (info, btn) => {
    if (pressed) pressed.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-pressed', 'true');
    pressed = btn;
    pinned = info;
    show(info);
  };
  // Esc unpins the pinned cell and restores the hint.
  unpinKpi = () => {
    if (!pinned) return;
    if (pressed) pressed.setAttribute('aria-pressed', 'false');
    pressed = null;
    pinned = null;
    show(null);
  };

  const valueCell = (row, span) => {
    const v = row.organic_growth_pct;
    const info = {row};
    const btn = el('button', {type: 'button', 'aria-pressed': 'false',
      'aria-label': isNum(v) ? null : 'not stated, note available'}, kpiText(v));
    btn.addEventListener('mouseenter', () => show(info));
    btn.addEventListener('focus', () => pin(info, btn));
    btn.addEventListener('click', () => pin(info, btn));
    const td = el('td', {className: 'kpi-cell', colspan: span > 1 ? span : null}, btn);
    if (isNum(v)) {
      const fill = kpiFill(v);
      td.style.backgroundColor = fill.bg;
      if (fill.dark) td.classList.add('kpi-dark');
    } else {
      td.classList.add('kpi-none');
    }
    return td;
  };

  const head = el('tr', {}, el('th', {scope: 'col', className: 'kpi-corner'},
    el('span', {className: 'visually-hidden'}, 'Company')));
  for (let q = first; q <= last; q++) head.appendChild(el('th', {scope: 'col'}, quarterLabel(q)));

  const tbody = el('tbody');
  for (const c of ctx.list) {
    const byQuarter = new Map();
    const halves = new Map();
    for (const r of mine.filter((x) => x.company === c.code)) {
      const qs = periodQuarters(r.period);
      if (qs.length === 1 && !byQuarter.has(qs[0])) byQuarter.set(qs[0], r);
      if (qs.length === 2 && !halves.has(qs[0])) halves.set(qs[0], r);
    }
    const name = el('th', {scope: 'row', className: 'kpi-company'},
      el('span', {className: 'name-full'}, String(c.name ?? c.code)),
      el('span', {className: 'name-code', title: String(c.name ?? c.code)}, String(c.code)));
    const color = safeColor(c.color);
    if (color) name.style.borderLeftColor = color;
    const tr = el('tr', {}, name);
    for (let q = first; q <= last; q++) {
      if (byQuarter.has(q)) {
        tr.appendChild(valueCell(byQuarter.get(q), 1));
      } else if (halves.has(q) && q + 1 <= last && !byQuarter.has(q + 1)) {
        tr.appendChild(valueCell(halves.get(q), 2));
        q++;
      } else {
        tr.appendChild(el('td', {className: 'kpi-cell kpi-none', 'aria-label': 'not stated'}, '–'));
      }
    }
    tbody.appendChild(tr);
  }

  const table = el('table', {className: 'kpis'}, el('thead', {}, head), tbody);
  table.addEventListener('mouseleave', () => show(pinned));

  const defs = data.kpis.definitions && typeof data.kpis.definitions === 'object'
    ? data.kpis.definitions : {};
  const defList = el('ul', {className: 'kpi-defs'});
  for (const c of ctx.list) {
    if (typeof defs[c.code] === 'string') {
      defList.appendChild(el('li', {}, el('strong', {}, String(c.name ?? c.code)), ': ',
        defs[c.code]));
    }
  }

  // Definitions stay closed on screen and print open.
  let defBox = null;
  if (defList.childElementCount) {
    defBox = el('details', {className: 'kpi-defs'}, el('summary', {}, 'Definitions'), defList);
    let wasOpen = false;
    window.addEventListener('beforeprint', () => {
      wasOpen = defBox.open;
      defBox.open = true;
    });
    window.addEventListener('afterprint', () => { defBox.open = wasOpen; });
  }

  const wrap = el('div', {className: 'table-wrap'}, table);
  bodyOf(panel).replaceChildren(...[
    wrap,
    detail,
    el('p', {className: 'footnote'}, 'As reported by each company; definitions differ, so '
      + 'figures are not directly comparable. A half-year figure spans two quarters only where '
      + 'no quarterly figure is published. Colors saturate at ±' + KPI_CLAMP + '%.'),
    defBox,
  ].filter(Boolean));
  // Newest quarter first on narrow screens: start the grid scrolled to its right end.
  wrap.scrollLeft = wrap.scrollWidth;
}

// ---------- Panel C: guidance tracker ----------

const PERIOD_RANK = {FY: 0, H1: 1, H2: 2, Q1: 3, Q2: 4, Q3: 5, Q4: 6};
const SUMMARY_STATUSES = ['raised', 'cut', 'new', 'held', 'withdrawn'];
const CHANGE_STATUSES = ['raised', 'cut', 'new', 'withdrawn'];
const MATRIX_METRICS = [['organic_growth', 'Organic growth'], ['operating_margin', 'Margin']];

// [year, rank] for "FY 2026", "H2 2026" or "Q3 2026"; null for anything else (e.g. medium_term).
function periodKey(period) {
  const m = /^(FY|H[12]|Q[1-4]) (\d{4})$/.exec(String(period ?? ''));
  return m ? [Number(m[2]), PERIOD_RANK[m[1]]] : null;
}

// The record a matrix cell shows: a current-calendar-year period if any, else the earliest
// period; ties go to the newest set_date.
function headlineRecord(records, year) {
  const key = (r) => periodKey(r.period) || [Infinity, 0];
  const setDate = (r) => (isIsoDate(r.set_date) ? r.set_date.slice(0, 10) : '');
  const inYear = records.filter((r) => periodKey(r.period)?.[0] === year);
  return [...(inYear.length ? inYear : records)].sort((a, b) => key(a)[0] - key(b)[0]
    || key(a)[1] - key(b)[1] || setDate(b).localeCompare(setDate(a)))[0] || null;
}

// [status, count] pairs in the given order; a status shows at 0 only if listed in `always`.
function statusCounts(records, statuses, always) {
  return statuses.map((s) => [s, records.filter((r) => r.status === s).length])
    .filter(([s, n]) => n > 0 || always.includes(s));
}

// "free_cash_flow" -> "Free cash flow", "eps" -> "EPS".
function metricLabel(metric) {
  return capitalize(String(metric ?? '').replace(/_/g, ' ').replace(/\beps\b/gi, 'EPS'));
}

function guidanceCell(r, label, year) {
  const td = el('td', {className: 'g-cell', 'data-label': label});
  if (!r) {
    td.appendChild(el('span', {className: 'muted'}, '–'));
    return td;
  }
  const value = String(r.value ?? '');
  const quote = String(r.quote ?? '');
  const period = String(r.period ?? '').replace(/_/g, ' ');
  const s = typeof r.status === 'string' ? r.status : 'unknown';
  td.append(
    // The headline's quote is not in the detail row, so it rides in the value's tooltip.
    el('div', {className: 'g-value', title: quote ? value + ' — ' + quote : value}, value),
    // The set date links to the source; without a valid date the link reads "source".
    el('div', {className: 'g-meta muted'},
      period && period !== 'FY ' + year ? el('span', {className: 'g-period'}, period + ': ') : null,
      statusBadge(s, capitalize(s)), ' · ',
      link(r.source_url, isIsoDate(r.set_date) ? fmtDay(r.set_date) : 'source')));
  return td;
}

function renderGuidance(ctx, data) {
  const panel = 'panel-guidance';
  filterGuidance = null;
  const records = currentGuidance(data.guidance);
  if (!records.length) return empty(panel, 'No guidance records yet.');

  const year = Number(ctx.today.slice(0, 4));
  // Status changes first, then held, then anything else; newest set_date first within each.
  const rank = (r) => (Object.hasOwn(STATUS_RANK, r.status) ? STATUS_RANK[r.status] : 2);
  const setDate = (r) => (isIsoDate(r.set_date) ? r.set_date.slice(0, 10) : '');
  const byStatus = (a, b) => rank(a) - rank(b) || setDate(b).localeCompare(setDate(a))
    || String(a.metric).localeCompare(String(b.metric));
  const companyOf = (r) => String(r.company ?? '');
  const badges = (pairs) => pairs.flatMap(([s, n], i) => [i ? ' · ' : null, statusBadge(s, `${n} ${s}`)]);

  // G1: counts first, then the companies with nothing on file.
  const summary = el('p', {className: 'g-summary'},
    ...badges(statusCounts(records, SUMMARY_STATUSES, ['raised', 'cut'])));
  const missing = ctx.list.filter((c) => !records.some((r) => companyOf(r) === c.code));
  const missingLine = missing.length ? el('p', {className: 'g-missing muted'},
    'No guidance on file: ' + missing.map((c) => c.code).join(', ')) : null;

  // G4: chips share the one focused company with the tiles and the chart.
  const chips = el('div', {className: 'g-chips', role: 'group',
    'aria-label': 'Filter guidance by company'});
  const allChip = el('button', {type: 'button', className: 'g-chip', 'aria-pressed': 'true'}, 'All');
  allChip.addEventListener('click', () => setFocusedCompany(ctx, null));
  chips.appendChild(allChip);
  for (const c of ctx.list) {
    const chip = el('button', {type: 'button', className: 'g-chip', 'aria-pressed': 'false',
      'data-code': c.code, title: companyName(ctx, c.code)}, String(c.code));
    const color = safeColor(c.color);
    if (color) chip.style.borderLeftColor = color;
    chip.addEventListener('click', () => setFocusedCompany(ctx, c.code));
    chips.appendChild(chip);
  }

  // G2: one row per company in companies.json order; unknown codes follow so no record is lost.
  const known = ctx.list.map((c) => c.code);
  const extra = [...new Set(records.map(companyOf))].filter((c) => !Object.hasOwn(ctx.byCode, c));
  const entries = new Map(); // code -> {row, detail, more}

  function setOpen(entry, open) {
    // Never leave keyboard focus inside a row that is about to be hidden.
    if (!open && entry.detail.contains(document.activeElement)) entry.more.focus();
    entry.detail.hidden = !open;
    entry.more.setAttribute('aria-expanded', String(open));
  }

  const head = el('tr', {}, ...['Company', 'Organic growth', 'Margin', 'More']
    .map((h) => el('th', {scope: 'col'}, h)));
  const tbody = el('tbody');
  for (const code of [...known, ...extra]) {
    const mine = records.filter((r) => companyOf(r) === code);
    const isKnown = Object.hasOwn(ctx.byCode, code);
    const row = el('tr', {className: 'g-row'}, el('th', {scope: 'row', className: 'g-company',
      title: companyName(ctx, code)},
      isKnown ? companyChip(ctx, code) : code,
      // The chip shows the code; the full name stays for screen readers and the title.
      isKnown ? el('span', {className: 'visually-hidden'}, companyName(ctx, code)) : null));
    const entry = {row, detail: null, more: null};
    entries.set(code, entry);
    tbody.appendChild(row);
    if (!mine.length) {
      row.appendChild(el('td', {colspan: 3, className: 'muted g-none'}, 'No guidance on file'));
      continue;
    }

    const heads = MATRIX_METRICS.map(([m]) => headlineRecord(mine.filter((r) => r.metric === m), year));
    MATRIX_METRICS.forEach(([, label], i) => row.appendChild(guidanceCell(heads[i], label, year)));

    // G3: the hidden records open in a detail row; changed statuses among them show on the
    // button. With nothing hidden, "Quotes" lists the headline records instead.
    const rest = mine.filter((r) => !heads.includes(r));
    const changed = statusCounts(rest, CHANGE_STATUSES, []);
    const label = rest.length ? `+${rest.length} more` : 'Quotes';
    const ariaLabel = [label, ...changed.map(([s, n]) => `${n} ${s}`),
      companyName(ctx, code) + ' guidance'].join(', ');
    entry.more = el('button', {type: 'button', className: 'g-more', 'aria-expanded': 'false',
      'aria-label': ariaLabel}, label, ...changed.map(([s, n]) => statusBadge(s, `${n} ${s}`)));
    row.appendChild(el('td', {className: 'g-more-cell'}, entry.more));

    const list = el('ul', {className: 'g-records'});
    let lastQuote = null;
    for (const r of (rest.length ? rest : heads.filter(Boolean)).sort(byStatus)) {
      const s = typeof r.status === 'string' ? r.status : 'unknown';
      const value = String(r.value ?? '');
      const quote = String(r.quote ?? '');
      // Skip a quote that only repeats the value or the quote just above it.
      const showQuote = quote && quote !== lastQuote
        && !(value && quote.toLowerCase().includes(value.toLowerCase()));
      if (showQuote) lastQuote = quote;
      list.appendChild(el('li', {},
        el('span', {className: 'g-label'}, metricLabel(r.metric),
          el('span', {className: 'date'}, String(r.period ?? '').replace(/_/g, ' '))),
        el('strong', {className: 'g-rec-value'}, value),
        el('span', {className: 'g-meta muted'}, statusBadge(s, capitalize(s)), ' · ',
          link(r.source_url, isIsoDate(r.set_date) ? fmtDay(r.set_date) : 'source')),
        showQuote ? el('span', {className: 'g-quote', title: quote}, quote) : null));
    }
    entry.detail = el('tr', {className: 'g-detail', hidden: ''}, el('td', {colspan: 4}, list));
    tbody.appendChild(entry.detail);
    entry.more.addEventListener('click', () => setOpen(entry, entry.detail.hidden));
  }
  const table = el('table', {className: 'g-matrix'}, el('thead', {}, head), tbody);

  // G6: every detail row prints open; the filter is screen-only CSS, so all companies print.
  const details = [...entries.values()].map((e) => e.detail).filter(Boolean);
  let closedForPrint = [];
  window.addEventListener('beforeprint', () => {
    closedForPrint = details.filter((d) => d.hidden);
    for (const d of closedForPrint) d.hidden = false;
  });
  window.addEventListener('afterprint', () => {
    for (const d of closedForPrint) d.hidden = true;
    closedForPrint = [];
  });

  bodyOf(panel).replaceChildren(...[summary, missingLine, chips, table].filter(Boolean));

  // Called by setFocusedCompany: show only the focused company's row. Details stay as the
  // reader left them; "+n more" opens them.
  filterGuidance = () => {
    for (const chip of chips.querySelectorAll('.g-chip')) {
      chip.setAttribute('aria-pressed', String((chip.dataset.code ?? null) === focusedCode));
    }
    table.classList.toggle('is-filtering', focusedCode !== null);
    for (const [code, e] of entries) {
      e.row.classList.toggle('is-focus', code === focusedCode);
      e.detail?.classList.toggle('is-focus', code === focusedCode);
    }
    const target = focusedCode === null ? null : entries.get(focusedCode) || null;
    // Focus left in a row the filter just hid moves to the shown company's button, or "All".
    const active = document.activeElement;
    if (active && table.contains(active) && !active.getClientRects().length) {
      (target?.more || allChip).focus();
    }
  };
  filterGuidance();
}

// ---------- Panel D: events ----------

function renderEvents(ctx, data) {
  const panel = 'panel-events';
  const items = upcomingEvents(data.events, ctx.today, 90);
  if (!items.length) return empty(panel, 'No events in the next 90 days.');
  const body = bodyOf(panel);
  body.replaceChildren();
  let month = null;
  let list = null;
  for (const e of items) {
    const m = monthHeading(e.date);
    if (m !== month) {
      month = m;
      body.appendChild(el('h3', {className: 'month'}, m));
      list = el('ul', {className: 'events'});
      body.appendChild(list);
    }
    list.appendChild(el('li', {},
      companyChip(ctx, e.company),
      el('span', {className: 'nowrap date'},
        fmtDate(e.date) + (e.confirmed === true ? '' : ' (est.)')),
      el('span', {className: 'etype'}, String(e.type ?? '').replace(/_/g, ' ')),
      e.source_url && safeUrl(e.source_url) ? link(e.source_url, String(e.title ?? ''))
        : el('span', {}, String(e.title ?? ''))));
  }
}

// ---------- Panel E: press releases ----------

function renderPress(ctx, data) {
  const panel = 'panel-press';
  const all = Array.isArray(data.press?.items) ? data.press.items : [];
  const since = addDays(ctx.today, -30);
  const items = all.filter((p) => p && isIsoDate(p.published) && p.published.slice(0, 10) >= since)
    .sort((a, b) => (Number(b.flagged === true) - Number(a.flagged === true))
      || b.published.localeCompare(a.published));
  if (!items.length) return empty(panel, 'No press releases in the last 30 days.');
  const list = el('ul', {className: 'press'});
  for (const p of items) {
    const flagged = p.flagged === true;
    list.appendChild(el('li', {className: flagged ? 'flagged' : 'unflagged'},
      companyChip(ctx, p.company),
      el('span', {className: 'nowrap date'}, fmtDate(p.published)),
      flagged ? el('span', {className: 'chip category'},
        String(p.category ?? '').replace(/_/g, ' ')) : null,
      el('span', {className: 'title'}, link(p.url, String(p.title ?? '')))));
  }
  bodyOf(panel).replaceChildren(list);
}

// ---------- Panel F: data health ----------

function renderHealth(ctx, data) {
  const panel = 'panel-health';
  const st = data.status;
  if (!st || typeof st !== 'object') return empty(panel, 'Run status unavailable.');
  const sources = st.sources && typeof st.sources === 'object' ? st.sources : {};
  const names = Object.keys(sources);
  const okCount = names.filter((n) => sources[n]?.ok === true).length;
  const total = Number.isInteger(st.counts?.sources_total) ? st.counts.sources_total : names.length;
  const ok = Number.isInteger(st.counts?.sources_ok) ? st.counts.sources_ok : okCount;
  const age = st.guidance_age_days;

  const facts = el('ul', {className: 'facts'},
    el('li', {}, 'Last run: ' + (st.run_at ? fmtTimestamp(st.run_at) : 'unknown')),
    el('li', {className: ok < total ? 'warn' : ''}, `${ok}/${total} sources healthy`),
    el('li', {}, 'Runtime: ' + (typeof st.runtime_ms === 'number'
      ? (st.runtime_ms / 1000).toFixed(1) + ' s' : 'unknown')),
    el('li', {}, 'Guidance age: ' + (typeof age === 'number' ? age + ' days' : 'no guidance yet')),
    el('li', {}, el('a', {href: 'data/status.json'}, 'data/status.json')));
  const body = bodyOf(panel);
  body.replaceChildren(facts);

  const failing = names.filter((n) => sources[n]?.ok !== true);
  if (failing.length) {
    const ul = el('ul', {className: 'failing'});
    for (const n of failing) {
      ul.appendChild(el('li', {}, el('strong', {}, n), ': ',
        String(sources[n]?.error ?? 'failed (no error text)')));
    }
    body.appendChild(el('p', {className: 'muted'}, 'Failing sources:'));
    body.appendChild(ul);
  }
}

// ---------- main ----------

function runPanel(panelId, fn, ctx, data) {
  try {
    fn(ctx, data);
  } catch (err) {
    console.warn('[holdco] ' + panelId + ' failed to render:', err);
    empty(panelId, 'This panel could not be rendered.');
  }
}

async function main() {
  const [companies, prices, guidance, events, press, status, kpis] = await Promise.all([
    loadJSON('companies.json'), loadJSON('prices.json'), loadJSON('guidance.json'),
    loadJSON('events.json'), loadJSON('press_releases.json'), loadJSON('status.json'),
    loadJSON('kpis.json'),
  ]);
  const bench = companies?.benchmark;
  const ctx = {
    ...companyLookup(companies),
    benchmark: bench && typeof bench.symbol === 'string' ? bench : null,
    today: todayIso(),
  };
  const data = {prices, guidance, events, press, status, kpis};

  document.getElementById('as-of').textContent = status?.run_at
    ? 'as of ' + fmtTimestamp(status.run_at) : 'as of unknown';

  runPanel('panel-scan', renderScan, ctx, data);
  runPanel('panel-chart', renderChart, ctx, data);
  runPanel('panel-kpis', renderKpis, ctx, data);
  runPanel('panel-guidance', renderGuidance, ctx, data);
  runPanel('panel-events', renderEvents, ctx, data);
  runPanel('panel-press', renderPress, ctx, data);
  runPanel('panel-health', renderHealth, ctx, data);

  // The one Esc handler: clears the focused company and unpins a KPI cell (R6).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (focusedCode !== null) setFocusedCompany(ctx, null);
    if (unpinKpi) unpinKpi();
  });

  // A #CODE link focuses that company; only codes from companies.json count, in any case.
  const wanted = location.hash.slice(1).toUpperCase();
  const linked = ctx.list.find((c) => String(c.code).toUpperCase() === wanted);
  if (wanted && linked) setFocusedCompany(ctx, linked.code);
}

main();
