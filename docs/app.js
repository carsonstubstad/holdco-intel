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

function statusBadge(status) {
  const s = typeof status === 'string' ? status : 'unknown';
  return el('span', {className: 'badge status-' + s.replace(/[^a-z_]/g, '')}, s);
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
    if (color) tile.style.borderTopColor = color;
    tile.appendChild(el('div', {className: 'tile-name'}, String(c.name ?? c.code)));
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
    tile.appendChild(el('div', {className: 'tile-guidance'},
      mine.length ? statusBadge(mine[0].status)
        : el('span', {className: 'badge status-none'}, 'no guidance yet')));

    const next = events.find((e) => e.company === c.code);
    tile.appendChild(el('div', {className: 'tile-event muted'}, next
      ? `next: ${String(next.type).replace(/_/g, ' ')} in ${daysBetween(ctx.today, next.date)} days`
      : 'no event scheduled'));

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

function drawChart(ctx, data, aligned, win) {
  const {series, union, bench} = aligned;
  const start = windowStart(win, union);
  let b = union.findIndex((d) => d >= start);
  if (b < 0) b = 0;
  const x = union.slice(b);

  const traces = series.map((s) => {
    const name = escapeHtml(s.company.name ?? s.company.code);
    return {
      type: 'scatter',
      mode: 'lines',
      name,
      x,
      y: rebased(s.filled.slice(b)),
      line: {width: 2, color: safeColor(s.company.color) || undefined},
      hovertemplate: '%{fullData.name}: %{y:.1f}<extra></extra>',
    };
  });
  if (bench) {
    traces.push({
      type: 'scatter',
      mode: 'lines',
      name: escapeHtml(bench.name),
      x,
      y: rebased(bench.filled.slice(b)),
      line: {width: 1.5, color: '#5f6368', dash: 'dash'},
      legendrank: 2000,
      hovertemplate: '%{fullData.name}: %{y:.1f}<extra></extra>',
    });
  }

  const first = x[0];
  const last = x[x.length - 1];
  const items = Array.isArray(data.events?.items) ? data.events.items : [];
  const marks = items.filter((e) => e && isIsoDate(e.date) && MARKER_TYPES.includes(e.type)
    && e.date.slice(0, 10) >= first && e.date.slice(0, 10) <= last);

  const shapes = [{
    type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: 100, y1: 100,
    line: {color: '#9aa0a6', width: 1, dash: 'dot'},
  }];
  if (marks.length) {
    // Vertical event lines as one trace of null-separated segments, so the Events
    // legend entry toggles them together with the markers (shapes ignore the legend).
    traces.push({
      type: 'scatter',
      mode: 'lines',
      name: 'Events',
      legendgroup: 'events',
      showlegend: false,
      hoverinfo: 'skip',
      x: marks.flatMap((e) => [e.date.slice(0, 10), e.date.slice(0, 10), null]),
      y: marks.flatMap(() => [0, 1.04, null]),
      yaxis: 'y2',
      line: {color: '#80868b', width: 1, dash: 'dash'},
    });
    // One small marker per event at the top of the plot carries the hover text.
    traces.push({
      type: 'scatter',
      mode: 'markers',
      name: 'Events',
      legendgroup: 'events',
      x: marks.map((e) => e.date.slice(0, 10)),
      y: marks.map(() => 1),
      yaxis: 'y2',
      marker: {symbol: 'triangle-down', size: 9, color: '#5f6368'},
      hovertext: marks.map((e) => escapeHtml(
        `${companyName(ctx, e.company)} ${String(e.type).replace(/_/g, ' ')} ${e.title ?? ''}`)),
      hovertemplate: '%{hovertext}<extra></extra>',
    });
  }

  const layout = {
    margin: {l: 44, r: 12, t: 12, b: 40},
    hovermode: 'x unified',
    showlegend: true,
    legend: {orientation: 'h', y: -0.15, x: 0},
    xaxis: {type: 'date', range: [first, last], fixedrange: false},
    yaxis: {title: {text: ''}, zeroline: false},
    yaxis2: {overlaying: 'y', range: [0, 1.04], visible: false, fixedrange: true},
    shapes,
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    font: {family: getComputedStyle(document.body).fontFamily, size: 12},
  };
  return Plotly.react('chart', traces, layout, {displaylogo: false, responsive: true});
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

  const buttons = document.querySelectorAll('#panel-chart .windows button');
  const select = (win) => {
    buttons.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.window === win)));
    drawChart(ctx, data, aligned, win);
  };
  buttons.forEach((btn) => btn.addEventListener('click', () => select(btn.dataset.window)));
  select('YTD');
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

  const head = el('tr', {}, el('th', {scope: 'col'}, el('span', {className: 'visually-hidden'},
    'Company')));
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
    const name = el('th', {scope: 'row', className: 'kpi-company'}, String(c.name ?? c.code));
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

  bodyOf(panel).replaceChildren(
    el('div', {className: 'table-wrap'}, table),
    detail,
    el('p', {className: 'footnote'}, 'As reported by each company; definitions differ, so '
      + 'figures are not directly comparable. A half-year figure spans two quarters only where '
      + 'no quarterly figure is published. Colors saturate at ±' + KPI_CLAMP + '%.'),
    defList);
}

// ---------- Panel C: guidance tracker ----------

function renderGuidance(ctx, data) {
  const panel = 'panel-guidance';
  const rows = currentGuidance(data.guidance)
    .sort((a, b) => String(a.company).localeCompare(String(b.company))
      || String(a.metric).localeCompare(String(b.metric)));
  if (!rows.length) return empty(panel, 'No guidance records yet.');

  const head = el('tr', {}, ...['Company', 'Metric', 'Period', 'Value', 'Status', 'Set',
    'Quote', 'Source', 'Age'].map((h) => el('th', {scope: 'col'}, h)));
  const tbody = el('tbody');
  for (const r of rows) {
    const quote = String(r.quote ?? '');
    const short = quote.length > 160 ? quote.slice(0, 159) + '…' : quote;
    tbody.appendChild(el('tr', {},
      el('td', {}, companyChip(ctx, r.company)),
      el('td', {}, String(r.metric ?? '').replace(/_/g, ' ')),
      el('td', {}, String(r.period ?? '')),
      el('td', {className: 'value'}, String(r.value ?? '')),
      el('td', {}, statusBadge(r.status)),
      el('td', {className: 'nowrap'}, isIsoDate(r.set_date) ? fmtDate(r.set_date) : ''),
      el('td', {className: 'quote', title: quote}, short),
      el('td', {}, link(r.source_url, 'source')),
      el('td', {className: 'nowrap'},
        isIsoDate(r.set_date) ? daysBetween(r.set_date, ctx.today) + 'd' : '')));
  }
  bodyOf(panel).replaceChildren(el('div', {className: 'table-wrap'},
    el('table', {}, el('thead', {}, head), tbody)));
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
}

main();
