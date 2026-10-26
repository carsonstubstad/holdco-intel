'use strict';
// Holdco Intel dashboard. Plain DOM, no framework. All external text goes in via text nodes.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MARKER_TYPES = ['results', 'capital_markets_day', 'deal'];
const DAY_MS = 86400000;
const NBSP = String.fromCharCode(160); // keeps a headline figure on its label's line
const HOVER_BR = '<br>'; // the only markup joined into Plotly hover text; every part is escaped

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

// "6 Aug" in the given year, "2 Feb 2027" otherwise.
function fmtDayIn(iso, year) {
  return iso.slice(0, 4) === String(year) ? fmtDay(iso) : fmtDate(iso);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtTimestamp(ts) {
  const t = new Date(ts);
  return Number.isNaN(t.getTime()) ? String(ts) : t.toLocaleString();
}

// ---------- number helpers ----------

function pct(a, b) {
  return (a / b - 1) * 100;
}

// Rounded first, then signed, so a value that rounds to zero reads "0.0%", never "-0.0%".
function signedPct(p) {
  const r = Number(p.toFixed(1));
  return (r > 0 ? '+' : '') + (r === 0 ? 0 : r).toFixed(1) + '%';
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

// ---------- shared view state: one company selection, chart toggles ----------

let selected = new Set(); // codes the cards, guidance, quotes and chart show; set in main()
let benchVisible = true;
let eventsVisible = true;
let redrawChart = null; // set by renderChart once the chart exists
let showSelection = null; // set by renderCards
let redrawQuotes = null; // set by renderQuotes after its first draw
let redrawGuidanceFold = null; // set by renderGuidanceFold after its first draw
let unpinKpi = null; // set by renderKpis
let redrawPress = null; // set by renderPress after its first draw
let resetPress = null; // set by renderPress: collapses an expanded press list (Esc)

function allCodes(ctx) {
  return ctx.list.map((c) => c.code);
}

// Codes named in the URL hash (#PUB,WPP), in companies.json order; unknown codes are ignored.
// [] when none is valid (or the hash does not decode): the hash is then not a selection, e.g.
// an in-page anchor, and is left alone.
function selectionFromHash(ctx) {
  let raw = '';
  try {
    raw = decodeURIComponent(location.hash.slice(1));
  } catch (e) {
    raw = '';
  }
  const wanted = new Set(raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
  return allCodes(ctx).filter((c) => wanted.has(String(c).toUpperCase()));
}

// The URL carries the selection (#PUB,WPP) without adding history entries; all six clears it.
function writeHash(ctx) {
  const codes = allCodes(ctx).filter((c) => selected.has(c));
  history.replaceState(null, '', codes.length === ctx.list.length
    ? location.pathname + location.search : '#' + codes.join(','));
}

// The one setter: sets the shown companies and updates every view that follows them.
function setSelection(ctx, codes, announce = true) {
  const want = new Set(codes);
  let next = allCodes(ctx).filter((c) => want.has(c));
  if (!next.length) next = allCodes(ctx);
  if (next.length === selected.size && next.every((c) => selected.has(c))) return;
  selected = new Set(next);
  safeRedraw('panel-cards', showSelection, () => { showSelection = null; });
  safeRedraw('panel-chart', redrawChart, () => { redrawChart = null; });
  safeRedraw('fold-guidance', redrawGuidanceFold, () => { redrawGuidanceFold = null; });
  safeRedraw('panel-quotes', redrawQuotes, () => { redrawQuotes = null; });
  safeRedraw('panel-press', redrawPress, () => { redrawPress = null; resetPress = null; });
  writeHash(ctx);
  if (announce) {
    document.getElementById('announce').textContent = next.length === ctx.list.length
      ? 'Showing all companies' : 'Showing ' + next.map((c) => companyName(ctx, c)).join(', ');
  }
}

// A redraw that fails leaves its panel's grey sentence, so the setter always finishes.
function safeRedraw(panelId, fn, clear) {
  if (!fn) return;
  try {
    fn();
  } catch (err) {
    console.warn('[holdco] ' + panelId + ' failed to redraw:', err);
    clear();
    failPanel(panelId);
  }
}

// Hides or shows one company; the last one shown stays shown.
function toggleCompany(ctx, code) {
  if (!selected.has(code)) return setSelection(ctx, [...selected, code]);
  if (selected.size === 1) {
    document.getElementById('announce').textContent = 'At least one company stays shown';
    return;
  }
  setSelection(ctx, [...selected].filter((c) => c !== code));
}

// Shows or hides the benchmark line; the toggle button and the legend entry stay in sync.
function setBenchmarkVisible(on) {
  benchVisible = on;
  document.querySelector('#panel-chart .bench-toggle')?.setAttribute('aria-pressed', String(on));
  if (redrawChart) redrawChart();
}

// ---------- What changed strip ----------

const CHANGES_LIMIT = 6;

// Upcoming results and recent guidance changes for all companies; never the guidance counts.
function renderChanges(ctx, data) {
  const panel = 'panel-changes';
  const since = addDays(ctx.today, -30);
  const coming = upcomingEvents(data.events, ctx.today, 14).filter((e) => e.type === 'results')
    .slice(0, CHANGES_LIMIT);
  const recent = currentGuidance(data.guidance)
    .filter((r) => isIsoDate(r.set_date) && r.set_date.slice(0, 10) >= since
      && r.set_date.slice(0, 10) <= ctx.today)
    .sort((a, b) => b.set_date.localeCompare(a.set_date))
    .slice(0, CHANGES_LIMIT - coming.length);
  if (!coming.length && !recent.length) {
    return empty(panel,
      'No results in the next 14 days and no guidance changes in the last 30 days.');
  }

  const group = (title, items) => el('div', {className: 'c-group'},
    el('h3', {className: 'month'}, title), el('ul', {className: 'c-list'}, ...items));
  const groups = el('div', {className: 'c-groups'});
  if (coming.length) {
    groups.appendChild(group('Coming up', coming.map((e) => {
      const n = daysBetween(ctx.today, e.date);
      const date = fmtDay(e.date) + (e.confirmed === true ? '' : ' (est.)');
      return el('li', {},
        companyChip(ctx, e.company),
        el('span', {className: 'etype'}, 'Results'),
        el('span', {className: 'nowrap date'}, safeUrl(e.source_url) ? link(e.source_url, date) : date),
        n === 0 ? el('span', {className: 'badge badge-today'}, 'Reports today')
          : el('span', {className: 'muted'}, n === 1 ? 'Tomorrow' : `in ${n} days`));
    })));
  }
  if (recent.length) {
    groups.appendChild(group('Recent guidance', recent.map((r) => {
      const s = String(r.status ?? 'unknown');
      return el('li', {},
        statusBadge(s, capitalize(s)),
        companyChip(ctx, r.company),
        el('span', {}, metricLabel(r.metric)),
        el('span', {className: 'date'}, String(r.period ?? '').replace(/_/g, ' ')),
        el('strong', {className: 'c-value'}, String(r.value ?? '')),
        el('span', {className: 'nowrap date'}, link(r.source_url, fmtDay(r.set_date))));
    })));
  }

  // An in-page jump: link() opens a new tab, and the URL keeps the selection's #PUB,WPP.
  const more = el('a', {href: '#fold-guidance', className: 'c-more'}, 'See all guidance');
  more.addEventListener('click', (ev) => {
    ev.preventDefault();
    const fold = document.getElementById('fold-guidance');
    if (!fold) return;
    fold.open = true;
    fold.scrollIntoView();
    fold.querySelector('summary')?.focus({preventScroll: true});
  });
  bodyOf(panel).replaceChildren(groups, el('p', {className: 'c-more-line'}, more));
}

// ---------- Scorecards: compare chips and one card per company ----------

const STATUS_GLYPH = {raised: '▲', cut: '▼', held: '=', new: '+', withdrawn: '×'};

// "▲ Raised", "= 12 held": the glyph always comes with a word; an unknown status is the word only.
function statusLabel(s, word = capitalize(s)) {
  return (STATUS_GLYPH[s] ? STATUS_GLYPH[s] + ' ' : '') + word;
}

const MOVE_TITLE = 'close before results day to close after it';
// [label, metric, fallback metric, prefix naming the fallback]
const CARD_GUIDANCE = [['Top line', 'organic_growth', 'revenue', 'Revenue'],
  ['Profit', 'operating_margin', 'eps', 'EPS']];

// [end quarter index, quarters covered] for "Q3 2026", "H1 2026" or "FY 2026"; null otherwise.
function periodSpan(period) {
  const m = /^(Q[1-4]|H[12]|FY) ?(20\d{2})$/.exec(String(period ?? ''));
  if (!m) return null;
  const base = Number(m[2]) * 4;
  if (m[1][0] === 'Q') return [base + Number(m[1][1]) - 1, 1];
  if (m[1] === 'H1') return [base + 1, 2];
  if (m[1] === 'H2') return [base + 3, 2];
  return [base + 3, 4];
}

// The row with the newest period that has a number in `field`; on a tie the shorter period
// wins (Q2 over H1, Q4 over FY).
function latestRow(rows, field) {
  const dated = rows.map((r) => [r, periodSpan(r.period)]).filter(([r, s]) => s && isNum(r[field]));
  dated.sort((a, b) => b[1][0] - a[1][0] || a[1][1] - b[1][1]);
  return dated.length ? dated[0][0] : null;
}

// "Q2 2026" -> "Q2 26".
function shortPeriod(period) {
  return String(period ?? '').replace(/ 20(\d{2})$/, ' $1');
}

// The reporting period an event title names ("Q3 2026 revenue" -> "Q3"), or null.
function titlePeriod(title) {
  const t = String(title ?? '');
  const m = /\b(Q[1-4]|H[12]|FY)/.exec(t);
  if (m) return m[1];
  return /\binterim\b|\bhalf[- ]year/i.test(t) ? 'H1' : null;
}

function cardRow(kind, label, ...content) {
  return el('div', {className: 'card-row card-' + kind}, el('div', {className: 'label'}, label),
    ...content);
}

function growthRow(rows) {
  const r = latestRow(rows, 'organic_growth_pct');
  if (!r) return cardRow('growth', 'Organic growth', el('div', {className: 'card-fig muted'}, '–'));
  const [end, len] = periodSpan(r.period);
  const why = len === 1 ? null
    : (len === 2 ? 'Half-year' : 'Full-year') + ' figure; no quarter before to compare';
  let delta = el('div', {className: 'card-delta muted', title: why}, '–');
  if (len === 1) {
    const d = quarterDelta(quarterRows(rows), end);
    const prev = end - 1;
    if (d === null) {
      delta.title = `No ${quarterLabel(prev)} figure to compare`;
    } else {
      const vs = Math.floor(prev / 4) === Math.floor(end / 4) ? `Q${(prev % 4) + 1}`
        : shortPeriod(quarterLabel(prev));
      delta = el('div', {className: 'card-delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat')},
        `${d > 0 ? '▲ +' : d < 0 ? '▼ ' : ''}${d.toFixed(1)} pp vs ${vs}`);
    }
  }
  return cardRow('growth', 'Organic growth · ' + shortPeriod(r.period),
    el('div', {className: 'card-fig'}, kpiText(r.organic_growth_pct)), delta);
}

function marginRow(rows) {
  const r = latestRow(rows, 'margin_pct');
  if (!r) return cardRow('margin', 'Margin', el('div', {className: 'card-fig muted'}, '–'));
  const basis = typeof r.margin_metric === 'string' && r.margin_metric ? r.margin_metric : null;
  return cardRow('margin', ['Margin', shortPeriod(r.period), basis].filter(Boolean).join(' · '),
    el('div', {className: 'card-fig'}, String(r.margin_pct) + '%'));
}

// One guidance line: label, value (with a prefix naming a fallback metric or a period that is
// not this year's FY), then status glyph and word and the set date linked to the source.
function guidanceLine(label, r, prefix, year) {
  const line = el('div', {className: 'cg-line'}, el('div', {className: 'cg-label'}, label));
  if (!r) {
    line.appendChild(el('div', {className: 'cg-value muted'}, '–'));
    return line;
  }
  const value = String(r.value ?? '');
  const period = String(r.period ?? '').replace(/_/g, ' ');
  const pre = [prefix, period && period !== 'FY ' + year ? period + ':' : null]
    .filter(Boolean).join(' ');
  const s = typeof r.status === 'string' ? r.status : 'unknown';
  const date = link(r.source_url,
    isIsoDate(r.set_date) ? fmtDayIn(r.set_date, year) : 'source');
  if (date.nodeType === Node.ELEMENT_NODE) {
    date.append(' ', el('span', {'aria-hidden': 'true'}, '↗'));
  }
  line.append(
    el('div', {className: 'cg-value', title: pre ? pre + ' ' + value : value},
      pre ? el('span', {className: 'muted'}, pre + ' ') : null, value),
    el('div', {className: 'cg-meta'},
      statusBadge(s, statusLabel(s)), ' · ', date));
  return line;
}

function guidanceRow(records, year) {
  if (!records.length) {
    return cardRow('guidance', 'Guidance',
      el('div', {className: 'cg-line'}, el('div', {className: 'cg-label'}, 'Top line'),
        el('div', {className: 'cg-value muted'}, 'No guidance on file')),
      guidanceLine('Profit', null, null, year));
  }
  return cardRow('guidance', 'Guidance', ...CARD_GUIDANCE.map(([label, metric, fallback, name]) => {
    const main = headlineRecord(records.filter((r) => r.metric === metric), year);
    const alt = main ? null : headlineRecord(records.filter((r) => r.metric === fallback), year);
    return guidanceLine(label, main || alt, alt ? name : null, year);
  }));
}

// YTD (the chart's own rebased numbers) and the move from the close before the latest results
// day to the close after it, from the company's real closes only.
function sharesRow(ctx, c, ytd, series, results) {
  const out = [];
  out.push(isNum(ytd) ? el('div', {className: 'card-ytd'}, signedPct(ytd) + ' YTD')
    : el('div', {className: 'card-ytd muted'}, 'YTD: –'));
  const ev = results.filter((e) => e.company === c.code)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!ev) {
    out.push(el('div', {className: 'card-move muted'}, 'No results on file'));
  } else {
    const day = ev.date.slice(0, 10);
    const p = titlePeriod(ev.title);
    const label = `Share move on ${p ? p + ' ' : ''}results`;
    const pts = nonNullPoints(series);
    const before = pts.filter(([d]) => d < day).pop();
    const after = pts.find(([d]) => d > day);
    const move = before && after ? pct(after[1], before[1]) : null;
    if (isNum(move)) {
      out.push(el('div', {className: 'card-move', title: MOVE_TITLE},
        label + ' ', el('span', {className: 'nowrap'}, signedPct(move))));
    } else if (before && after) {
      out.push(el('div', {className: 'card-move muted', title: MOVE_TITLE}, label + ': –'));
    } else {
      out.push(el('div', {className: 'card-move muted', title: MOVE_TITLE},
        label + (before ? ': pending' : ': –')));
    }
  }
  return cardRow('shares', 'Shares', ...out);
}

function nextRow(ctx, c, upcoming) {
  const e = upcoming.find((x) => x.company === c.code && x.type === 'results');
  if (!e) return cardRow('next', 'Next', el('div', {className: 'muted'}, 'No date yet'));
  const p = titlePeriod(e.title);
  const text = fmtDayIn(e.date, ctx.today.slice(0, 4)) + (e.confirmed === true ? '' : ' (est.)');
  return cardRow('next', 'Next' + (p ? ' · ' + p : ''),
    el('div', {className: 'card-date'}, link(e.source_url, text),
      e.date.slice(0, 10) === ctx.today
        ? el('span', {className: 'badge badge-today'}, 'Reports today') : null));
}

// YTD per company code, from the same aligned and rebased lines as the chart's YTD window.
function ytdByCode(ctx, prices) {
  const out = {};
  if (!prices || typeof prices.series !== 'object' || prices.series === null) return out;
  const aligned = buildAligned(ctx, prices);
  if (!aligned.union.length) return out;
  const start = windowStart('YTD', aligned.union);
  let b = aligned.union.findIndex((d) => d >= start);
  if (b < 0) b = 0;
  for (const s of aligned.series) {
    const end = rebased(s.filled.slice(b)).findLast((v) => v !== null);
    if (isNum(end)) out[s.company.code] = end - 100;
  }
  return out;
}

function renderCards(ctx, data) {
  const panel = 'panel-cards';
  const chipRow = document.querySelector('#' + panel + ' .compare');
  const note = document.querySelector('#' + panel + ' .compare-note');
  showSelection = null;
  if (!ctx.list.length) {
    chipRow.replaceChildren();
    chipRow.hidden = true;
    note.hidden = true;
    return empty(panel, 'Company list unavailable.');
  }

  const year = Number(ctx.today.slice(0, 4));
  const kpiRows = (Array.isArray(data.kpis?.rows) ? data.kpis.rows : [])
    .filter((r) => r && typeof r.company === 'string');
  const guidance = currentGuidance(data.guidance);
  const items = Array.isArray(data.events?.items) ? data.events.items : [];
  const results = items.filter((e) => e && e.type === 'results' && isIsoDate(e.date)
    && e.date.slice(0, 10) <= ctx.today);
  const upcoming = upcomingEvents(data.events, ctx.today, null);
  const series = data.prices?.series && typeof data.prices.series === 'object'
    ? data.prices.series : {};
  const ytd = ytdByCode(ctx, data.prices);

  // K4: every card has the same six rows, so a row of cards lines up on the subgrid.
  const cards = new Map();
  for (const c of ctx.list) {
    const card = el('article', {className: 'card', 'data-code': c.code});
    const color = safeColor(c.color);
    if (color) card.style.setProperty('--company', color);
    card.append(
      el('header', {className: 'card-head'},
        el('h3', {className: 'card-name'}, String(c.name ?? c.code)),
        el('span', {className: 'card-code'}, String(c.code))),
      growthRow(kpiRows.filter((r) => r.company === c.code)),
      marginRow(kpiRows.filter((r) => r.company === c.code)),
      guidanceRow(guidance.filter((r) => r.company === c.code), year),
      sharesRow(ctx, c, ytd[c.code], series[c.ticker], results),
      nextRow(ctx, c, upcoming));
    cards.set(c.code, card);
  }
  const body = bodyOf(panel);
  body.replaceChildren(...cards.values());

  // K2: "All", then one tick chip per company; built after the cards, so a card that fails
  // to render never leaves live chips behind.
  const tick = () => el('span', {className: 'tick', 'aria-hidden': 'true'}, '✓');
  const allChip = el('button', {type: 'button', className: 'compare-chip compare-all',
    'aria-pressed': 'true'}, tick(), 'All');
  allChip.addEventListener('click', () => setSelection(ctx, allCodes(ctx)));
  const chips = new Map();
  for (const c of ctx.list) {
    const chip = el('button', {type: 'button', className: 'compare-chip', 'aria-pressed': 'true',
      'data-code': c.code, title: companyName(ctx, c.code)}, tick(), String(c.code));
    const color = safeColor(c.color);
    if (color) chip.style.borderLeftColor = color;
    chip.addEventListener('click', () => toggleCompany(ctx, c.code));
    chips.set(c.code, chip);
  }
  chipRow.replaceChildren(allChip, ...chips.values());
  chipRow.hidden = false;

  // K5: the swipe row is a tab stop only on narrow screens, where it scrolls.
  const setTabStop = () => (NARROW.matches ? body.setAttribute('tabindex', '0')
    : body.removeAttribute('tabindex'));
  setTabStop();
  NARROW.addEventListener('change', setTabStop);

  // Unselected cards are hidden on screen only (CSS), so print shows all six (K7).
  showSelection = () => {
    const n = selected.size;
    const total = ctx.list.length;
    allChip.setAttribute('aria-pressed', String(n === total));
    for (const [code, chip] of chips) chip.setAttribute('aria-pressed', String(selected.has(code)));
    for (const [code, card] of cards) {
      const off = !selected.has(code);
      // Never leave keyboard focus inside a card that is about to be hidden.
      if (off && card.contains(document.activeElement)) chips.get(code).focus();
      card.classList.toggle('is-off', off);
    }
    note.textContent = n < total ? `Showing ${n} of ${total}` : '';
    note.hidden = n === total;
  };
  showSelection();
}

// ---------- In their words: management quotes by theme ----------

// [theme, label] in Q4's order; the first four are the theme buttons.
const QUOTE_THEMES = [['strategy', 'Strategy'], ['ai_and_data', 'AI & data'],
  ['clients_and_new_business', 'Clients'], ['outlook', 'Outlook'],
  ['performance', 'Performance'], ['capital_allocation', 'Capital allocation']];
const QUOTE_TABS = QUOTE_THEMES.slice(0, 4);
const SOURCE_LABEL = {
  results_release: 'Results release', call_transcript: 'Call transcript',
  results_slides: 'Results slides', annual_report: 'Annual report', investor_day: 'Investor day',
  strategy_plan: 'Strategy plan', announcement: 'Announcement',
};
const STRATEGY_TYPES = ['investor_day', 'annual_report', 'strategy_plan'];
const STRATEGY_MAX_DAYS = 365;

// The named speaker, or null; an empty or blank name counts as none.
function speakerOf(r) {
  const s = typeof r.speaker === 'string' ? r.speaker.trim() : '';
  return s || null;
}

// A missing source_type is a results release (the schema's rule).
function sourceLabel(type) {
  if (type === undefined || type === null) return SOURCE_LABEL.results_release;
  return Object.hasOwn(SOURCE_LABEL, type) ? SOURCE_LABEL[type] : 'Company document';
}

// Q3: Strategy prefers strategy material up to a year old; otherwise the newest quote. Ties go
// to a named speaker, then a call transcript, then the lower id.
function pickQuote(records, theme, today) {
  const mine = records.filter((r) => r.theme === theme);
  const recent = (r) => daysBetween(r.release_date, today) <= STRATEGY_MAX_DAYS;
  const strategic = theme !== 'strategy' ? []
    : mine.filter((r) => STRATEGY_TYPES.includes(r.source_type) && recent(r));
  const named = (r) => Number(speakerOf(r) !== null);
  const call = (r) => Number(r.source_type === 'call_transcript');
  return [...(strategic.length ? strategic : mine)].sort((a, b) =>
    b.release_date.slice(0, 10).localeCompare(a.release_date.slice(0, 10))
    || named(b) - named(a) || call(b) - call(a)
    || String(a.id).localeCompare(String(b.id)))[0] || null;
}

// "today", "3 days ago", "5 months ago", "over a year ago" (whole months of 30 days).
function ageText(iso, today) {
  const d = daysBetween(iso, today);
  if (d <= 0) return 'today';
  if (d < 30) return d === 1 ? '1 day ago' : `${d} days ago`;
  if (d >= 365) return 'over a year ago';
  const m = Math.floor(d / 30);
  return m === 1 ? '1 month ago' : `${m} months ago`;
}

// Q2: label and age | the quote in the serif | speaker · source · dated link. Never cut short.
function quoteRow(label, r, today) {
  const row = el('li', {className: 'q-row'}, el('div', {className: 'q-label'}, label,
    r ? el('span', {className: 'q-age'}, ageText(r.release_date, today)) : null));
  if (!r) {
    row.appendChild(el('p', {className: 'q-none'}, 'No quote on this theme yet.'));
    return row;
  }
  const date = link(r.source_url, fmtDate(r.release_date));
  if (date.nodeType === Node.ELEMENT_NODE) {
    date.append(' ', el('span', {'aria-hidden': 'true'}, '↗'));
  }
  const speaker = speakerOf(r);
  row.append(
    el('blockquote', {className: 'q-quote'}, '“' + r.quote.trim() + '”'),
    el('p', {className: 'q-attr'}, speaker ? speaker + ' · ' : null,
      sourceLabel(r.source_type), ' · ', date));
  return row;
}

// Quotes only: the curator's headlines in commentary.json are never shown on the site.
function renderQuotes(ctx, data) {
  const panel = 'panel-quotes';
  const themes = document.querySelector('#' + panel + ' .q-themes');
  const printTheme = document.querySelector('#' + panel + ' .q-print-theme');
  redrawQuotes = null;
  themes.hidden = true;
  if (!ctx.list.length) return empty(panel, 'Company list unavailable.');
  const known = new Set(QUOTE_THEMES.map(([t]) => t));
  const all = Array.isArray(data.commentary?.records) ? data.commentary.records : [];
  const records = all.filter((r) => r && typeof r.quote === 'string' && r.quote.trim()
    && typeof r.company === 'string' && known.has(r.theme) && isIsoDate(r.release_date));
  if (!records.length) return empty(panel, 'No management quotes on file yet.');

  let theme = QUOTE_TABS[0][0];
  const buttons = QUOTE_TABS.map(([t, label]) => {
    const btn = el('button', {type: 'button', 'aria-pressed': String(t === theme)}, label);
    btn.addEventListener('click', () => {
      theme = t;
      for (const b of buttons) b.setAttribute('aria-pressed', String(b === btn));
      safeRedraw(panel, redrawQuotes, () => { redrawQuotes = null; });
    });
    return btn;
  });
  themes.replaceChildren(...buttons);

  const list = el('ul', {className: 'quotes'});
  const gapLine = el('p', {className: 'q-missing'});
  const ofCompany = (code) => records.filter((r) => r.company === code);

  // Several companies: one row each on the pressed theme. One company (Q4): one row per theme
  // with a quote, and the themes without one folded into a single line.
  function draw(codes) {
    const hadFocus = list.contains(document.activeElement);
    const shown = allCodes(ctx).filter((c) => codes.includes(c));
    const single = shown.length === 1;
    const rows = [];
    const gaps = [];
    if (single) {
      const mine = ofCompany(shown[0]);
      for (const [t, label] of QUOTE_THEMES) {
        const r = pickQuote(mine, t, ctx.today);
        if (r) rows.push(quoteRow(el('span', {className: 'label'}, label), r, ctx.today));
        else gaps.push(label);
      }
    } else {
      for (const code of shown) {
        rows.push(quoteRow(companyChip(ctx, code), pickQuote(ofCompany(code), theme, ctx.today),
          ctx.today));
      }
    }
    list.replaceChildren(...rows);
    list.hidden = !rows.length;
    gapLine.textContent = gaps.length ? 'No quote yet on: ' + gaps.join(', ') : '';
    gapLine.hidden = !gaps.length;
    themes.hidden = single;
    printTheme.textContent = QUOTE_TABS.find(([t]) => t === theme)[1];
    // Never leave keyboard focus on a link that was just replaced.
    if (hadFocus) {
      (single ? document.getElementById('h-quotes')
        : buttons.find((b) => b.getAttribute('aria-pressed') === 'true'))?.focus();
    }
  }

  bodyOf(panel).replaceChildren(list, gapLine);
  draw([...selected]);
  redrawQuotes = () => draw([...selected]);
  // Q7: paper shows the pressed theme for all six companies, with the theme name above it.
  window.addEventListener('beforeprint', () => { if (redrawQuotes) draw(allCodes(ctx)); });
  window.addEventListener('afterprint', () => { if (redrawQuotes) redrawQuotes(); });
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
let endLabels = []; // per shown company line in the last draw: {code, color, x, y}
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
    font: {color: l.color, size: 12},
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

  // K6: unselected companies stay in the legend as 'legendonly', so a click brings them back.
  const companyTraces = [];
  traceKeys = [];
  endLabels = [];
  for (const s of series) {
    const code = s.company.code;
    const rank = ctx.list.indexOf(s.company);
    const color = safeColor(s.company.color);
    const fullName = escapeHtml(s.company.name ?? code);
    const y = rebased(s.filled.slice(b));
    const on = selected.has(code);
    companyTraces.push({
      type: 'scatter',
      mode: 'lines',
      uid: 'co' + rank,
      name: NARROW.matches ? escapeHtml(code) : fullName,
      meta: fullName,
      legendrank: rank + 1,
      visible: on ? true : 'legendonly',
      x,
      y,
      line: {width: 2.5, color: color || undefined},
      hovertemplate: '%{meta}: %{y:.1f}<extra></extra>',
    });
    traceKeys.push({kind: 'company', code});
    const lastIdx = y.findLastIndex((v) => v !== null);
    if (on && lastIdx >= 0) {
      endLabels.push({code, color: color || '#1f2328', x: x[lastIdx], y: y[lastIdx]});
    }
  }
  const traces = [...companyTraces];

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
    // Markers only for a subset, and only the shown companies' events (K6).
    && selected.size < ctx.list.length && selected.has(e.company));
  // Events on one date share one line and one marker; the hover lists each (P1).
  const byDate = new Map();
  for (const e of marks) {
    const d = e.date.slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(e);
  }
  const dates = [...byDate.keys()];

  const shapes = [{
    type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: 100, y1: 100,
    line: {color: '#d8dee4', width: 1},
  }];
  if (dates.length) {
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
      x: dates.flatMap((d) => [d, d, null]),
      y: dates.flatMap(() => [0, 1.04, null]),
      yaxis: 'y2',
      line: {color: '#c4c8cc', width: 1, dash: 'dot'},
    });
    traceKeys.push({kind: 'events'});
    // One small marker per date at the top of the plot carries the hover text.
    traces.push({
      type: 'scatter',
      mode: 'markers',
      uid: 'ev-marks',
      name: 'Events',
      legendgroup: 'events',
      legendrank: 3000,
      visible,
      x: dates,
      y: dates.map(() => 1),
      yaxis: 'y2',
      marker: {symbol: 'triangle-down', size: 7, color: '#80868b'},
      hovertext: dates.map((d) => byDate.get(d).map((e) => [companyName(ctx, e.company),
        capitalize(String(e.type ?? '').replace(/_/g, ' ')), String(e.title ?? '')]
        .map(escapeHtml).join(' · ')).join(HOVER_BR)),
      hovertemplate: '%{hovertext}<extra></extra>',
    });
    traceKeys.push({kind: 'events'});
  }

  // The headline reads the same rebased lines, for the shown companies only.
  const lastOf = (ys) => ys.findLast((v) => v !== null);
  // Codes on narrow screens, like the legend; raw strings, never the escaped Plotly names.
  const ends = series.map((s, i) => ({code: s.company.code,
    name: NARROW.matches ? String(s.company.code) : String(s.company.name ?? s.company.code),
    v: lastOf(companyTraces[i].y)})).filter((e) => selected.has(e.code) && isNum(e.v));
  const headline = document.getElementById('chart-headline');
  if (headline && ends.length) {
    let text;
    if (ends.length === 1) {
      text = `${win}: ${ends[0].name}${NBSP}${signedPct(ends[0].v - 100)}`;
    } else {
      const lead = ends.reduce((a, e) => (e.v > a.v ? e : a));
      const trail = ends.reduce((a, e) => (e.v < a.v ? e : a));
      text = `${win}: ${lead.name} leads${NBSP}${signedPct(lead.v - 100)}, `
        + `${trail.name} trails${NBSP}${signedPct(trail.v - 100)}`;
    }
    const benchEnd = lastOf(benchY);
    if (bench && isNum(benchEnd)) text += ` · ${bench.name}${NBSP}${signedPct(benchEnd - 100)}`;
    // Set only on change, so a redraw with the same numbers does not re-announce it.
    if (headline.textContent !== text) headline.textContent = text;
    headline.hidden = false;
  } else if (headline) {
    // No company has a value in this window: never leave the last window's text up.
    headline.textContent = '';
    headline.hidden = true;
  }

  // Place the end labels before drawing with an estimated range (5% padding, the last plot
  // height), so they never disappear; placeEndLabels corrects them once the plot exists.
  const shown = [100, ...companyTraces.filter((t) => t.visible === true).flatMap((t) => t.y),
    ...(benchVisible ? benchY : [])].filter(isNum);
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
    yaxis: {gridcolor: '#eef0f2', zeroline: false, ticksuffix: ' ', automargin: true, nticks: 8},
    yaxis2: {overlaying: 'y', range: [0, 1.04], visible: false, fixedrange: true},
    shapes,
    annotations: endAnnotations,
    // No layout.transition: with one, Plotly.react pins the y range to [-1, 4] when several
    // lines turn visible at once (seen in step 17). Without one, redraws are instant anyway.
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

