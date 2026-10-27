'use strict';
// Holdco Intel dashboard. Plain DOM, no framework. All external text goes in via text nodes.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MARKER_TYPES = ['results', 'capital_markets_day', 'deal'];
const DAY_MS = 86400000;
const NBSP = String.fromCharCode(160); // keeps a headline figure on its label's line
const MINUS = String.fromCharCode(0x2212); // the true minus, as wide as "+" in tabular figures
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

// "+0.2", "−0.1" with the true minus (C6). Rounded first, then signed, so a value that rounds to
// zero reads "0.0", never "−0.0".
function signedFixed(n, digits = 1) {
  const r = Number(n.toFixed(digits));
  return (r > 0 ? '+' : r < 0 ? MINUS : '') + Math.abs(r).toFixed(digits);
}

function signedPct(p) {
  return signedFixed(p) + '%';
}

// A change with its glyph: "▲ +0.2", "▼ −0.1"; zero is "0.0", with no glyph and no sign.
function glyphSigned(d) {
  const r = Number(d.toFixed(1));
  return (r > 0 ? '▲ ' : r < 0 ? '▼ ' : '') + signedFixed(r);
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

let selected = new Set(); // codes every panel under the capsule shows; set in main()
let benchVisible = true;
let showFilter = null; // set by renderFilter: the capsule's pressed pills, count and opener
let closeFilter = null; // set by renderFilter: closes the phone opener; true if it was open
let redrawChanges = null; // set by renderChanges after its first draw
let redrawChart = null; // set by renderChart once the chart exists
let redrawTable = null; // set by renderTable after its first draw
let redrawQuotes = null; // set by renderQuotes after its first draw
let redrawGuidanceFold = null; // set by renderGuidanceFold after its first draw
let unpinKpi = null; // set by renderKpis
let redrawPress = null; // set by renderPress after its first draw
let resetPress = null; // set by renderPress: collapses an expanded press list (Esc)

function allCodes(ctx) {
  return ctx.list.map((c) => c.code);
}

const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve'];

// "six" for 6, so counts follow companies.json; digits past twelve.
function countWord(n) {
  return COUNT_WORDS[n] ?? String(n);
}

// A scope line: "All six companies" when every company is shown, else the shown codes in
// companies.json order ("PUB, WPP"); blank without a company list.
function scopeLabel(ctx, codes) {
  if (!ctx.list.length) return '';
  const want = new Set(codes);
  const shown = allCodes(ctx).filter((c) => want.has(c));
  return shown.length === ctx.list.length && shown.length > 1
    ? `All ${countWord(shown.length)} companies` : shown.join(', ');
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
  // A capsule that fails to update logs and drops out, so the panels still follow the selection.
  try {
    if (showFilter) showFilter();
  } catch (err) {
    console.warn('[holdco] filter failed to update:', err);
    showFilter = null;
  }
  safeRedraw('panel-changes', redrawChanges, () => { redrawChanges = null; });
  safeRedraw('panel-comps', redrawTable, () => { redrawTable = null; });
  safeRedraw('panel-chart', redrawChart, () => { redrawChart = null; });
  safeRedraw('fold-guidance', redrawGuidanceFold, () => { redrawGuidanceFold = null; });
  safeRedraw('panel-quotes', redrawQuotes, () => { redrawQuotes = null; });
  safeRedraw('panel-press', redrawPress, () => { redrawPress = null; resetPress = null; });
  writeHash(ctx);
  if (announce) {
    const names = next.map((c) => companyName(ctx, c)).join(', ');
    document.getElementById('announce').textContent = next.length === ctx.list.length
      ? 'Showing all companies' : `Showing ${names}${next.length === 1 ? ' only' : ''}`;
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

// B2, solo first: from all companies a click shows that one only; in a subset it adds or removes
// the company, and removing the last one shows all again (setSelection's fallback).
function pickCompany(ctx, code) {
  if (selected.size === ctx.list.length) return setSelection(ctx, [code]);
  setSelection(ctx, selected.has(code) ? [...selected].filter((c) => c !== code)
    : [...selected, code]);
}

// Shows or hides the benchmark line; the toggle button and the chart key stay in sync.
function setBenchmarkVisible(on) {
  benchVisible = on;
  document.querySelector('#panel-chart .bench-toggle')?.setAttribute('aria-pressed', String(on));
  if (redrawChart) redrawChart();
}

// ---------- The filter capsule: one place to pick companies (B1 to B3) ----------

// "All", then one pill per company code; for a subset the "Showing…" count and Reset; at 720px
// and below an opener that folds the pills away. Without companies.json the band hides.
function renderFilter(ctx) {
  const band = document.getElementById('filter');
  const group = document.getElementById('filter-pills');
  const opener = band.querySelector('.filter-opener');
  const status = band.querySelector('.filter-status');
  const reset = band.querySelector('.filter-reset');
  if (!ctx.list.length) {
    band.hidden = true;
    return;
  }

  const isOpen = () => band.classList.contains('is-open');
  // Closing with focus on a pill that folds away hands focus to the opener.
  const setOpen = (open) => {
    if (!open && NARROW.matches && group.contains(document.activeElement)) opener.focus();
    band.classList.toggle('is-open', open);
    opener.setAttribute('aria-expanded', String(open));
  };
  // The opener closes after any choice.
  const pill = (label, title, onClick) => {
    const btn = el('button', {type: 'button', title, 'aria-pressed': 'false'},
      el('span', {className: 'tick', 'aria-hidden': 'true'}, '✓'), label);
    btn.addEventListener('click', () => {
      onClick();
      setOpen(false);
    });
    return btn;
  };
  const allPill = pill('All', null, () => setSelection(ctx, allCodes(ctx)));
  const pills = new Map(ctx.list.map((c) => [c.code,
    pill(String(c.code), companyName(ctx, c.code), () => pickCompany(ctx, c.code))]));
  group.replaceChildren(allPill, ...pills.values());

  opener.addEventListener('click', () => setOpen(!isOpen()));
  reset.addEventListener('click', () => {
    setSelection(ctx, allCodes(ctx));
    setOpen(false);
  });
  NARROW.addEventListener('change', () => setOpen(false));
  // Tabbing out of the open grid closes it, so the taller capsule never covers the focus.
  band.addEventListener('focusout', (e) => {
    if (isOpen() && e.relatedTarget && !band.contains(e.relatedTarget)) setOpen(false);
  });
  opener.hidden = false;

  const total = ctx.list.length;
  const show = () => {
    const shown = allCodes(ctx).filter((c) => selected.has(c));
    const all = shown.length === total;
    // With all shown, "All" is pressed and no company is.
    allPill.setAttribute('aria-pressed', String(all));
    for (const [code, btn] of pills) {
      btn.setAttribute('aria-pressed', String(!all && selected.has(code)));
    }
    opener.querySelector('.opener-value').textContent = all && total > 1
      ? 'all ' + countWord(total)
      : shown.length <= 2 ? shown.join(', ') : `${shown.length} of ${total}`;
    status.querySelector('.filter-count').textContent = shown.length === 1
      ? `Showing ${shown[0]} only` : `Showing ${shown.length} of ${total}`;
    // Reset hides once all are shown; focus on it moves to the control that stays.
    const resetHadFocus = document.activeElement === reset;
    status.hidden = all;
    if (all && resetHadFocus) (NARROW.matches ? opener : allPill).focus();
  };
  // Set only once the first update has worked, so a capsule that fails never blocks setSelection.
  show();
  showFilter = show;
  closeFilter = () => {
    if (!isOpen()) return false;
    setOpen(false);
    return true;
  };
}

// ---------- What changed: coming up and guidance moves, following the capsule (B5) ----------

const CHANGES_ROWS = 3;
const COMING_WORD = {capital_markets_day: 'capital markets day', deal: 'deal'};
const MOVE_STATUSES = ['raised', 'cut', 'new', 'withdrawn'];

// A link to a company document with its ↗; plain text (and no ↗) without a safe URL.
function docLink(u, text) {
  const node = link(u, text);
  if (node.nodeType === Node.ELEMENT_NODE) {
    node.append(' ', el('span', {'aria-hidden': 'true'}, '↗'));
  }
  return node;
}

// An in-page jump that opens All guidance and moves focus to its summary: link() opens a new
// tab, and the URL keeps the selection's #PUB,WPP. Shared by What changed and the peer table.
function guidanceJump(text, ariaLabel) {
  const a = el('a', {href: '#fold-guidance', 'aria-label': ariaLabel}, text);
  a.addEventListener('click', (ev) => {
    ev.preventDefault();
    const fold = document.getElementById('fold-guidance');
    if (!fold) return;
    fold.open = true;
    fold.scrollIntoView();
    fold.querySelector('summary')?.focus({preventScroll: true});
  });
  return a;
}

// Coming up: results, capital markets days and deals in the next 14 days. Guidance: moves set in
// the last 30 days, then that window's reaffirmations on one line. Print shows all companies.
function renderChanges(ctx, data) {
  const panel = 'panel-changes';
  const scope = document.querySelector('#' + panel + ' .panel-head .scope');
  redrawChanges = null;
  scope.textContent = '';
  if (!ctx.list.length) return empty(panel, 'Company list unavailable.');

  const year = ctx.today.slice(0, 4);
  const since = addDays(ctx.today, -30);
  const order = new Map(allCodes(ctx).map((c, i) => [c, i]));
  const rank = (code) => order.get(code) ?? ctx.list.length;
  const coming = upcomingEvents(data.events, ctx.today, 14)
    .filter((e) => MARKER_TYPES.includes(e.type))
    .sort((a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10))
      || rank(a.company) - rank(b.company));
  // One record set for the moves and the Reaffirmed line: set in the last 30 days, up to today.
  const recent = currentGuidance(data.guidance)
    .filter((r) => isIsoDate(r.set_date) && r.set_date.slice(0, 10) >= since
      && r.set_date.slice(0, 10) <= ctx.today);
  const body = bodyOf(panel);
  const sep = () => el('span', {className: 'c-sep', 'aria-hidden': 'true'}, '·');
  const column = (title, ...content) => el('div', {className: 'c-col'},
    el('h3', {className: 'c-title'}, title), ...content);
  const list = (rows) => (rows.length ? el('ul', {className: 'c-list'}, ...rows) : null);

  const eventRow = (e) => {
    const n = daysBetween(ctx.today, e.date);
    const what = e.type === 'results' ? [titlePeriod(e.title), 'results'].filter(Boolean).join(' ')
      : COMING_WORD[e.type] ?? String(e.type).replace(/_/g, ' ');
    const date = fmtDayIn(e.date, year) + (e.confirmed === true ? '' : ' (est.)');
    // "Reports today" fits results; a capital markets day or a deal is just "Today".
    const onTheDay = e.type === 'results' ? 'Reports today' : 'Today';
    return el('li', {},
      el('span', {}, companyName(ctx, e.company) + ' ' + what),
      el('span', {className: 'nowrap'}, sep(), docLink(e.source_url, date)),
      n === 0 ? el('span', {}, sep(), el('span', {className: 'badge badge-today'}, onTheDay))
        : el('span', {className: 'muted'}, sep(), n === 1 ? 'tomorrow' : `in ${n} days`));
  };
  const moveRow = (r) => {
    const s = String(r.status);
    const period = String(r.period ?? '').replace(/_/g, ' ');
    const date = docLink(r.source_url, fmtDayIn(r.set_date, year));
    return el('li', {},
      statusBadge(s, statusLabel(s)),
      el('span', {}, companyName(ctx, r.company)),
      el('span', {className: 'muted'}, [metricLabel(r.metric), period].filter(Boolean).join(' ')),
      el('strong', {className: 'c-value'}, String(r.value ?? '')),
      el('span', {className: 'nowrap'}, sep(), date));
  };

  const jumpLink = (left) => guidanceJump('See all guidance'
    + (left ? `, ${left} more ${left === 1 ? 'move' : 'moves'}` : ''));

  function draw(codes) {
    const links = () => [...body.querySelectorAll('a')];
    const focusAt = links().indexOf(document.activeElement);
    const want = new Set(codes);
    const everyone = allCodes(ctx).every((c) => want.has(c));
    const mine = (x) => everyone || want.has(x.company);

    const events = coming.filter(mine);
    const comingCol = column('Coming up',
      list(events.slice(0, CHANGES_ROWS).map(eventRow)),
      events.length ? null : el('p', {className: 'empty'},
        'No results, capital markets days or deals in the next 14 days.'),
      events.length > CHANGES_ROWS
        ? el('p', {className: 'c-note muted'}, `and ${events.length - CHANGES_ROWS} more`) : null);

    const shownRecords = recent.filter(mine);
    const setDate = (r) => r.set_date.slice(0, 10);
    const moves = shownRecords.filter((r) => MOVE_STATUSES.includes(r.status))
      .sort((a, b) => setDate(b).localeCompare(setDate(a)) || rank(a.company) - rank(b.company)
        || String(a.metric).localeCompare(String(b.metric)));
    // Each company once, at its newest held date, in companies.json order.
    const heldAt = new Map();
    for (const r of shownRecords.filter((x) => x.status === 'held')) {
      const prev = heldAt.get(r.company);
      if (!prev || setDate(r) > prev) heldAt.set(r.company, setDate(r));
    }
    // "Publicis Groupe 13 Oct" never splits across lines.
    const held = [...heldAt.keys()].sort((a, b) => rank(a) - rank(b)).map((c) => el('span',
      {className: 'nowrap'}, companyName(ctx, c) + ' ',
      el('span', {className: 'muted'}, fmtDayIn(heldAt.get(c), year))));
    const jump = jumpLink(Math.max(moves.length - CHANGES_ROWS, 0));
    const guidanceCol = column('Guidance, last 30 days',
      list(moves.slice(0, CHANGES_ROWS).map(moveRow)),
      moves.length ? null : el('p', {className: 'empty'},
        'No guidance raised, cut, set or withdrawn.'),
      held.length ? el('p', {className: 'c-note'}, el('span', {className: 'muted'}, 'Reaffirmed '),
        ...held.flatMap((span, i) => [i ? ', ' : null, span])) : null,
      el('p', {className: 'c-jump'}, jump));

    scope.textContent = scopeLabel(ctx, codes);
    body.replaceChildren(el('div', {className: 'c-cols'}, comingCol, guidanceCol));
    // Never leave keyboard focus on a link that was just replaced: the link in the same place,
    // else "See all guidance".
    if (focusAt >= 0) (links()[focusAt] || jump).focus();
  }

  draw([...selected]);
  redrawChanges = () => draw([...selected]);
  // Paper shows every company's changes, like the table (D6).
  window.addEventListener('beforeprint', () => { if (redrawChanges) draw(allCodes(ctx)); });
  window.addEventListener('afterprint', () => { if (redrawChanges) redrawChanges(); });
}

// ---------- Peer table: one row per company (C1 to C7) ----------

const STATUS_GLYPH = {raised: '▲', cut: '▼', held: '=', new: '+', withdrawn: '×'};

// "▲ Raised", "= 12 held": the glyph always comes with a word; an unknown status is the word only.
function statusLabel(s, word = capitalize(s)) {
  return (STATUS_GLYPH[s] ? STATUS_GLYPH[s] + ' ' : '') + word;
}

const MOVE_TITLE = 'close before results day to close after it';
// [slot, metric, fallback metric]: Top line is organic growth, else revenue; Profit is operating
// margin, else EPS (G2, as K4 had it).
const PEER_GUIDANCE = [['topLine', 'organic_growth', 'revenue'],
  ['profit', 'operating_margin', 'eps']];
// Why a table cell shows "–": a dash always says why (C6).
const DASH_WHY = {
  growth: 'No organic growth figure on file',
  margin: 'No margin figure on file',
  record: 'No record',
  ytd: 'No price history this year',
  gap: 'No close before results day',
  none: 'No results day on file',
};

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

// One company's facts for its peer table row and its company block: numbers, raw periods, URLs
// and reason codes, never display words (the helpers below word them).
function peerFacts(ctx, c, src) {
  const rows = src.kpiRows.filter((r) => r.company === c.code);
  const g = latestRow(rows, 'organic_growth_pct');
  const m = latestRow(rows, 'margin_pct');

  // The latest quarter vs the quarter directly before, both quarterly figures (12g's rule); a
  // half-year or full-year figure has no quarter before it.
  let change = {delta: null, why: 'none'};
  if (g) {
    const [end, len] = periodSpan(g.period);
    if (len > 1) {
      change = {delta: null, why: len === 2 ? 'half' : 'full'};
    } else {
      const delta = quarterDelta(quarterRows(rows), end);
      change = {delta, why: delta === null ? 'gap' : null, end, base: end - 1};
    }
  }

  const records = src.guidance.filter((r) => r.company === c.code);
  const guidance = {onFile: records.length > 0};
  for (const [slot, metric, alt] of PEER_GUIDANCE) {
    const main = headlineRecord(records.filter((r) => r.metric === metric), src.year);
    const other = main ? null : headlineRecord(records.filter((r) => r.metric === alt), src.year);
    guidance[slot] = main || other ? {record: main || other, fallback: !main} : null;
  }

  // The move from the close before the latest results day (up to today) to the close after it,
  // from the company's real closes only.
  const ev = src.results.filter((e) => e.company === c.code)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  let move = {state: 'none', period: null, value: null};
  if (ev) {
    const day = ev.date.slice(0, 10);
    const pts = nonNullPoints(src.series[c.ticker]);
    const before = pts.filter(([d]) => d < day).pop();
    const after = pts.find(([d]) => d > day);
    const value = before && after ? pct(after[1], before[1]) : null;
    move = {period: titlePeriod(ev.title), value: isNum(value) ? value : null,
      state: isNum(value) ? 'done' : before && !after ? 'pending' : 'gap'};
  }

  const e = src.upcoming.find((x) => x.company === c.code && x.type === 'results');
  return {
    code: c.code,
    name: String(c.name ?? c.code),
    growth: g ? {value: g.organic_growth_pct, period: g.period, url: g.source_url} : null,
    change,
    margin: m ? {value: m.margin_pct, period: m.period, url: m.source_url,
      metric: typeof m.margin_metric === 'string' && m.margin_metric ? m.margin_metric : null} : null,
    guidance,
    ytd: isNum(src.ytd[c.code]) ? src.ytd[c.code] : null,
    move,
    next: e ? {date: e.date.slice(0, 10), confirmed: e.confirmed === true, period: titlePeriod(e.title),
      url: e.source_url, today: e.date.slice(0, 10) === src.today} : null,
  };
}

// "Q3 26 ↗" linked to its source, read as "Publicis Groupe Q3 26 source"; plain text without a
// safe URL.
function periodLink(name, fact, what) {
  const label = shortPeriod(fact.period);
  const node = docLink(fact.url, label);
  if (node.nodeType === Node.ELEMENT_NODE) {
    node.setAttribute('aria-label', [name, label, what, 'source'].filter(Boolean).join(' '));
  }
  return node;
}

// "▲ +0.2 pp" and its class; "–" when there is nothing to compare.
function changeFigure(change) {
  const d = change.delta;
  if (d === null) return {text: '–', className: 'muted'};
  return {text: glyphSigned(d) + ' pp', className: d > 0 ? 'up' : d < 0 ? 'down' : 'flat'};
}

// Quarter index -> "Q2 26".
function shortQuarter(i) {
  return shortPeriod(quarterLabel(i));
}

// What the change is measured against ("vs Q2 26"), or why there is none (C2).
function changeBase(change) {
  if (change.delta !== null) return 'vs ' + shortQuarter(change.base);
  if (change.why === 'gap') return 'no ' + shortQuarter(change.base);
  return {half: 'half-year', full: 'full-year'}[change.why] ?? 'no figure';
}

// What a screen reader hears in place of the figure, before the base: "up 0.2 points vs Q2 26".
function changeSpoken(change) {
  const d = change.delta;
  if (d === null) return 'not compared,';
  if (d === 0) return 'no change';
  return `${d > 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(1)} points`;
}

// The change cell's title: "+0.2 pp, Q3 26 vs Q2 26", or the full reason for a dash.
function changeTitle(change) {
  if (change.delta !== null) {
    return `${signedFixed(change.delta)} pp, ${shortQuarter(change.end)} vs ${shortQuarter(change.base)}`;
  }
  if (change.why === 'gap') return `No ${shortQuarter(change.base)} figure to compare`;
  if (change.why === 'half') return 'Half-year figure, no quarter before to compare';
  if (change.why === 'full') return 'Full-year figure, no quarter before to compare';
  return 'No organic growth figure to compare';
}

// The guidance value with a muted prefix naming a fallback metric ("Revenue", "EPS") or a period
// that is not this year's FY ("H2 2026:"); the full text in title. Data text stays as written.
function guidanceValue(slot, year) {
  const r = slot.record;
  const value = String(r.value ?? '');
  const period = String(r.period ?? '').replace(/_/g, ' ');
  const pre = [slot.fallback ? metricLabel(r.metric) : null,
    period && period !== 'FY ' + year ? period + ':' : null].filter(Boolean).join(' ');
  return el('div', {className: 'g-value', title: pre ? pre + ' ' + value : value},
    pre ? el('span', {className: 'muted'}, pre + ' ') : null, value);
}

// "= Held · 13 Oct ↗": the status glyph and word, then the set date linked to its source.
function guidanceStatus(r, year) {
  const s = typeof r.status === 'string' ? r.status : 'unknown';
  return el('div', {className: 'g-status'}, statusBadge(s, statusLabel(s)), ' · ',
    docLink(r.source_url, isIsoDate(r.set_date) ? fmtDayIn(r.set_date, year) : 'source'));
}

// The next results date linked to its source: "29 Oct ↗", or "29 Oct (est.) ↗" with "(est.) ↗"
// in one span that the tight table drops under the date (C7); plain text without a safe URL.
function nextDate(next, year) {
  const node = link(next.url, fmtDayIn(next.date, year));
  const linked = node.nodeType === Node.ELEMENT_NODE;
  const arrow = linked ? el('span', {'aria-hidden': 'true'}, '↗') : null;
  const tail = next.confirmed ? arrow
    : el('span', {className: 'est'}, '(est.)', arrow ? ' ' : null, arrow);
  if (!tail) return node;
  if (!linked) return el('span', {}, node, ' ', tail);
  node.append(' ', tail);
  return node;
}

// The parts both layouts show, the table row (peerRow) and, at 960px and below, the company block
// (peerBlock, D1): worded by the helpers above, so a rule changes in one place for both. Every
// dash carries its reason in title.
function dashFor(why) {
  return el('span', {className: 'muted', title: why}, '–');
}

// The small --ink-2 line: under a figure in the table, beside it in a block.
function subLine(...content) {
  return el('span', {className: 'sub'}, ...content);
}

// "+5%" and "Q3 26 ↗".
function growthParts(f) {
  return f.growth ? [el('span', {className: 'fig1'}, kpiText(f.growth.value)),
    subLine(periodLink(f.name, f.growth))] : [dashFor(DASH_WHY.growth)];
}

// "▲ +0.2 pp" and "vs Q2 26". The figure is hidden from screen readers; the spoken words stand in
// for it, then the base. The caller adds changeTitle() as the title.
function changeParts(f) {
  const fig = changeFigure(f.change);
  return [el('span', {className: 'delta ' + fig.className, 'aria-hidden': 'true'}, fig.text),
    el('span', {className: 'visually-hidden'}, changeSpoken(f.change) + ' '),
    subLine(changeBase(f.change))];
}

// "17.4%" and "H1 26 ↗, operating", with the stored wording as the title.
function marginParts(f) {
  if (!f.margin) return {nodes: [dashFor(DASH_WHY.margin)], title: null};
  const metric = f.margin.metric;
  return {
    nodes: [el('span', {className: 'fig2'}, plainPct(f.margin.value)),
      subLine(periodLink(f.name, f.margin, 'margin'),
        metric ? ', ' + metric.replace(/ margin$/i, '') : null)],
    title: metric ? `${capitalize(metric)}, ${String(f.margin.period).replace(/_/g, ' ')}` : null,
  };
}

// The Top line or Profit value and its status line.
function guidanceParts(f, slot, year) {
  if (!f.guidance.onFile && slot === 'topLine') {
    return [el('span', {className: 'muted'}, 'No guidance on file')];
  }
  const s = f.guidance[slot];
  return s ? [guidanceValue(s, year), guidanceStatus(s.record, year)] : [dashFor(DASH_WHY.record)];
}

function ytdParts(f) {
  return isNum(f.ytd) ? el('span', {className: 'fig3'}, signedPct(f.ytd)) : dashFor(DASH_WHY.ytd);
}

// The results-day move, "pending" or a dash; each layout places f.move.period itself.
function moveParts(f) {
  const mv = f.move;
  if (mv.state === 'done') {
    return {node: el('span', {className: 'fig3'}, signedPct(mv.value)), title: MOVE_TITLE};
  }
  if (mv.state === 'pending') {
    return {node: el('span', {className: 'muted'}, 'pending'), title: MOVE_TITLE};
  }
  return {node: dashFor(DASH_WHY[mv.state]), title: null};
}

// The next results date ("29 Oct (est.) ↗", else "No date yet"), its period and, on the day, the
// "Reports today" pill.
function nextParts(f, year) {
  const nx = f.next;
  return {
    date: nx ? nextDate(nx, year) : el('span', {className: 'muted'}, 'No date yet'),
    period: nx?.period ?? null,
    today: nx?.today ? el('span', {className: 'badge badge-today'}, 'Reports today') : null,
  };
}

// One table row: the company name as the row header, then a cell per column.
function peerRow(f, year) {
  const td = (className, ...content) => el('td', {className}, ...content);
  const m = marginParts(f);
  const mv = moveParts(f);
  const nx = nextParts(f, year);
  return el('tr', {}, el('th', {scope: 'row'}, f.name),
    td('num growth', ...growthParts(f)),
    el('td', {className: 'num change', title: changeTitle(f.change)}, ...changeParts(f)),
    el('td', {className: 'num margin', title: m.title}, ...m.nodes),
    td('guid', ...guidanceParts(f, 'topLine', year)),
    td('guid', ...guidanceParts(f, 'profit', year)),
    td('num', ytdParts(f)),
    el('td', {className: 'num', title: mv.title}, mv.node,
      f.move.period ? subLine(f.move.period) : null),
    td('num next', nx.date,
      nx.period || nx.today ? subLine(nx.period, nx.period && nx.today ? ' ' : null, nx.today)
        : null));
}

// D1: one company as a block, in E3's order with each figure beside its guidance; each
// "Guidance" label is read as "Top line guidance" or "Profit guidance".
function peerBlock(f, year) {
  const pair = (label, dd) => [el('dt', {}, ...label), dd];
  const spoken = (text) => el('span', {className: 'visually-hidden'}, text);
  const m = marginParts(f);
  const mv = moveParts(f);
  const nx = nextParts(f, year);
  // "▲ +0.2 pp vs Q2 26" stays together; without a growth figure its dash says why alone.
  const change = f.growth
    ? el('span', {className: 'chg', title: changeTitle(f.change)}, ...changeParts(f)) : null;
  return el('div', {className: 'co-block'},
    el('h3', {className: 'co-name'}, f.name),
    el('dl', {},
      ...pair(['Organic growth'], el('dd', {className: 'figs'}, ...growthParts(f), change)),
      ...pair([spoken('Top line '), 'Guidance'],
        el('dd', {}, ...guidanceParts(f, 'topLine', year))),
      ...pair(['Margin'], el('dd', {className: 'figs', title: m.title}, ...m.nodes)),
      ...pair([spoken('Profit '), 'Guidance'],
        el('dd', {className: 'clamp3'}, ...guidanceParts(f, 'profit', year))),
      ...pair(['Share price'], el('dd', {},
        el('span', {className: 'nowrap'}, 'YTD ', ytdParts(f)), NBSP + '· ',
        el('span', {className: 'nowrap', title: mv.title},
          (f.move.period ? f.move.period + ' results' : 'Results') + ' ', mv.node))),
      ...pair(['Next results'], el('dd', {className: 'next'},
        nx.period ? nx.period + ', ' : null, nx.date, nx.today ? ' ' : null, nx.today))));
}

// C4: who grows fastest and slowest among the given companies with a growth figure, each with
// its own period ("(Q3)"; "(Q4 25)" outside this year). A tie goes to the first in companies.json
// order, and the trail is never the lead. Null with fewer than two figures.
function tableHeadline(facts, year) {
  const withFigure = facts.filter((f) => f.growth);
  if (withFigure.length < 2) return null;
  let lead = withFigure[0];
  for (const f of withFigure) if (f.growth.value > lead.growth.value) lead = f;
  const rest = withFigure.filter((f) => f !== lead);
  let trail = rest[0];
  for (const f of rest) if (f.growth.value < trail.growth.value) trail = f;
  const when = (f) => {
    const p = String(f.growth.period);
    return p.endsWith(' ' + year) ? p.split(' ')[0] : shortPeriod(p);
  };
  const part = (f, words) => [`${f.name} ${words} at `, el('strong', {}, kpiText(f.growth.value)),
    `${NBSP}(${when(f)})`];
  const [leadWords, trailWords] = lead.growth.value < 0 ? ['shrinks least', 'shrinks most']
    : ['grows fastest', trail.growth.value < 0 ? 'is shrinking' : 'grows slowest'];
  return [...part(lead, leadWords), ', ', ...part(trail, trailWords), '.'];
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

// [group label, its column names (none: one column spanning both header rows), numeric].
const TABLE_GROUPS = [['Company', null, false], ['Organic growth', ['Latest', 'Change'], true],
  ['Margin', null, true], ['Guidance', ['Top line', 'Profit'], false],
  ['Share price', ['YTD', 'Results day'], true], ['Next results', null, true]];

// One <colgroup> per group (they carry the vertical rules), then two header rows: the group
// labels, with Company, Margin and Next results spanning both, then the column names.
function tableHead() {
  const num = (on, extra) => [on ? 'num' : null, extra].filter(Boolean).join(' ') || null;
  const groups = el('tr', {className: 'groups'}, ...TABLE_GROUPS.map(([label, cols, numeric]) => {
    if (!cols) return el('th', {scope: 'col', rowspan: 2, className: num(numeric, 'group')}, label);
    const th = el('th', {scope: 'colgroup', colspan: cols.length, className: num(numeric, 'group')},
      label);
    // Guidance's values clamp, so its label links to the full list; the header's own name stays
    // "Guidance" for the cells it labels.
    if (label === 'Guidance') {
      th.setAttribute('aria-label', label);
      const jump = guidanceJump('See all ↓', 'See all guidance');
      jump.className = 'see-all';
      th.append(' ', jump);
    }
    return th;
  }));
  const names = el('tr', {}, ...TABLE_GROUPS.flatMap(([, cols, numeric]) => (cols || [])
    .map((name) => el('th', {scope: 'col', className: num(numeric)}, name))));
  return [...TABLE_GROUPS.map(([, cols]) => el('colgroup', {span: cols ? cols.length : 1})),
    el('thead', {}, groups, names)];
}

// C1: one row per shown company in companies.json order, the headline (C4) on the title's row and
// the foot line (C5); at 960px and below the same companies as blocks (D1). Print shows all six,
// always as the table.
function renderTable(ctx, data) {
  const panel = 'panel-comps';
  const scope = document.querySelector('#' + panel + ' .panel-head .scope');
  const headline = document.querySelector('#' + panel + ' .comps-headline');
  redrawTable = null;
  scope.textContent = '';
  headline.hidden = true;
  if (!ctx.list.length) return empty(panel, 'Company list unavailable.');

  const year = Number(ctx.today.slice(0, 4));
  const items = Array.isArray(data.events?.items) ? data.events.items : [];
  const src = {
    year,
    today: ctx.today,
    kpiRows: (Array.isArray(data.kpis?.rows) ? data.kpis.rows : [])
      .filter((r) => r && typeof r.company === 'string'),
    guidance: currentGuidance(data.guidance),
    results: items.filter((e) => e && e.type === 'results' && isIsoDate(e.date)
      && e.date.slice(0, 10) <= ctx.today),
    upcoming: upcomingEvents(data.events, ctx.today, null),
    series: data.prices?.series && typeof data.prices.series === 'object' ? data.prices.series : {},
    ytd: ytdByCode(ctx, data.prices),
  };
  const facts = new Map(ctx.list.map((c) => [c.code, peerFacts(ctx, c, src)]));
  const rows = new Map([...facts].map(([code, f]) => [code, peerRow(f, year)]));
  const blocks = new Map([...facts].map(([code, f]) => [code, peerBlock(f, year)]));

  const tbody = el('tbody');
  const table = el('table', {className: 'comps'},
    el('caption', {className: 'visually-hidden'},
      'Peer table: the latest reported figures for the companies shown'),
    ...tableHead(),
    tbody);

  // C5: "Definitions" opens Quarterly history at its definitions, below the capsule. An in-page
  // jump: the URL keeps the selection's #PUB,WPP.
  const defs = el('a', {href: '#definitions'}, 'Definitions');
  defs.addEventListener('click', (ev) => {
    ev.preventDefault();
    const fold = document.getElementById('fold-history');
    if (!fold) return;
    fold.open = true;
    const target = document.getElementById('definitions') || fold.querySelector('summary');
    target?.scrollIntoView({block: 'start'});
    target?.focus({preventScroll: true});
  });
  const wrap = el('div', {className: 'comps-wrap'}, table);
  const blockList = el('div', {className: 'comps-blocks'});
  bodyOf(panel).replaceChildren(wrap, blockList,
    el('p', {className: 'comps-foot'}, 'Latest reported figures, as stated. Growth and margin as '
      + 'each company defines them. ', defs));
  // If the table ever scrolls sideways inside its panel (zoomed text from 961 to 1100px; below
  // that the blocks replace it), the wrapper is a named tab stop, so a keyboard can scroll it.
  // Both sizes are watched: the wrapper narrows with the window, the table changes with the rows.
  const scrollStop = new ResizeObserver(() => {
    const scrolls = wrap.scrollWidth > wrap.clientWidth;
    for (const [k, v] of [['tabindex', '0'], ['role', 'region'],
      ['aria-label', 'Peer table, scrolls sideways']]) {
      if (scrolls) wrap.setAttribute(k, v);
      else wrap.removeAttribute(k);
    }
  });
  scrollStop.observe(wrap);
  scrollStop.observe(table);

  function draw(codes) {
    const had = document.activeElement;
    const hadFocus = tbody.contains(had) || blockList.contains(had);
    const want = new Set(codes);
    const shown = allCodes(ctx).filter((c) => want.has(c));
    tbody.replaceChildren(...shown.map((c) => rows.get(c)));
    blockList.replaceChildren(...shown.map((c) => blocks.get(c)));
    // With fewer than two growth figures the headline hides and the scope line names the shown.
    const parts = tableHeadline(shown.map((c) => facts.get(c)), year);
    headline.replaceChildren(...(parts || []));
    headline.hidden = !parts;
    scope.textContent = parts ? '' : scopeLabel(ctx, shown);
    scope.hidden = Boolean(parts);
    if (!hadFocus) return;
    // A link whose row or block stays keeps focus; one whose company left hands it to the
    // capsule: its first pressed pill or, where the pills fold away, the opener.
    if (had.isConnected) had.focus();
    else {
      document.querySelector(NARROW.matches ? '#filter .filter-opener'
        : '#filter-pills [aria-pressed="true"]')?.focus();
    }
  }

  draw([...selected]);
  redrawTable = () => draw([...selected]);
  // Paper shows every company's row and their headline (D6).
  window.addEventListener('beforeprint', () => { if (redrawTable) draw(allCodes(ctx)); });
  window.addEventListener('afterprint', () => { if (redrawTable) redrawTable(); });
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

// At 720px and below the x axis keeps at most 4 ticks and the chart headline names codes.
const NARROW = window.matchMedia('(max-width: 720px)');
const END_LABEL_GAP_PX = 12;
const LEADER_MIN_PX = 3; // a code moved less than this stays beside its dot, with no leader
const INK = '#1b2a41'; // chart text and codes; the one fallback for a company color
const BENCH_COLOR = '#6b7a8f'; // the benchmark's dashed line and its key swatch
// X-axis ticks by window (D3): the day on short windows, the year on long ones.
const TICK_FORMAT = {'1M': '%-d %b', '3M': '%-d %b', YTD: '%b', '1Y': '%b %Y', '2Y': '%b %Y'};
const YTD_SHORT_DAYS = 92; // a YTD window shorter than this shows days, like 1M and 3M

// The tick format for a window from first to last; from January to March YTD shows days, so a
// month never repeats along the axis.
function tickFormat(win, first, last) {
  if (win === 'YTD' && daysBetween(first, last) < YTD_SHORT_DAYS) return TICK_FORMAT['1M'];
  return TICK_FORMAT[win] || '%b %Y';
}

let endLabels = []; // per shown company line in the last draw: {code, name, color, x, y}
let endAnnotations = []; // the last placed end labels, reused so a redraw never drops them

// D3: each line's company code in ink at its right end, pushed at least 12px apart. Every code
// starts 16px right of its line's end, in one column; one the spacing moved points back at that
// end with a 1px leader in the company color.
function endLabelAnnotations(ymin, ymax, h) {
  const perPx = (ymax - ymin) / Math.max(h, 1);
  const gap = END_LABEL_GAP_PX * perPx;
  const sorted = [...endLabels].sort((a, b) => a.y - b.y);
  const ys = sorted.map((l) => l.y);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
  if (ys.length) ys[ys.length - 1] = Math.min(ys[ys.length - 1], ymax);
  for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap);
  return sorted.map((l, i) => {
    const label = {x: l.x, xref: 'x', yref: 'y', text: escapeHtml(l.code), xanchor: 'left',
      yanchor: 'middle', font: {color: INK, size: 12}};
    // The code's offset from its line's end in pixels; up the screen is negative.
    const ay = perPx > 0 ? -Math.round((ys[i] - l.y) / perPx) : 0;
    if (Math.abs(ay) < LEADER_MIN_PX) return {...label, y: ys[i], showarrow: false, xshift: 16};
    return {...label, y: l.y, showarrow: true, arrowhead: 0, arrowwidth: 1, arrowcolor: l.color,
      ax: 16, ay};
  });
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
  const subset = selected.size < ctx.list.length;

  // B4: only the shown companies are drawn; the key is a key, and the capsule the control.
  const shownSeries = series.filter((s) => selected.has(s.company.code));
  const companyTraces = [];
  endLabels = [];
  for (const s of shownSeries) {
    const code = s.company.code;
    const rank = ctx.list.indexOf(s.company);
    // One checked color per company: its line, end dot, leader and key swatch.
    const color = safeColor(s.company.color) || INK;
    const fullName = escapeHtml(s.company.name ?? code);
    const y = rebased(s.filled.slice(b));
    companyTraces.push({
      type: 'scatter',
      mode: 'lines',
      uid: 'co' + rank,
      name: fullName,
      meta: fullName,
      x,
      y,
      line: {width: 2, color},
      hovertemplate: '%{meta}: %{y:.1f}<extra></extra>',
    });
    const lastIdx = y.findLastIndex((v) => v !== null);
    if (lastIdx >= 0) {
      endLabels.push({code, name: String(s.company.name ?? code), color, x: x[lastIdx],
        y: y[lastIdx]});
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
      visible: benchVisible,
      x,
      y: benchY,
      line: {width: 1.5, color: BENCH_COLOR, dash: 'dash'},
      hovertemplate: '%{meta}: %{y:.1f}<extra></extra>',
    });
  }

  // D3: an 8px dot with a white ring at each line's last point, over every line, and not clipped
  // at the plot's right edge, where that point sits.
  traces.push({
    type: 'scatter',
    mode: 'markers',
    uid: 'ends',
    x: endLabels.map((l) => l.x),
    y: endLabels.map((l) => l.y),
    showlegend: false,
    hoverinfo: 'skip',
    cliponaxis: false,
    marker: {size: 8, color: endLabels.map((l) => l.color), line: {color: '#ffffff', width: 2}},
  });

  const first = x[0];
  const last = x[x.length - 1];
  const items = Array.isArray(data.events?.items) ? data.events.items : [];
  const marks = items.filter((e) => e && isIsoDate(e.date) && MARKER_TYPES.includes(e.type)
    && e.date.slice(0, 10) >= first && e.date.slice(0, 10) <= last
    // Markers only for a subset, and only the shown companies' events (K6).
    && subset && selected.has(e.company));
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
    line: {color: '#c9d3dd', width: 1},
  }];
  if (dates.length) {
    // Vertical event lines as one trace of null-separated segments.
    traces.push({
      type: 'scatter',
      mode: 'lines',
      uid: 'ev-lines',
      hoverinfo: 'skip',
      x: dates.flatMap((d) => [d, d, null]),
      y: dates.flatMap(() => [0, 1.04, null]),
      yaxis: 'y2',
      line: {color: '#8a97a8', width: 1, dash: 'dot'},
    });
    // One small marker per date at the top of the plot carries the hover text.
    traces.push({
      type: 'scatter',
      mode: 'markers',
      uid: 'ev-marks',
      x: dates,
      y: dates.map(() => 1),
      yaxis: 'y2',
      marker: {symbol: 'triangle-down', size: 8, color: '#8a97a8'},
      hovertext: dates.map((d) => byDate.get(d).map((e) => [companyName(ctx, e.company),
        capitalize(String(e.type ?? '').replace(/_/g, ' ')), String(e.title ?? '')]
        .map(escapeHtml).join(' · ')).join(HOVER_BR)),
      hovertemplate: '%{hovertext}<extra></extra>',
    });
  }

  // The headline reads the same rebased lines, for the shown companies only.
  const lastOf = (ys) => ys.findLast((v) => v !== null);
  // Codes on narrow screens; raw strings, never the escaped Plotly names.
  const ends = shownSeries.map((s, i) => ({code: s.company.code,
    name: NARROW.matches ? String(s.company.code) : String(s.company.name ?? s.company.code),
    v: lastOf(companyTraces[i].y)})).filter((e) => isNum(e.v));
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
    // D2: the benchmark's figure follows, muted and smaller, while its line is drawn; a hidden
    // ". " makes a screen reader end the trail phrase before it.
    const benchEnd = lastOf(benchY);
    const benchText = bench && benchVisible && isNum(benchEnd)
      ? `${bench.name}${NBSP}${signedPct(benchEnd - 100)}` : '';
    const parts = benchText ? [text, el('span', {className: 'visually-hidden'}, '. '), ' ',
      el('span', {className: 'chart-bench'}, benchText)] : [text];
    // Set only on change, so a redraw with the same numbers does not re-announce it.
    const want = parts.map((p) => (typeof p === 'string' ? p : p.textContent)).join('');
    if (headline.textContent !== want) headline.replaceChildren(...parts);
    headline.hidden = false;
  } else if (headline) {
    // No company has a value in this window: never leave the last window's text up.
    headline.textContent = '';
    headline.hidden = true;
  }

  // D2: the key lists what is drawn, by full name as text: each company line, the benchmark
  // while it shows, and for a subset the event markers. With nothing drawn it hides.
  const key = document.getElementById('chart-key');
  if (key) {
    const swatch = (color, className = 'key-line') => {
      const line = el('span', {className, 'aria-hidden': 'true'});
      line.style.borderTopColor = color;
      return line;
    };
    const entries = endLabels.map((l) => el('li', {}, swatch(l.color), l.name));
    if (bench && benchVisible && benchY.some(isNum)) {
      entries.push(el('li', {}, swatch(BENCH_COLOR, 'key-line bench'), bench.name));
    }
    if (subset && entries.length) {
      entries.push(el('li', {className: 'key-events'}, el('span', {'aria-hidden': 'true'}, '▾'),
        ' Results, capital markets days and deals'));
    }
    key.replaceChildren(...entries);
    key.hidden = !entries.length;
  }

  // Place the end labels before drawing with an estimated range (5% padding, the last plot
  // height), so they never disappear; placeEndLabels corrects them once the plot exists.
  const shown = [100, ...companyTraces.flatMap((t) => t.y),
    ...(benchVisible ? benchY : [])].filter(isNum);
  const lo = Math.min(...shown);
  const hi = Math.max(...shown);
  const pad = (hi - lo) * 0.05;
  const gd = document.getElementById('chart');
  const h = gd._fullLayout?._size?.h || gd.clientHeight - 60;
  endAnnotations = endLabelAnnotations(lo - pad, hi + pad, h);

  // Section 7. No layout.height: #chart's CSS height reaches Plotly through responsive
  // autosizing, so a breakpoint resizes the plot without a redraw. The right margin is 72, not
  // 64: a moved DENTSU code (16px out, then its text) measured 5px past 64.
  const sans = getComputedStyle(document.body).fontFamily;
  const layout = {
    margin: {l: 44, r: 72, t: 12, b: 36},
    hovermode: 'x unified',
    hoverlabel: {bgcolor: '#ffffff', bordercolor: '#c9d3dd',
      font: {size: 12, family: sans, color: INK}},
    showlegend: false,
    // No drag-to-zoom: the window track is the only time control. fixedrange alone still let
    // Plotly's touch handler swallow a swipe; with dragmode false a swipe over the chart scrolls.
    dragmode: false,
    // Fewer x ticks on narrow screens keep the dates horizontal. The hover's date header keeps
    // the day and year whatever the tick format.
    xaxis: {type: 'date', range: [first, last], fixedrange: true, showgrid: false, showline: true,
      linecolor: '#c9d3dd', ticks: 'outside', ticklen: 4, tickcolor: '#c9d3dd',
      tickformat: tickFormat(win, first, last), hoverformat: '%-d %b %Y', automargin: true,
      nticks: NARROW.matches ? 4 : 11, tickfont: {size: 12, color: '#4f5f74'}},
    yaxis: {fixedrange: true, gridcolor: '#e6ebf1', zeroline: false, ticksuffix: ' ',
      automargin: true, nticks: 7, tickfont: {size: 12, color: '#4f5f74'}},
    yaxis2: {overlaying: 'y', range: [0, 1.04], visible: false, fixedrange: true},
    shapes,
    annotations: endAnnotations,
    // No layout.transition: with one, Plotly.react pins the y range to [-1, 4] when several
    // lines turn visible at once (seen in step 17). Without one, redraws are instant anyway.
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    font: {family: sans, size: 12, color: INK},
  };
  return Plotly.react(gd, traces, layout, {displaylogo: false, responsive: true,
    displayModeBar: false});
}

function hideChartControls() {
  const controls = document.querySelector('#panel-chart .chart-controls');
  if (controls) controls.hidden = true;
  for (const id of ['chart-headline', 'chart-key']) {
    const node = document.getElementById(id);
    if (node) node.hidden = true;
  }
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
  // Every redraw reads the current window, the selection and the benchmark's visibility.
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

// 12g's rule, shared by the grid and the table: quarter q's organic growth vs the quarter
// directly before, both quarterly figures (a half-year never counts); null unless both exist.
function quarterDelta(byQuarter, q) {
  const a = byQuarter.get(q)?.organic_growth_pct;
  const b = byQuarter.get(q - 1)?.organic_growth_pct;
  return isNum(a) && isNum(b) ? Math.round((a - b) * 10) / 10 : null;
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// The stored number as reported, never rounded, with the true minus: "17.4%", "−2.8%".
function plainPct(v) {
  return (v < 0 ? MINUS : '') + String(Math.abs(v)) + '%';
}

// The stored number with a sign; never rounded. "–" when there is no number.
function kpiText(v) {
  return isNum(v) ? (v > 0 ? '+' : '') + plainPct(v) : '–';
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
      'aria-label': isNum(v) ? null : 'not stated, note available',
      title: isNum(v) ? null : 'Not stated; see the note'}, kpiText(v));
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
    let delta = el('td', {className: 'kpi-delta kpi-none', 'aria-label': 'not available',
      title: 'No two quarters in a row to compare'}, '–');
    if (d !== null) {
      const prev = newest - 1;
      const span = Math.floor(newest / 4) === Math.floor(prev / 4)
        ? `Q${(newest % 4) + 1} vs ${quarterLabel(prev)}`
        : `${quarterLabel(newest)} vs ${quarterLabel(prev)}`;
      const words = d > 0 ? `up ${d.toFixed(1)}` : d < 0 ? `down ${Math.abs(d).toFixed(1)}` : null;
      delta = el('td', {className: 'kpi-delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat'),
        title: span, 'aria-label': `${span}: ` + (words ? words + ' percentage points' : 'no change')},
      glyphSigned(d));
    }
    const tr = el('tr', {}, name, delta);
    for (let q = first; q <= last; q++) {
      if (byQuarter.has(q)) {
        tr.appendChild(valueCell(byQuarter.get(q), 1));
      } else if (halves.has(q) && q + 1 <= last && !byQuarter.has(q + 1)) {
        tr.appendChild(valueCell(halves.get(q), 2));
        q++;
      } else {
        tr.appendChild(el('td', {className: 'kpi-cell kpi-none', 'aria-label': 'not stated',
          title: 'No figure stated for this quarter'}, '–'));
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

// ---------- All guidance (folded under the table) ----------

const PERIOD_RANK = {FY: 0, H1: 1, H2: 2, Q1: 3, Q2: 4, Q3: 5, Q4: 6};
const SUMMARY_STATUSES = ['raised', 'cut', 'new', 'held', 'withdrawn'];

// [year, rank] for "FY 2026", "H2 2026" or "Q3 2026"; null for anything else (e.g. medium_term).
function periodKey(period) {
  const m = /^(FY|H[12]|Q[1-4]) (\d{4})$/.exec(String(period ?? ''));
  return m ? [Number(m[2]), PERIOD_RANK[m[1]]] : null;
}

// The headline record for a table guidance cell: a current-calendar-year period if any, else
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
// within each. A quote that only repeats the value or the quote just above it is left out. Set
// dates read "13 Oct" in the given year, "2 Feb 2027" otherwise (C6).
function guidanceRecordLines(records, year) {
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
        link(r.source_url, isIsoDate(r.set_date) ? fmtDayIn(r.set_date, year) : 'source')),
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
  const year = ctx.today.slice(0, 4);
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
        ...guidanceRecordLines(mine.filter((r) => companyOf(r) === code), year))));
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
  // Paper shows every company's guidance, like the table (D6).
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
      // Blank without companies.json, so the line never starts with " · ".
      const label = scopeLabel(ctx, codes);
      scopeText = (expanded) => (label ? label + ' · ' : '') + (!key.length
        ? `${releases(mine.length)}, none key`
        : expanded ? `all ${mine.length}, key releases first`
          : `${key.length} key ${key.length === 1 ? 'release' : 'releases'} of ${mine.length}`);
      more.hidden = !extra.length;
      setOpen(open);
    });
  }

  // Closing shrinks the list; bring the button back so the reader isn't left further down.
  // Esc scrolls only when the button has gone up under the pinned filter band (or off the top),
  // so the page never jumps.
  const collapse = (fromEsc) => {
    keepFocus(() => setOpen(false));
    const covered = document.getElementById('filter')?.getBoundingClientRect().bottom ?? 0;
    if (!fromEsc || more.getBoundingClientRect().top < covered) {
      more.scrollIntoView({block: 'nearest'});
    }
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
    el('li', {}, 'Guidance age: ' + (typeof age === 'number'
      ? `${age} ${age === 1 ? 'day' : 'days'}` : 'no guidance yet')),
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
  if (['panel-press', 'panel-changes', 'panel-comps'].includes(panelId)) {
    const scope = document.querySelector('#' + panelId + ' .panel-head .scope');
    if (scope) scope.textContent = '';
  }
  const headline = document.querySelector('#' + panelId + ' .comps-headline');
  if (headline) headline.hidden = true;
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

  // The capsule is not a panel: a failure leaves it without pills and the panels still draw.
  try {
    renderFilter(ctx);
  } catch (err) {
    console.warn('[holdco] filter failed to render:', err);
  }
  runPanel('panel-changes', renderChanges, ctx, data);
  runPanel('panel-comps', renderTable, ctx, data);
  runPanel('fold-guidance', renderGuidanceFold, ctx, data);
  runPanel('fold-history', renderKpis, ctx, data);
  runPanel('panel-quotes', renderQuotes, ctx, data);
  runPanel('panel-chart', renderChart, ctx, data);
  runPanel('panel-press', renderPress, ctx, data);
  // Both folded sections print open (Q7). A link to a fold or into one (#fold-guidance, or the
  // table's #definitions, opened in a new tab) opens it.
  const openLinkedFold = () => {
    const fold = document.getElementById(location.hash.slice(1))?.closest('details.fold');
    if (fold) fold.open = true;
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

  // The one Esc handler (R6, B6): an open phone opener closes and nothing else happens;
  // otherwise it shows all companies, unpins a KPI cell and collapses press.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (closeFilter && closeFilter()) return;
    if (resetPress) resetPress();
    if (selected.size < ctx.list.length) setSelection(ctx, allCodes(ctx));
    if (unpinKpi) unpinKpi();
  });
}

main();