function hideChartControls() {
  const controls = document.querySelector('#panel-chart .chart-controls');
  if (controls) controls.hidden = true;
  const headline = document.getElementById('chart-headline');
  if (headline) headline.hidden = true;
}

function renderChart(ctx, data) {
  const panel = 'panel-chart';
  // An empty chart hides its window buttons and benchmark toggle too (S2).
  const none = (message) => {
    hideChartControls();
    return empty(panel, message);
  };
  if (typeof Plotly === 'undefined') {
    console.warn('[holdco] Plotly did not load; chart disabled');
    return none('Chart library unavailable.');
  }
  if (!data.prices || typeof data.prices.series !== 'object' || data.prices.series === null) {
    return none('No price data available.');
  }
  if (!ctx.list.length) return none('Company list unavailable.');
  const aligned = buildAligned(ctx, data.prices);
  if (!aligned.union.length) return none('No price data available.');

  // The body holds the "Loading…" line until here; past every empty path the chart replaces it,
  // and the window track and benchmark toggle (hidden while loading) appear.
  const gd = el('div', {id: 'chart'});
  bodyOf(panel).replaceChildren(gd);
  document.querySelector('#panel-chart .chart-controls').hidden = false;
  let win = 'YTD';
  // Every redraw reads the current window, the selection and benchmark/events visibility.
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
  // Legend clicks route through the same setters as the chips and buttons (K6); Plotly's own
  // hide/show and double-click isolate are turned off.
  gd.on('plotly_legendclick', (ev) => {
    const key = traceKeys[ev.curveNumber];
    if (key?.kind === 'company') toggleCompany(ctx, key.code);
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
const KPI_TINT = 0.18; // the strongest fill: 18% of the end color over white
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

// Quarter index -> the first row for that single quarter (half-years and FY left out).
function quarterRows(rows) {
  const byQuarter = new Map();
  for (const r of rows) {
    const qs = periodQuarters(r.period);
    if (qs.length === 1 && !byQuarter.has(qs[0])) byQuarter.set(qs[0], r);
  }
  return byQuarter;
}

// 12g's rule, shared by the grid and the cards: quarter q's organic growth vs the quarter
// directly before, both quarterly figures (a half-year never counts); null unless both exist.
function quarterDelta(byQuarter, q) {
  const a = byQuarter.get(q)?.organic_growth_pct;
  const b = byQuarter.get(q - 1)?.organic_growth_pct;
  return isNum(a) && isNum(b) ? Math.round((a - b) * 10) / 10 : null;
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// The stored number with a sign; never rounded.
function kpiText(v) {
  return isNum(v) ? (v > 0 ? '+' : '') + String(v) + '%' : '–';
}

// Diverging blue-to-red tint over white, centered at zero and light enough that the text stays
// ink; magnitude still reads as darkness, so it also works in grayscale.
function kpiFill(v) {
  const t = Math.min(Math.abs(v) / KPI_CLAMP, 1) * KPI_TINT;
  const end = v > 0 ? KPI_POS : KPI_NEG;
  return `rgb(${end.map((e) => Math.round(255 + (e - 255) * t)).join(', ')})`;
}

function renderKpis(ctx, data) {
  const panel = 'fold-history';
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
      td.style.backgroundColor = kpiFill(v);
    } else {
      td.classList.add('kpi-none');
    }
    return td;
  };

  const head = el('tr', {}, el('th', {scope: 'col', className: 'kpi-corner'},
    el('span', {className: 'visually-hidden'}, 'Company')),
    el('th', {scope: 'col', className: 'kpi-delta-head', title: 'Change vs the quarter before'},
      'Change'));
  for (let q = first; q <= last; q++) head.appendChild(el('th', {scope: 'col'}, quarterLabel(q)));

  const tbody = el('tbody');
  for (const c of ctx.list) {
    const own = mine.filter((x) => x.company === c.code);
    const byQuarter = quarterRows(own);
    const halves = new Map();
    for (const r of own) {
      const qs = periodQuarters(r.period);
      if (qs.length === 2 && !halves.has(qs[0])) halves.set(qs[0], r);
    }
    const name = el('th', {scope: 'row', className: 'kpi-company'},
      el('span', {className: 'name-full'}, String(c.name ?? c.code)),
      el('span', {className: 'name-code', title: String(c.name ?? c.code)}, String(c.code)));
    // Δ q/q: this company's newest quarter vs the quarter directly before, both quarterly
    // figures (a half-year never counts). Glyph and sign carry the direction, not color.
    const newest = byQuarter.size ? Math.max(...byQuarter.keys()) : null;
    const d = newest === null ? null : quarterDelta(byQuarter, newest);
    let delta = el('td', {className: 'kpi-delta kpi-none', 'aria-label': 'not available'}, '–');
    if (d !== null) {
      const prev = newest - 1;
      const span = Math.floor(newest / 4) === Math.floor(prev / 4)
        ? `Q${(newest % 4) + 1} vs ${quarterLabel(prev)}`
        : `${quarterLabel(newest)} vs ${quarterLabel(prev)}`;
      const words = d > 0 ? `up ${d.toFixed(1)}` : d < 0 ? `down ${Math.abs(d).toFixed(1)}` : null;
      delta = el('td', {className: 'kpi-delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat'),
        title: span, 'aria-label': `${span}: ` + (words ? words + ' percentage points' : 'no change')},
      (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '') + d.toFixed(1));
    }
    const tr = el('tr', {}, name, delta);
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
  // A plain list, open on screen and in print, and the target of in-page jumps to #definitions;
  // left out when no company has a definition.
  const defList = el('ul', {className: 'kpi-defs', id: 'definitions', tabindex: '-1',
    'aria-label': 'Definitions'});
  for (const c of ctx.list) {
    if (typeof defs[c.code] === 'string') {
      defList.appendChild(el('li', {}, el('strong', {}, String(c.name ?? c.code)), ': ',
        defs[c.code]));
    }
  }

  const wrap = el('div', {className: 'table-wrap'}, table);
  bodyOf(panel).replaceChildren(...[
    wrap,
    detail,
    el('p', {className: 'footnote'}, 'As reported by each company; definitions differ, so '
      + 'figures are not directly comparable. A half-year figure spans two quarters only where '
      + 'no quarterly figure is published. Colors saturate at ±' + KPI_CLAMP + '%.'),
    defList.childElementCount ? defList : null,
  ].filter(Boolean));
  // Newest quarter first on narrow screens. A closed <details> has no width to scroll, so the
  // grid scrolls to its right end each time Quarterly history opens (Q6).
  const fold = document.getElementById(panel);
  fold.addEventListener('toggle', () => {
    if (fold.open) wrap.scrollLeft = wrap.scrollWidth;
  });
  // Set only once the grid is drawn, so the summary line stays blank while loading or empty.
  fold.querySelector('.fold-count').textContent =
    `organic growth, ${KPI_COLUMNS} quarters as reported`;
}

// Opens a <details> for printing and puts it back as it was afterwards; a second beforeprint
// before afterprint keeps the first saved state.
function openForPrint(details) {
  let wasOpen = null;
  window.addEventListener('beforeprint', () => {
    if (wasOpen === null) wasOpen = details.open;
    details.open = true;
  });
  window.addEventListener('afterprint', () => {
    if (wasOpen !== null) details.open = wasOpen;
    wasOpen = null;
  });
}

// ---------- All guidance (folded under the cards) ----------

const PERIOD_RANK = {FY: 0, H1: 1, H2: 2, Q1: 3, Q2: 4, Q3: 5, Q4: 6};
const SUMMARY_STATUSES = ['raised', 'cut', 'new', 'held', 'withdrawn'];

// [year, rank] for "FY 2026", "H2 2026" or "Q3 2026"; null for anything else (e.g. medium_term).
function periodKey(period) {
  const m = /^(FY|H[12]|Q[1-4]) (\d{4})$/.exec(String(period ?? ''));
  return m ? [Number(m[2]), PERIOD_RANK[m[1]]] : null;
}

// The headline record for a card's guidance line: a current-calendar-year period if any, else
// the earliest period; ties go to the newest set_date.
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

// G3's record lines: status changes first, then held, then anything else; newest set_date first
// within each. A quote that only repeats the value or the quote just above it is left out.
function guidanceRecordLines(records) {
  const rank = (r) => (Object.hasOwn(STATUS_RANK, r.status) ? STATUS_RANK[r.status] : 2);
  const setDate = (r) => (isIsoDate(r.set_date) ? r.set_date.slice(0, 10) : '');
  const byStatus = (a, b) => rank(a) - rank(b) || setDate(b).localeCompare(setDate(a))
    || String(a.metric).localeCompare(String(b.metric));
  let lastQuote = null;
  return [...records].sort(byStatus).map((r) => {
    const s = typeof r.status === 'string' ? r.status : 'unknown';
    const value = String(r.value ?? '');
    const quote = String(r.quote ?? '');
    const showQuote = quote && quote !== lastQuote
      && !(value && quote.toLowerCase().includes(value.toLowerCase()));
    if (showQuote) lastQuote = quote;
    return el('li', {},
      el('span', {className: 'g-label'}, metricLabel(r.metric),
        el('span', {className: 'date'}, String(r.period ?? '').replace(/_/g, ' '))),
      el('strong', {className: 'g-rec-value'}, value),
      // The set date links to the source; without a valid date the link reads "source".
      el('span', {className: 'g-meta muted'}, statusBadge(s, statusLabel(s)), ' · ',
        link(r.source_url, isIsoDate(r.set_date) ? fmtDay(r.set_date) : 'source')),
      showQuote ? el('span', {className: 'g-quote'}, quote) : null);
  });
}

// Q6: G1's summary line, then every current record per company, following the selection.
function renderGuidanceFold(ctx, data) {
  const panel = 'fold-guidance';
  const fold = document.getElementById(panel);
  const count = fold.querySelector('.fold-count');
  redrawGuidanceFold = null;
  count.textContent = '';
  if (!ctx.list.length) return empty(panel, 'Company list unavailable.');
  const records = currentGuidance(data.guidance);
  if (!records.length) return empty(panel, 'No guidance records yet.');

  const companyOf = (r) => String(r.company ?? '');
  // A zero count names no direction: no glyph and no green or red ("0 cut").
  const badges = (pairs) => pairs.flatMap(([s, n], i) => [i ? ' · ' : null,
    n ? statusBadge(s, statusLabel(s, `${n} ${s}`)) : statusBadge('none', `0 ${s}`)]);
  const known = allCodes(ctx);
  // Codes not in companies.json follow the known ones while all are shown, so no record is lost.
  const extra = [...new Set(records.map(companyOf))].filter((c) => !Object.hasOwn(ctx.byCode, c));
  const body = bodyOf(panel);

  function draw(codes) {
    const hadFocus = body.contains(document.activeElement);
    const want = new Set(codes);
    const shown = [...known.filter((c) => want.has(c)),
      ...(known.every((c) => want.has(c)) ? extra : [])];
    const mine = records.filter((r) => shown.includes(companyOf(r)));
    // G1: counts first, then the shown companies with nothing on file.
    const summary = mine.length ? el('p', {className: 'g-summary'},
      ...badges(statusCounts(mine, SUMMARY_STATUSES, ['raised', 'cut']))) : null;
    const missing = shown.filter((c) => !mine.some((r) => companyOf(r) === c));
    const missingLine = missing.length ? el('p', {className: 'g-missing muted'},
      'No guidance on file: ' + missing.map((c) => companyName(ctx, c)).join(', ')) : null;
    // A heading only for a company with records, its name in plain text (no company color).
    const groups = shown.filter((c) => !missing.includes(c)).map((code) => el('div',
      {className: 'g-group'},
      el('h3', {className: 'g-group-head'}, companyName(ctx, code)),
      el('ul', {className: 'g-records'},
        ...guidanceRecordLines(mine.filter((r) => companyOf(r) === code)))));
    // The summary says what is inside: "15 records: 1 raised, 2 new, 12 held"; blank for none.
    const statuses = statusCounts(mine, SUMMARY_STATUSES, []).map(([s, n]) => `${n} ${s}`);
    count.textContent = !mine.length ? ''
      : `${mine.length} ${mine.length === 1 ? 'record' : 'records'}`
        + (statuses.length ? ': ' + statuses.join(', ') : '');
    body.replaceChildren(...[summary, missingLine, ...groups].filter(Boolean));
    // Never leave keyboard focus on a link that was just replaced.
    if (hadFocus) fold.querySelector('summary')?.focus();
  }

  draw([...selected]);
  redrawGuidanceFold = () => draw([...selected]);
  // Paper shows every company's guidance, like the cards (K7).
  window.addEventListener('beforeprint', () => { if (redrawGuidanceFold) draw(known); });
  window.addEventListener('afterprint', () => { if (redrawGuidanceFold) redrawGuidanceFold(); });
}

// ---------- Panel E: press releases ----------

// Key categories in schema order, with the badge word each shows (text, never color alone).
const PRESS_KEY = {
  results: 'Results', guidance: 'Guidance', m_and_a: 'Deal', capital_markets: 'Capital markets',
  leadership: 'People', client: 'Client', ai_and_products: 'AI & products',
};

function isKeyPress(p) {
  return Object.hasOwn(PRESS_KEY, p.category);
}

function renderPress(ctx, data) {
  const panel = 'panel-press';
  const all = Array.isArray(data.press?.items) ? data.press.items : [];
  const since = addDays(ctx.today, -30);
  // Newest first, the higher id breaking a tie; key items are pulled ahead in draw().
  const items = all.filter((p) => p && isIsoDate(p.published) && p.published.slice(0, 10) >= since)
    .sort((a, b) => b.published.localeCompare(a.published)
      || String(b.id ?? '').localeCompare(String(a.id ?? '')));
  redrawPress = null;
  resetPress = null;
  // The scope line sits on the header row and stays blank until there are releases to describe.
  const scope = document.querySelector('#' + panel + ' .panel-head .scope');
  scope.textContent = '';
  if (!items.length) return empty(panel, 'No press releases in the last 30 days.');
  const rows = new Map(items.map((p) => [p,
    el('li', {className: isKeyPress(p) ? 'key' : 'rest'},
      companyChip(ctx, p.company),
      el('span', {className: 'nowrap date'}, fmtDate(p.published)),
      isKeyPress(p) ? el('span', {className: 'chip category'}, PRESS_KEY[p.category]) : null,
      el('span', {className: 'title'}, link(p.url, String(p.title ?? ''))))]));
  const releases = (n) => `${n} ${n === 1 ? 'release' : 'releases'}`;

  const list = el('ul', {className: 'press', id: 'press-list'});
  const sub = el('li', {className: 'press-sub'}, 'Other releases');
  const none = el('p', {className: 'empty'});
  // Key items show; the button reveals the rest under "Other releases". A selection with no
  // key item shows every item and no button. Print shows every item for all six companies.
  const more = el('button', {type: 'button', className: 'show-more', 'aria-expanded': 'false',
    'aria-controls': 'press-list'});
  let extra = [];
  let scopeText = () => '';
  const isOpen = () => more.getAttribute('aria-expanded') === 'true';
  const setOpen = (open) => {
    for (const li of extra) li.hidden = !open;
    sub.hidden = !open || !extra.length;
    more.setAttribute('aria-expanded', String(open));
    more.textContent = open ? 'Show fewer'
      : `Show ${extra.length} other ${extra.length === 1 ? 'release' : 'releases'}`;
    scope.textContent = scopeText(open);
  };
  // replaceChildren blurs a focused row even when it stays, so focus goes back to it, else to
  // the button, else to the first shown link.
  const keepFocus = (change) => {
    const had = document.activeElement;
    const inside = had && (list.contains(had) || had === more);
    change();
    if (!inside) return;
    if (had.isConnected && !had.closest('[hidden]')) had.focus();
    else if (!more.hidden) more.focus();
    else list.querySelector('li:not([hidden]) a')?.focus();
  };

  // Shows the given companies' releases, key items first; open shows the rest too.
  function draw(codes, open) {
    keepFocus(() => {
      const want = new Set(codes);
      // Every company (or no companies.json) shows every release, as the old "All" did.
      const everyone = allCodes(ctx).every((c) => want.has(c));
      const mine = everyone ? items : items.filter((p) => want.has(p.company));
      const key = mine.filter(isKeyPress);
      const rest = key.length ? mine.filter((p) => !isKeyPress(p)) : [];
      extra = rest.map((p) => rows.get(p));
      const shownRows = (key.length ? key : mine).map((p) => rows.get(p));
      for (const li of shownRows) li.hidden = false;
      list.replaceChildren(...shownRows, ...(extra.length ? [sub, ...extra] : []));
      list.hidden = !mine.length;
      scope.hidden = !mine.length;
      none.hidden = mine.length > 0;
      none.textContent = mine.length ? '' : 'No press releases from '
        + (want.size === 1 ? companyName(ctx, [...want][0]) : 'the selected companies')
        + ' in the last 30 days.';
      const label = everyone ? 'All six companies' : allCodes(ctx).filter((c) => want.has(c))
        .join(', ');
      scopeText = (expanded) => label + ' · ' + (!key.length
        ? `${releases(mine.length)}, none key`
        : expanded ? `all ${mine.length}, key releases first`
          : `${key.length} key ${key.length === 1 ? 'release' : 'releases'} of ${mine.length}`);
      more.hidden = !extra.length;
      setOpen(open);
    });
  }

  // Closing shrinks the list; bring the button back so the reader isn't left further down.
  // Esc scrolls only when the button has gone above the viewport, so the page never jumps.
  const collapse = (fromEsc) => {
    keepFocus(() => setOpen(false));
    if (!fromEsc || more.getBoundingClientRect().top < 0) more.scrollIntoView({block: 'nearest'});
  };
  more.addEventListener('click', () => {
    if (isOpen()) collapse(false);
    else setOpen(true);
  });
  // Same guard as openForPrint: a second beforeprint before afterprint keeps the first state.
  let wasOpen = null;
  window.addEventListener('beforeprint', () => {
    if (!redrawPress) return;
    if (wasOpen === null) wasOpen = isOpen();
    draw(allCodes(ctx), true);
  });
  window.addEventListener('afterprint', () => {
    if (!redrawPress) return;
    draw([...selected], wasOpen === true);
    wasOpen = null;
  });
  bodyOf(panel).replaceChildren(list, none, more);
  draw([...selected], false);
  redrawPress = () => draw([...selected], false);
  resetPress = () => {
    if (isOpen()) collapse(true);
  };
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
    // One clamped line per source; the full error text sits in a <details> under it.
    for (const n of failing) {
      const full = String(sources[n]?.error || 'failed (no error text)');
      const head = full.split(/\r?\n/).find((line) => line.trim()) ?? 'failed (no error text)';
      ul.appendChild(el('li', {},
        el('div', {className: 'err-head'}, el('strong', {}, n), ': ', head),
        el('details', {className: 'err-full'}, el('summary', {}, 'Full error'),
          el('pre', {}, full))));
    }
    body.appendChild(el('p', {className: 'muted'}, 'Failing sources:'));
    body.appendChild(ul);
  }
}

// ---------- main ----------

// A panel that failed: its controls hide and its body shows one grey sentence.
function failPanel(panelId) {
  if (panelId === 'panel-chart') hideChartControls();
  if (panelId === 'panel-quotes') {
    const themes = document.querySelector('#panel-quotes .q-themes');
    if (themes) themes.hidden = true;
  }
  // A fold's summary line, or the press scope line, describes content that is no longer there.
  const count = document.querySelector('#' + panelId + ' .fold-count');
  if (count) count.textContent = '';
  if (panelId === 'panel-press') {
    const scope = document.querySelector('#panel-press .panel-head .scope');
    if (scope) scope.textContent = '';
  }
  empty(panelId, 'This panel could not be rendered.');
}

function runPanel(panelId, fn, ctx, data) {
  try {
    fn(ctx, data);
  } catch (err) {
    console.warn('[holdco] ' + panelId + ' failed to render:', err);
    failPanel(panelId);
  }
}

async function main() {
  const [companies, prices, guidance, events, press, status, kpis, commentary] = await Promise.all([
    loadJSON('companies.json'), loadJSON('prices.json'), loadJSON('guidance.json'),
    loadJSON('events.json'), loadJSON('press_releases.json'), loadJSON('status.json'),
    loadJSON('kpis.json'), loadJSON('commentary.json'),
  ]);
  const bench = companies?.benchmark;
  const ctx = {
    ...companyLookup(companies),
    benchmark: bench && typeof bench.symbol === 'string' ? bench : null,
    today: todayIso(),
  };
  const data = {prices, guidance, events, press, status, kpis, commentary};

  document.getElementById('as-of').textContent = status?.run_at
    ? 'as of ' + fmtTimestamp(status.run_at) : 'as of unknown';
  // The footnote names the same benchmark as the chart headline; the static text is a fallback.
  const benchName = document.querySelector('#panel-chart .bench-name');
  // Same fallback as buildAligned (name, else symbol), so the two never disagree.
  if (benchName && ctx.benchmark) {
    benchName.textContent = String(ctx.benchmark.name ?? ctx.benchmark.symbol);
  }

  // A #PUB,WPP link (or 12f's #PUB) sets the selection before anything draws.
  const linked = selectionFromHash(ctx);
  selected = new Set(linked.length ? linked : allCodes(ctx));

  runPanel('panel-changes', renderChanges, ctx, data);
  runPanel('panel-cards', renderCards, ctx, data);
  runPanel('fold-guidance', renderGuidanceFold, ctx, data);
  runPanel('fold-history', renderKpis, ctx, data);
  runPanel('panel-quotes', renderQuotes, ctx, data);
  runPanel('panel-chart', renderChart, ctx, data);
  runPanel('panel-press', renderPress, ctx, data);
  // Both folded sections print open (Q7). A link to a fold (#fold-guidance, e.g. What changed's
  // link opened in a new tab) opens it.
  const openLinkedFold = () => {
    const target = document.getElementById(location.hash.slice(1));
    if (target?.matches('details.fold')) target.open = true;
  };
  for (const fold of document.querySelectorAll('details.fold')) openForPrint(fold);
  openLinkedFold();
  runPanel('panel-health', renderHealth, ctx, data);

  // Normalize a selection hash once (case, order, unknown codes), without an announcement.
  if (linked.length) writeHash(ctx);
  // A new link pasted into an open tab; replaceState never fires this. Other anchors pass.
  window.addEventListener('hashchange', () => {
    const codes = selectionFromHash(ctx);
    if (!codes.length) return openLinkedFold();
    setSelection(ctx, codes);
    writeHash(ctx);
  });

  // The one Esc handler (R6): shows all companies, unpins a KPI cell, collapses press.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (resetPress) resetPress();
    if (selected.size < ctx.list.length) setSelection(ctx, allCodes(ctx));
    if (unpinKpi) unpinKpi();
  });
}

main();
