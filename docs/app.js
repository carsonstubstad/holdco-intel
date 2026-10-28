'use strict';
// Holdco Intel dashboard. Plain DOM, no framework. All external text goes in via text nodes.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MARKER_TYPES = ['results', 'capital_markets_day', 'deal'];
const DAY_MS = 86400000;
const NBSP = String.fromCharCode(160); // keeps a figure on its label's line
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
  // A missing URL is no link: new URL() would resolve "null" or "" against this page.
  if (u === null || u === undefined || String(u).trim() === '') return null;
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

// "9 Oct 2026, 01:51 UTC" (DESIGN.md S3), the same for every reader; "unknown" when missing or
// unreadable (new Date(null) would read 1970).
function fmtTimestamp(ts) {
  const t = typeof ts === 'string' ? new Date(ts) : null;
  if (!t || Number.isNaN(t.getTime())) return 'unknown';
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}, `
    + `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} UTC`;
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

// "#PUB,WPP" for a subset, "" for all companies: the hash writeHash sets and Copy link copies.
function selectionHash(ctx) {
  const codes = allCodes(ctx).filter((c) => selected.has(c));
  return codes.length === ctx.list.length ? '' : '#' + codes.join(',');
}

// The URL carries the selection (#PUB,WPP) without adding history entries; all six clears it.
function writeHash(ctx) {
  history.replaceState(null, '', selectionHash(ctx) || location.pathname + location.search);
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

  // Copy link (step 21): the page's address with the shown peer set, where the clipboard is
  // available. "Copied" for 2 seconds (a second click restarts the timer) at the width "Copy link"
  // measures in the reader's own font, so the pill never shrinks; #announce is cleared first, so
  // a second copy is announced too. The phone opener stays open.
  const copy = band.querySelector('.copy-link');
  if (copy && navigator.clipboard?.writeText) {
    let timer = null;
    copy.addEventListener('click', async () => {
      if (copy.textContent === 'Copy link') {
        copy.style.minWidth = copy.getBoundingClientRect().width + 'px';
      }
      const announce = document.getElementById('announce');
      announce.textContent = '';
      try {
        await navigator.clipboard.writeText(
          location.origin + location.pathname + location.search + selectionHash(ctx));
      } catch (err) {
        announce.textContent = 'Could not copy the link';
        return;
      }
      copy.textContent = 'Copied';
      clearTimeout(timer);
      timer = setTimeout(() => { copy.textContent = 'Copy link'; }, 2000);
      announce.textContent = 'Link copied';
    });
    copy.hidden = false;
  }

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

// ---------- What’s new: a dated brief of the last 14 days, then the next dates (E1) ----------

const BRIEF_DAYS = 14;
// 3, not 4: with four rows the 1440x900 table ended at 868px, past the 860px first screen
// (DESIGN.md "First screen (20e)").
const BRIEF_ROWS = 3;
const COMING_WORD = {capital_markets_day: 'capital markets day', deal: 'deal'};
const MOVE_STATUSES = ['raised', 'cut', 'new', 'withdrawn'];
// On one day: results, then guidance, a capital markets day, a deal.
const BRIEF_ORDER = ['results', 'guidance', 'capital_markets_day', 'deal'];
// A results row's guidance word: the strongest status among the records set on its day.
const DAY_GUIDANCE = [['cut', 'guidance cut'], ['raised', 'guidance raised'],
  ['new', 'new guidance'], ['withdrawn', 'guidance withdrawn'], ['held', 'guidance held']];

// E1's window, shared with E2's marker: from 14 days before today to yesterday (an event dated
// today stays on the Next line).
function inBrief(iso, today) {
  const d = iso.slice(0, 10);
  return d >= addDays(today, -BRIEF_DAYS) && d < today;
}

// E1 and E2's one record set: the results events in the window, each with its KPI row
// (resultsRow; null while not on file, and always without kpis.json).
function briefResults(events, kpiRows, kpisOk, today) {
  return events.filter((e) => e && e.type === 'results' && isIsoDate(e.date)
    && inBrief(e.date, today)).map((e) => ({e, kpi: kpisOk ? resultsRow(kpiRows, e) : null}));
}

// J3: the one ↗ every link to a company document ends in: 0.85em in --border-2 whatever the link's
// color, hidden from screen readers. After text on the same line a no-break space inside its span
// keeps it with the last word, and goes with it on paper, which hides the ↗; bare where a flex
// gap stands in (clipped) or the ↗ is the whole link (the guidance source).
function docArrow(bare) {
  return el('span', {className: 'doc-arrow', 'aria-hidden': 'true'}, (bare ? '' : NBSP) + '↗');
}

// A link to a company document with its ↗; plain text (and no ↗) without a safe URL.
function docLink(u, text) {
  const node = link(u, text);
  if (node.nodeType === Node.ELEMENT_NODE) node.append(docArrow());
  return node;
}

// An in-page jump that opens All guidance and moves focus to its summary: link() opens a new
// tab, and the URL keeps the selection's #PUB,WPP. The peer table's foot line uses it (E3).
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

// Hands keyboard focus to the capsule when a redraw took the focused link away: its first pressed
// pill or, where the pills fold away, the opener.
function focusFilter() {
  document.querySelector(NARROW.matches ? '#filter .filter-opener'
    : '#filter-pills [aria-pressed="true"]')?.focus();
}

// A title on one line, cut with "…" above 720px on screen (its full text in title) and wrapping on
// phones and in print; the ↗ stays outside the cut. Linked through link(); plain text and no ↗
// without a safe URL.
function clipped(u, title, ...content) {
  const clip = el('span', {className: 'c-clip'}, ...(content.length ? content : [title]));
  const node = link(u, '');
  if (node.nodeType !== Node.ELEMENT_NODE) return el('span', {className: 'c-clipped', title}, clip);
  node.className = 'c-clipped';
  node.title = title;
  // The space shows where the title wraps (phones, print); one line, the flex gap stands in.
  node.replaceChildren(clip, ' ', docArrow(true));
  return node;
}

// E1: the shown companies' results, guidance moves, capital markets days and deals of the last
// 14 days, newest first, at most BRIEF_ROWS (results first when some are left out, L3); then the
// next three dates on file, with L1's note at the end of their row. Print shows all companies.
function renderChanges(ctx, data) {
  const panel = 'panel-changes';
  redrawChanges = null;
  if (!ctx.list.length) return empty(panel, 'Company list unavailable.');

  const year = ctx.today.slice(0, 4);
  const order = new Map(allCodes(ctx).map((c, i) => [c, i]));
  const rank = (code) => order.get(code) ?? ctx.list.length;
  const day = (iso) => iso.slice(0, 10);
  const eventsOk = Array.isArray(data.events?.items);
  const events = eventsOk ? data.events.items.filter((e) => e && isIsoDate(e.date)) : [];
  const kpisOk = Array.isArray(data.kpis?.rows);
  const kpiRows = kpisOk ? data.kpis.rows.filter((r) => r && typeof r.company === 'string') : [];
  const series = data.prices?.series && typeof data.prices.series === 'object'
    ? data.prices.series : {};
  const guidance = currentGuidance(data.guidance);
  const press = Array.isArray(data.press?.items) ? data.press.items : [];
  const body = bodyOf(panel);
  // A "·" that opens a later part; a fold one shows only where a row folds onto two lines.
  const sep = (fold) => el('span', {className: fold ? 'c-sep c-fold' : 'c-sep',
    'aria-hidden': 'true'}, '·');
  const muted = (text) => el('span', {className: 'muted'}, text);

  // Date | company | kind | details; on phones "date · company · kind" over the details.
  const row = (date, code, kind, ...details) => el('li', {className: 'c-row'},
    el('span', {className: 'c-date'}, date),
    el('span', {className: 'c-co'}, sep(true), companyName(ctx, code)),
    el('span', {className: 'c-kind'}, sep(true), kind),
    el('span', {className: 'c-detail'}, ...details.filter(Boolean)
      .map((part, i) => (i ? el('span', {}, sep(), part) : part))));

  // Results: a results event in the window that is confirmed or has its KPI row (an estimated
  // date with no figures may not have happened).
  const results = briefResults(events, kpiRows, kpisOk, ctx.today)
    .filter(({e, kpi}) => e.confirmed === true || kpi);
  const resultsOn = new Set(results.map(({e}) => e.company + ' ' + day(e.date)));

  // "organic +7.2% ▲ +1.1 pp vs Q2 26" (or the dash and its reason, as C2), else why there is no
  // figure: none in the row, the row not on file yet, or no KPI file.
  const figures = (e, kpi) => {
    if (!kpisOk) {
      return el('span', {}, dashFor('Quarterly figures unavailable'), ' ',
        muted('figures unavailable'));
    }
    if (!kpi) return muted('figures to come');
    if (!isNum(kpi.organic_growth_pct)) {
      return el('span', {}, dashFor(DASH_WHY.growth), ' ', muted('no organic figure'));
    }
    const change = growthChange(kpiRows.filter((r) => r.company === e.company), kpi);
    return el('span', {}, el('span', {className: 'nowrap'}, 'organic ',
      el('strong', {className: 'c-value'}, kpiText(kpi.organic_growth_pct))), ' ',
    el('span', {className: 'chg nowrap', title: changeTitle(change)}, ...changeParts({change})));
  };
  // C3's two-day move, "share price ▲ +2.7% on results (2 days)" (J1, J2); "pending" until the
  // close after results day; left out without one.
  const share = (e) => {
    const mv = resultsMove(series[ctx.byCode[e.company]?.ticker], day(e.date));
    if (mv.state === 'done') {
      return el('span', {title: MOVE_TITLE}, el('span', {className: 'nowrap'}, 'share price ',
        el('strong', {className: 'c-value'}, shareFigure(mv.value))), ` on results (${MOVE_DAYS})`);
    }
    return mv.state === 'pending'
      ? el('span', {title: MOVE_TITLE}, 'share price ', muted('pending')) : null;
  };
  // "= guidance held" when the company set records on its results day (curate.md dates them to
  // the release).
  const dayWord = (e) => {
    const set = new Set(guidance.filter((r) => r.company === e.company && isIsoDate(r.set_date)
      && day(r.set_date) === day(e.date)).map((r) => r.status));
    const hit = DAY_GUIDANCE.find(([s]) => set.has(s));
    return hit ? statusBadge(hit[0], statusLabel(hit[0], hit[1])) : null;
  };

  const items = [
    ...results.map(({e, kpi}) => ({date: day(e.date), code: e.company, kind: 'results',
      node: row(docLink(kpi && safeUrl(kpi.source_url) ? kpi.source_url : e.source_url,
        fmtDayIn(e.date, year)), e.company,
      [titlePeriod(e.title), 'results'].filter(Boolean).join(' '),
      figures(e, kpi), share(e), dayWord(e))})),
    // Guidance moved on a day its company has no results row (B5's row content).
    ...guidance.filter((r) => MOVE_STATUSES.includes(r.status) && isIsoDate(r.set_date)
      && inBrief(r.set_date, ctx.today) && !resultsOn.has(r.company + ' ' + day(r.set_date)))
      .map((r) => {
        const what = [metricLabel(r.metric), String(r.period ?? '').replace(/_/g, ' ')]
          .filter(Boolean).join(' ');
        const value = String(r.value ?? '');
        return {date: day(r.set_date), code: r.company, kind: 'guidance',
          node: row(docLink(r.source_url, fmtDayIn(r.set_date, year)), r.company,
            statusBadge(r.status, statusLabel(r.status)),
            // Its figures bold (J4). As in the table: a withdrawn value is struck, its
            // "× Withdrawn" is not.
            clipped(null, `${what}: ${value}`, muted(what + ' '),
              ...(r.status === 'withdrawn' ? [el('s', {}, ...guidanceText(value))]
                : guidanceText(value))))};
      }),
    ...events.filter((e) => e.type === 'capital_markets_day' && inBrief(e.date, ctx.today))
      .map((e) => ({date: day(e.date), code: e.company, kind: e.type,
        node: row(fmtDayIn(e.date, year), e.company, 'Capital markets day',
          clipped(e.source_url, String(e.title ?? '')))})),
    // Deals come from the press release; past deal events make no rows.
    ...press.filter((p) => p && p.category === 'm_and_a' && isIsoDate(p.published)
      && inBrief(p.published, ctx.today))
      .map((p) => ({date: day(p.published), code: p.company, kind: 'deal',
        node: row(fmtDayIn(p.published, year), p.company, 'Deal',
          clipped(p.url, String(p.title ?? '')))})),
  ].sort((a, b) => b.date.localeCompare(a.date)
    || BRIEF_ORDER.indexOf(a.kind) - BRIEF_ORDER.indexOf(b.kind) || rank(a.code) - rank(b.code));

  // The Next line: the next three dates with a results event, a capital markets day or a deal,
  // from today through 14 days ahead; companies grouped by date in companies.json order. (The
  // table's Next results column has no window.)
  const coming = upcomingEvents(data.events, ctx.today, BRIEF_DAYS)
    .filter((e) => MARKER_TYPES.includes(e.type));
  const nextItem = (e) => {
    const what = e.type === 'results' ? titlePeriod(e.title) ?? 'results'
      : COMING_WORD[e.type] ?? String(e.type).replace(/_/g, ' ');
    const est = e.confirmed === true ? '' : ' (est.)';
    // "Reports today" fits results; a capital markets day or a deal is just "Today".
    const today = day(e.date) === ctx.today ? el('span', {className: 'badge badge-today'},
      e.type === 'results' ? 'Reports today' : 'Today') : null;
    return el('span', {className: 'nowrap'},
      docLink(e.source_url, `${companyName(ctx, e.company)} ${what}${est}`),
      today ? ' ' : null, today);
  };

  function draw(codes) {
    const links = () => [...body.querySelectorAll('a')];
    const focusAt = links().indexOf(document.activeElement);
    const want = new Set(codes);
    const everyone = allCodes(ctx).every((c) => want.has(c));
    const shown = items.filter((x) => everyone || want.has(x.code));
    // L3: with more updates than rows, the rows are chosen by kind before date (results, then
    // guidance moves, capital markets days, deals; newest first within a kind), then shown in
    // shown's order: newest first, E1's same-day order.
    const kept = new Set([...shown].sort((a, b) => BRIEF_ORDER.indexOf(a.kind)
      - BRIEF_ORDER.indexOf(b.kind) || b.date.localeCompare(a.date) || rank(a.code) - rank(b.code))
      .slice(0, BRIEF_ROWS));
    const rows = shown.filter((x) => kept.has(x));
    const next = coming.filter((e) => everyone || want.has(e.company));
    const dates = [...new Set(next.map((e) => day(e.date)))].slice(0, 3);
    // "Next 14 days", then the dates in one span, so a wrapped line hangs under the first date.
    const nextLine = el('p', {className: 'c-next'},
      el('span', {className: 'c-next-label'}, `Next ${BRIEF_DAYS} days`),
      el('span', {className: 'c-next-dates'}, ...(!eventsOk ? [muted('Dates unavailable.')]
        : !dates.length ? [muted('No dates on file.')]
          : dates.map((d, i) => el('span', {}, i ? sep() : null, fmtDayIn(d, year) + ' ',
            ...next.filter((e) => day(e.date) === d)
              .sort((a, b) => rank(a.company) - rank(b.company))
              .flatMap((e, j) => [j ? ', ' : null, nextItem(e)]))))));

    // L1: what the scope line said that still matters, at the right end of the Next line's row:
    // "Updates from the last 14 days", "· 3 of 5 shown" when rows are left out. None without
    // rows: the empty sentence says it.
    const note = rows.length ? el('p', {className: 'c-note'},
      el('span', {className: 'nowrap'}, `Updates from the last ${BRIEF_DAYS} days`),
      shown.length > rows.length
        ? el('span', {className: 'nowrap'}, sep(), `${rows.length} of ${shown.length} shown`)
        : null) : null;
    body.replaceChildren(rows.length ? el('ul', {className: 'c-rows'}, ...rows.map((x) => x.node))
      : el('p', {className: 'empty'}, `Nothing reported in the last ${BRIEF_DAYS} days.`),
    el('div', {className: 'c-foot'}, nextLine, note));
    // Never leave keyboard focus on a link that was just replaced: the link in the same place,
    // else the capsule.
    if (focusAt >= 0) {
      const same = links()[focusAt];
      if (same) same.focus();
      else focusFilter();
    }
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
// J1: the move's window as built, results day and the day after ("H1 · 2 days", "(2 days)").
const MOVE_DAYS = '2' + NBSP + 'days';
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
  // "Third Quarter 2026 Earnings Call" -> "Q3", so E1 and E2 can still match its KPI row.
  const q = /\b(first|second|third|fourth) quarter\b/i.exec(t);
  if (q) return 'Q' + (['first', 'second', 'third', 'fourth'].indexOf(q[1].toLowerCase()) + 1);
  return /\binterim\b|\bhalf[- ]year/i.test(t) ? 'H1' : null;
}

// The period an event title reports, with the title's own year: "Q3 FY2026 results" -> "Q3 2026".
// The year never comes from the event's date, since Q4 and FY results come out the next year.
// Null without both.
function titlePeriodYear(title) {
  const p = titlePeriod(title);
  const y = /20\d{2}/.exec(String(title ?? ''));
  return p && y ? p + ' ' + y[0] : null;
}

// E1 and E2's period match: the company's KPI row whose period ends where the event title's does,
// the shorter period first (latestRow's tie rule), so Dentsu's "Q2 FY2026 results" finds its
// H1 2026 row and Publicis's "H1 2026 results" its Q2 2026 row. A row with a null figure still
// matches; null when none does or the title names no period.
function resultsRow(rows, e) {
  const span = periodSpan(titlePeriodYear(e.title));
  if (!span) return null;
  const hits = rows.filter((r) => r.company === e.company)
    .map((r) => [r, periodSpan(r.period)])
    .filter(([, s]) => s && s[0] === span[0])
    .sort((a, b) => a[1][1] - b[1][1]);
  return hits.length ? hits[0][0] : null;
}

// C3's two-day move: the close before results day to the close after it, from real closes only;
// 'pending' until the close after exists, 'gap' without a close before.
function resultsMove(series, day) {
  const pts = nonNullPoints(series);
  const before = pts.filter(([d]) => d < day).pop();
  const after = pts.find(([d]) => d > day);
  const value = before && after ? pct(after[1], before[1]) : null;
  return {value: isNum(value) ? value : null,
    state: isNum(value) ? 'done' : before && !after ? 'pending' : 'gap'};
}

// C2's change for a growth row: its quarter vs the quarter directly before, both quarterly
// figures (12g's rule); a half-year or full-year figure has no quarter before it.
function growthChange(rows, g) {
  if (!g) return {delta: null, why: 'none'};
  const [end, len] = periodSpan(g.period);
  if (len > 1) return {delta: null, why: len === 2 ? 'half' : 'full'};
  const delta = quarterDelta(quarterRows(rows), end);
  return {delta, why: delta === null ? 'gap' : null, end, base: end - 1};
}

// One company's facts for its peer table row and its company block: numbers, raw periods, URLs
// and reason codes, never display words (the helpers below word them).
function peerFacts(ctx, c, src) {
  const rows = src.kpiRows.filter((r) => r.company === c.code);
  const g = latestRow(rows, 'organic_growth_pct');
  const m = latestRow(rows, 'margin_pct');
  const change = growthChange(rows, g);

  const records = src.guidance.filter((r) => r.company === c.code);
  const guidance = {onFile: records.length > 0};
  for (const [slot, metric, alt] of PEER_GUIDANCE) {
    const main = headlineRecord(records.filter((r) => r.metric === metric), src.year);
    const other = main ? null : headlineRecord(records.filter((r) => r.metric === alt), src.year);
    guidance[slot] = main || other ? {record: main || other, fallback: !main} : null;
  }

  // The move around the latest results day, up to today.
  const ev = src.results.filter((e) => e.company === c.code)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const move = ev ? {period: titlePeriod(ev.title), ...resultsMove(src.series[c.ticker],
    ev.date.slice(0, 10))} : {state: 'none', period: null, value: null};

  // E2: the newest confirmed results event in E1's window with no KPI row for its period yet;
  // never without kpis.json.
  const hit = src.brief.filter(({e: x}) => x.company === c.code && x.confirmed === true)
    .sort((a, b) => b.e.date.localeCompare(a.e.date))[0];
  const out = src.kpisOk && hit && !hit.kpi ? {period: titlePeriod(hit.e.title),
    label: titlePeriodYear(hit.e.title), date: hit.e.date.slice(0, 10), url: hit.e.source_url}
    : null;

  const e = src.upcoming.find((x) => x.company === c.code && x.type === 'results');
  return {
    code: c.code,
    name: String(c.name ?? c.code),
    out,
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

// E3: the statuses a table guidance value shows, unlike MOVE_STATUSES no "new": Held and New show
// none (a "New" can be months old; All guidance carries every record's status and E1 the last 14
// days' moves).
const TABLE_STATUSES = ['raised', 'cut', 'withdrawn'];

// J4: a figure in a guidance value: a number (thousands separators included) with a sign, a
// currency before it or a unit after it, taken whole ("+4.5%", "€2.2 billion", "£800m",
// "$1,500 million"). Group 1 is the character before it, 3 the currency, 4 the unit.
const GUIDANCE_FIGURE = new RegExp(String.raw`(^|[^\w.,])((?:[+${MINUS}]|-(?=\d))?([€$£¥])?`
  + String.raw`\d+(?:[.,]\d+)*(%|\s?pp|bn|m|\s?(?:million|billion))?)(?!\w)`, 'g');

// J4: a guidance value as text with only its figures bold (strong.g-fig). A bare number, such as a
// year, stays regular, and a hyphen is a sign only at the start or after a space. Text nodes only:
// the value's text never changes.
function guidanceText(value) {
  const out = [];
  let at = 0;
  for (const m of value.matchAll(GUIDANCE_FIGURE)) {
    let fig = m[2];
    let start = m.index + m[1].length;
    if (fig[0] === '-' && m[1] && !/\s/.test(m[1])) {
      fig = fig.slice(1);
      start += 1;
    }
    if (!['+', '-', MINUS].includes(fig[0]) && !m[3] && !m[4]) continue;
    if (start > at) out.push(value.slice(at, start));
    out.push(el('strong', {className: 'g-fig'}, fig));
    at = start + fig.length;
  }
  if (at < value.length) out.push(value.slice(at));
  return out;
}

// E3: the guidance value in full (CSS clamps it), led by its status only when it moved ("▲ Raised
// · "; a withdrawn value struck through), with a muted prefix naming a fallback metric ("Revenue",
// "EPS") or a period that is not this year's FY ("H2 2026:"). The title adds the status and date.
// The ↗ to the record's source sits outside the clamped text, so a long value never hides it;
// none without a safe URL. Data text stays as written.
function guidanceValue(name, slot, year) {
  const r = slot.record;
  const s = typeof r.status === 'string' ? r.status : 'unknown';
  const value = String(r.value ?? '');
  const period = String(r.period ?? '').replace(/_/g, ' ');
  const pre = [slot.fallback ? metricLabel(r.metric) : null,
    period && period !== 'FY ' + year ? period + ':' : null].filter(Boolean).join(' ');
  const date = isIsoDate(r.set_date) ? fmtDayIn(r.set_date, year) : null;
  const moved = TABLE_STATUSES.includes(s);
  const when = [capitalize(s), date].filter(Boolean).join(', ');
  const full = (pre ? pre + ' ' : '') + value;
  const text = el('span', {className: 'g-value', title: full + '\n' + when},
    moved ? statusBadge(s, statusLabel(s)) : null, moved ? ' · ' : null,
    pre ? el('span', {className: 'muted'}, pre + ' ') : null,
    ...(s === 'withdrawn' ? [el('s', {}, ...guidanceText(value))] : guidanceText(value)));
  // The ↗ is the whole link; its aria-label names it.
  const src = link(r.source_url, '');
  if (src.nodeType !== Node.ELEMENT_NODE) return el('div', {className: 'g-line'}, text);
  src.append(docArrow(true));
  src.className = 'g-src';
  src.setAttribute('aria-label',
    `${name} ${metricLabel(r.metric)} guidance source${date ? ', ' + date : ''}`);
  return el('div', {className: 'g-line'}, text, src);
}

// E2: "Q3 out 22 Oct ↗" under the company's name, linked to the results event; null unless the
// company's results are out and their figures are not on file yet.
function outParts(f, year) {
  if (!f.out) return null;
  const when = fmtDayIn(f.out.date, year);
  const what = f.out.label ? shortPeriod(f.out.label) + ' results' : 'Results';
  return el('span', {className: 'sub out', title: `${what} out ${when}; figures not on file yet`},
    docLink(f.out.url, `${f.out.period ?? 'Results'} out ${when}`));
}

// The next results date linked to its source: "29 Oct ↗", or "29 Oct (est.) ↗" with "(est.) ↗"
// in one span that the tight table drops under the date (C7); plain text without a safe URL.
function nextDate(next, year) {
  const node = link(next.url, fmtDayIn(next.date, year));
  const linked = node.nodeType === Node.ELEMENT_NODE;
  const arrow = linked ? docArrow() : null;
  if (next.confirmed) {
    if (arrow) node.append(arrow);
    return node;
  }
  const est = el('span', {className: 'est'}, '(est.)', arrow);
  if (!linked) return el('span', {}, node, ' ', est);
  node.append(' ', est);
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

// E3: the profit a margin is measured on: margin_metric without its trailing " margin", with
// " profit" added where it would end in "operating" ("operating margin" -> "operating profit",
// "adjusted EBITA margin" -> "adjusted EBITA").
function marginBasis(metric) {
  const basis = metric.replace(/ margin$/i, '');
  return /\boperating$/i.test(basis) ? basis + ' profit' : basis;
}

// "17.4%" and "H1 26 ↗, operating profit", with the stored wording as the title.
function marginParts(f) {
  if (!f.margin) return {nodes: [dashFor(DASH_WHY.margin)], title: null};
  const metric = f.margin.metric;
  return {
    nodes: [el('span', {className: 'fig2'}, plainPct(f.margin.value)),
      subLine(periodLink(f.name, f.margin, 'margin'), metric ? ', ' + marginBasis(metric) : null)],
    title: metric ? `${capitalize(metric)}, ${String(f.margin.period).replace(/_/g, ' ')}` : null,
  };
}

// The Top line or Profit value with its ↗ (E3: no status line).
function guidanceParts(f, slot, year) {
  if (!f.guidance.onFile && slot === 'topLine') {
    return [el('span', {className: 'muted'}, 'No guidance on file')];
  }
  const s = f.guidance[slot];
  return s ? [guidanceValue(f.name, s, year)] : [dashFor(DASH_WHY.record)];
}

// J2: a share move read like the Change column, through glyphSigned: "▲ +13.8%" in --up,
// "▼ −1.1%" in --down, and "0.0%" with no glyph in --ink-2 for a figure that rounds to zero (the
// color comes from the rounded figure too). The glyph is hidden: a screen reader hears "+13.8%".
function shareFigure(p) {
  const r = Number(p.toFixed(1));
  const parts = glyphSigned(p).split(/\s/);
  return el('span', {className: r > 0 ? 'up' : r < 0 ? 'down' : 'flat'},
    parts.length > 1 ? el('span', {'aria-hidden': 'true'}, parts[0] + ' ') : null,
    parts[parts.length - 1] + '%');
}

function ytdParts(f) {
  return isNum(f.ytd) ? el('span', {className: 'fig3'}, shareFigure(f.ytd))
    : dashFor(DASH_WHY.ytd);
}

// The two-day move on results, "pending" or a dash; each layout places f.move.period itself.
function moveParts(f) {
  const mv = f.move;
  if (mv.state === 'done') {
    return {node: el('span', {className: 'fig3'}, shareFigure(mv.value)), title: MOVE_TITLE};
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

// One table row: the company name as the row header (E2's marker under it), then a cell per
// column, each figure beside its guidance (E3).
function peerRow(f, year) {
  const td = (className, ...content) => el('td', {className}, ...content);
  const m = marginParts(f);
  const mv = moveParts(f);
  const nx = nextParts(f, year);
  // J1: "H1 · 2 days" under a figure or "pending" ("2 days" with no period); under a dash, the
  // period only.
  const moveSub = ['done', 'pending'].includes(f.move.state)
    ? [f.move.period, MOVE_DAYS].filter(Boolean).join(' · ') : f.move.period;
  return el('tr', {}, el('th', {scope: 'row'}, f.name, outParts(f, year)),
    td('num growth', ...growthParts(f)),
    el('td', {className: 'num change', title: changeTitle(f.change)}, ...changeParts(f)),
    td('guid g-top', ...guidanceParts(f, 'topLine', year)),
    el('td', {className: 'num margin', title: m.title}, ...m.nodes),
    td('guid g-profit', ...guidanceParts(f, 'profit', year)),
    td('num', ytdParts(f)),
    el('td', {className: 'num move', title: mv.title}, mv.node, moveSub ? subLine(moveSub) : null),
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
    outParts(f, year),
    el('dl', {},
      ...pair(['Organic growth'], el('dd', {className: 'figs'}, ...growthParts(f), change)),
      ...pair([spoken('Top line '), 'Guidance'],
        el('dd', {}, ...guidanceParts(f, 'topLine', year))),
      ...pair(['Margin'], el('dd', {className: 'figs', title: m.title}, ...m.nodes)),
      ...pair([spoken('Profit '), 'Guidance'],
        el('dd', {className: 'clamp3'}, ...guidanceParts(f, 'profit', year))),
      // J1: "YTD ▲ +13.8% · on Q3 results ▲ +1.3% (2 days)". The move pair drops to the next line
      // whole, its "·" clipped at the left edge as in What’s new; "(2 days)" goes under its figure
      // only where the pair is wider than the column.
      ...pair(['Share price'], el('dd', {className: 'share'},
        el('span', {className: 'nowrap'}, 'YTD ', ytdParts(f)),
        el('span', {className: 'move-pair', title: mv.title},
          el('span', {className: 'c-sep', 'aria-hidden': 'true'}, '·'),
          el('span', {className: 'nowrap'},
            `on ${f.move.period ? f.move.period + ' ' : ''}results `, mv.node),
          f.move.state === 'done' ? ` (${MOVE_DAYS})` : null))),
      ...pair(['Next results'], el('dd', {className: 'next'},
        nx.period ? nx.period + ', ' : null, nx.date, nx.today ? ' ' : null, nx.today))));
}

// L2: "Key takeaway:" at 600, then the sentence; set only when its text changes, so the chart's
// live region never re-announces the same words. Hidden, and emptied, with nothing to name.
function setTakeaway(node, parts) {
  if (!node) return;
  if (!parts) {
    node.replaceChildren();
    node.hidden = true;
    return;
  }
  const all = [el('strong', {}, 'Key takeaway:'), ' ', ...parts];
  const text = all.map((p) => (typeof p === 'string' ? p : p.textContent)).join('');
  if (node.textContent !== text) node.replaceChildren(...all);
  node.hidden = false;
}

// L2, the table's Key takeaway (C4's lead, trail, tie and period rules): who grows fastest and
// slowest among the given companies with a growth figure, each with its own period ("(Q3)";
// "(Q4 25)" outside this year), then how many are speeding up, slowing or steady by their Change
// as shown (rounded as glyphSigned rounds; no change figure, not counted). One figure: that
// company's growth and its change. Figures in <strong>; null with no figure.
function tableTakeaway(facts, year) {
  const withFigure = facts.filter((f) => f.growth);
  if (!withFigure.length) return null;
  const when = (f) => {
    const p = String(f.growth.period);
    return p.endsWith(' ' + year) ? p.split(' ')[0] : shortPeriod(p);
  };
  const shown = (d) => Number(d.toFixed(1));
  if (withFigure.length === 1) {
    // "WPP’s organic growth is −2.8% (Q2), up 3.9 points vs Q1 26."; the words come from the
    // rounded change, as the table shows it.
    const f = withFigure[0];
    const head = [`${f.name}’s organic growth is `, el('strong', {}, kpiText(f.growth.value)),
      `${NBSP}(${when(f)})`];
    if (f.change.delta === null) return [...head, '.'];
    const r = shown(f.change.delta);
    const base = changeBase(f.change);
    return [...head, ', ', ...(r === 0 ? [`unchanged ${base}`]
      : [`${r > 0 ? 'up' : 'down'} `, el('strong', {}, `${Math.abs(r).toFixed(1)} points`),
        ` ${base}`]), '.'];
  }
  let lead = withFigure[0];
  for (const f of withFigure) if (f.growth.value > lead.growth.value) lead = f;
  const rest = withFigure.filter((f) => f !== lead);
  let trail = rest[0];
  for (const f of rest) if (f.growth.value < trail.growth.value) trail = f;
  const part = (f, words) => [`${f.name} ${words} at `, el('strong', {}, kpiText(f.growth.value)),
    `${NBSP}(${when(f)})`];
  const [leadWords, trailWords] = lead.growth.value < 0 ? ['shrinks least', 'shrinks most']
    : ['grows fastest', trail.growth.value < 0 ? 'is shrinking' : 'grows slowest'];
  // "growth is speeding up at 3 companies, slowing at 1 and steady at 1"; a part with no company
  // is left out, and with no change figure at all the second half goes.
  const changes = facts.filter((f) => f.change.delta !== null).map((f) => shown(f.change.delta));
  const pace = [['speeding up', changes.filter((r) => r > 0).length],
    ['slowing', changes.filter((r) => r < 0).length],
    ['steady', changes.filter((r) => r === 0).length]].filter(([, n]) => n)
    .map(([words, n], i) => `${words} at ${n}`
      + (i ? '' : NBSP + (n === 1 ? 'company' : 'companies')));
  const second = pace.length > 1
    ? `${pace.slice(0, -1).join(', ')} and ${pace[pace.length - 1]}` : pace[0];
  return [...part(lead, leadWords), ' and ', ...part(trail, trailWords),
    second ? `; growth is ${second}.` : '.'];
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

// E3: [group label, its columns as [name, numeric] (none: one column spanning both header rows,
// numeric as the third item says)]. Each figure sits beside its guidance.
const TABLE_GROUPS = [['Company', null, false],
  ['Top line', [['Organic growth', true], ['Change', true], ['Guidance', false]]],
  ['Profit', [['Margin', true], ['Guidance', false]]],
  ['Share price', [['YTD', true], ['On results', true]]],
  ['Next results', null, true]];

// One <colgroup> per group (they carry the vertical rules), then two header rows: the group
// labels, with Company and Next results spanning both, then the column names. A label over two or
// more columns sits at its group's left edge (J5); Company and Next results, single columns, sit
// like their figures.
function tableHead() {
  const num = (on, extra) => [on ? 'num' : null, extra].filter(Boolean).join(' ') || null;
  const groups = el('tr', {className: 'groups'}, ...TABLE_GROUPS.map(([label, cols, numeric]) => (
    cols ? el('th', {scope: 'colgroup', colspan: cols.length, className: 'group'}, label)
      : el('th', {scope: 'col', rowspan: 2, className: num(numeric, 'group')}, label))));
  const names = el('tr', {}, ...TABLE_GROUPS.flatMap(([, cols]) => (cols || [])
    .map(([name, numeric]) => el('th', {scope: 'col', className: num(numeric)}, name))));
  return [...TABLE_GROUPS.map(([, cols]) => el('colgroup', {span: cols ? cols.length : 1})),
    el('thead', {}, groups, names)];
}

// C1: one row per shown company in companies.json order, then the Key takeaway (L2) and the foot
// line (C5); at 960px and below the same companies as blocks (D1). Print shows all six, always as
// the table.
function renderTable(ctx, data) {
  const panel = 'panel-comps';
  redrawTable = null;
  if (!ctx.list.length) return empty(panel, 'Company list unavailable.');

  const year = Number(ctx.today.slice(0, 4));
  const items = Array.isArray(data.events?.items) ? data.events.items : [];
  const kpisOk = Array.isArray(data.kpis?.rows);
  const kpiRows = (kpisOk ? data.kpis.rows : []).filter((r) => r && typeof r.company === 'string');
  const src = {
    year,
    today: ctx.today,
    kpisOk,
    kpiRows,
    guidance: currentGuidance(data.guidance),
    results: items.filter((e) => e && e.type === 'results' && isIsoDate(e.date)
      && e.date.slice(0, 10) <= ctx.today),
    // E2: results events in E1's window with their KPI rows.
    brief: briefResults(items, kpiRows, kpisOk, ctx.today),
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
  // L2: under the rows (on phones under the last block), above the foot line.
  const takeaway = el('p', {className: 'takeaway'});
  takeaway.hidden = true;
  // E3: "All guidance" opens the guidance fold; both jumps stay off paper.
  bodyOf(panel).replaceChildren(wrap, blockList, takeaway,
    el('p', {className: 'comps-foot'}, 'Latest reported figures, as stated. Growth and margin as '
      + 'each company defines them. ', el('span', {className: 'comps-jumps'}, defs, ' · ',
      guidanceJump('All guidance'))));
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
    setTakeaway(takeaway, tableTakeaway(shown.map((c) => facts.get(c)), year));
    if (!hadFocus) return;
    // A link whose row or block stays keeps focus; one whose company left hands it to the capsule.
    if (had.isConnected) had.focus();
    else focusFilter();
  }

  draw([...selected]);
  redrawTable = () => draw([...selected]);
  // Paper shows every company's row and their takeaway (D6).
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

// D4: one grid cell: the name (the theme, for one company) and the age | the quote in the serif,
// never cut short | speaker · source · dated link.
function quoteCell(label, r, today) {
  const speaker = speakerOf(r);
  return el('li', {className: 'q-cell'},
    el('div', {className: 'q-who'}, el('span', {className: 'q-name'}, label),
      el('span', {className: 'q-age'}, ageText(r.release_date, today))),
    el('blockquote', {className: 'q-quote'}, '“' + r.quote.trim() + '”'),
    el('p', {className: 'q-attr'}, speaker ? speaker + ' · ' : null,
      sourceLabel(r.source_type), ' · ', docLink(r.source_url, fmtDate(r.release_date))));
}

// Quotes only: the curator's headlines in commentary.json are never shown on the site. A fold
// (F1) whose summary is its title; the theme track sits in its body, "Verbatim from company
// documents" closes it (L1).
function renderQuotes(ctx, data) {
  const panel = 'panel-quotes';
  const fold = document.getElementById(panel);
  const themes = fold.querySelector('.q-themes');
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

  const list = el('ul', {className: 'q-grid'});
  const gapLine = el('p', {className: 'q-missing'});
  // L1: the fold's last line while it shows quotes. Paper names the pressed theme first ("AI & data
  // · "), since the theme track does not print (D6: the printed quotes name their theme).
  const printTheme = el('span', {className: 'q-print-theme'});
  const verbatim = el('p', {className: 'q-verbatim'}, printTheme,
    'Verbatim from company documents');
  const ofCompany = (code) => records.filter((r) => r.company === code);

  // Several companies: a cell for each one quoted on the pressed theme, the rest named in one line.
  // One company (Q4): a cell per theme with a quote, and the themes without one in one line.
  function draw(codes) {
    const hadFocus = list.contains(document.activeElement);
    const shown = allCodes(ctx).filter((c) => codes.includes(c));
    const single = shown.length === 1;
    const themeLabel = QUOTE_TABS.find(([t]) => t === theme)[1];
    const cells = [];
    const gaps = [];
    if (single) {
      const mine = ofCompany(shown[0]);
      for (const [t, label] of QUOTE_THEMES) {
        const r = pickQuote(mine, t, ctx.today);
        if (r) cells.push(quoteCell(label, r, ctx.today));
        else gaps.push(label);
      }
      gapLine.textContent = gaps.length ? 'No quote yet on: ' + gaps.join(', ') : '';
    } else {
      for (const code of shown) {
        const r = pickQuote(ofCompany(code), theme, ctx.today);
        if (r) cells.push(quoteCell(companyName(ctx, code), r, ctx.today));
        else gaps.push(companyName(ctx, code));
      }
      gapLine.textContent = gaps.length ? `No ${themeLabel} quote yet: ` + gaps.join(', ') : '';
    }
    list.replaceChildren(...cells);
    list.hidden = !cells.length;
    gapLine.hidden = !gaps.length;
    printTheme.textContent = single ? '' : themeLabel + ' · ';
    verbatim.hidden = !cells.length;
    // A track about to hide hands its focus to the fold's summary (one company, e.g. after print).
    if (single && themes.contains(document.activeElement)) fold.querySelector('summary').focus();
    themes.hidden = single;
    // Never leave keyboard focus on a link that was just replaced.
    if (hadFocus) {
      (single ? fold.querySelector('summary')
        : buttons.find((b) => b.getAttribute('aria-pressed') === 'true'))?.focus();
    }
  }

  bodyOf(panel).replaceChildren(list, gapLine, verbatim);
  draw([...selected]);
  redrawQuotes = () => draw([...selected]);
  // Paper shows the pressed theme for all six companies; the last line names the theme.
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

// At 720px and below the x axis keeps at most 4 ticks. Screen only, like every breakpoint
// (DESIGN.md section 2): paper never takes the phone layout.
const NARROW = window.matchMedia('screen and (max-width: 720px)');
// D6: the printed plot. A4's content width (210mm less two 12mm margins: 186mm, 703px) less the
// panel's 1px borders and 12px print padding; Letter's 725px line holds it too.
const PRINT_CHART = {width: 677, height: 260};
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
// end with a 1px leader in the company color. The spacing runs on whole pixel rows, so rounding
// never brings two codes closer than 12px (a rounded offset cost 1px; 20d).
function endLabelAnnotations(ymin, ymax, h) {
  const perPx = (ymax - ymin) / Math.max(h, 1);
  // A value's pixel row, down from the plot's top.
  const rowOf = (y) => (perPx > 0 ? (ymax - y) / perPx : 0);
  const sorted = [...endLabels].sort((a, b) => a.y - b.y);
  const rows = sorted.map((l) => Math.round(rowOf(l.y)));
  // Bottom to top, each code 12 rows above the one below it, none above the plot's top.
  for (let i = 1; i < rows.length; i++) {
    rows[i] = Math.min(rows[i], rows[i - 1] - END_LABEL_GAP_PX);
  }
  if (rows.length) rows[rows.length - 1] = Math.max(rows[rows.length - 1], 0);
  for (let i = rows.length - 2; i >= 0; i--) {
    rows[i] = Math.max(rows[i], rows[i + 1] + END_LABEL_GAP_PX);
  }
  return sorted.map((l, i) => {
    const label = {x: l.x, xref: 'x', yref: 'y', text: escapeHtml(l.code), xanchor: 'left',
      yanchor: 'middle', font: {color: INK, size: 12}};
    // A quarter pixel into the code's row: Plotly's float sums land a hair short of a whole row
    // (238.998), and text snaps down onto the row above.
    const at = rows[i] + 0.25;
    // The exact offset from the line's end to that place in pixels; up the screen is negative.
    const ay = perPx > 0 ? at - rowOf(l.y) : 0;
    if (Math.abs(ay) < LEADER_MIN_PX) {
      return {...label, y: perPx > 0 ? ymax - at * perPx : l.y, showarrow: false, xshift: 16};
    }
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

// L2: the window's words opening the chart's Key takeaway.
const WINDOW_WORDS = {'1M': 'Over the past month', '3M': 'Over the past three months',
  YTD: 'Year to date', '1Y': 'Over the past year', '2Y': 'Over the past two years'};

// L2, the chart's Key takeaway: the leader and the laggard among the drawn lines, then how many are
// ahead of the benchmark while its line shows. `ends` are [{name, r}] in companies.json order and
// `bench` the benchmark's figure or null, all rounded to one decimal as shown, so a sentence never
// contradicts its own figures (a tie goes to the first; level is not ahead). Null with no line.
function chartTakeaway(win, ends, benchName, bench) {
  if (!ends.length) return null;
  const fig = (r) => el('strong', {}, signedPct(r));
  const words = WINDOW_WORDS[win] ?? win;
  // The benchmark's name and its figure never split across lines ("the S&P 500 (+12.1%)").
  const benchPart = bench === null ? []
    : [`the ${String(benchName).replace(/ /g, NBSP)}${NBSP}(`, fig(bench), ')'];
  if (ends.length === 1) {
    // "Year to date, WPP is at +18.0%, ahead of the S&P 500 (+12.1%)."
    const [e] = ends;
    if (bench === null) return [`${words}, ${e.name} is at `, fig(e.r), '.'];
    const vs = e.r > bench ? 'ahead of' : e.r < bench ? 'behind' : 'level with';
    return [`${words}, ${e.name} is at `, fig(e.r), `, ${vs} `, ...benchPart, '.'];
  }
  let lead = ends[0];
  for (const e of ends) if (e.r > lead.r) lead = e;
  const rest = ends.filter((e) => e !== lead);
  let trail = rest[0];
  for (const e of rest) if (e.r < trail.r) trail = e;
  const [leadWords, trailWords] = ends.every((e) => e.r < 0) ? ['falls least', 'falls most']
    : ['leads', 'trails'];
  const out = [`${words}, ${lead.name} ${leadWords} at `, fig(lead.r),
    ` and ${trail.name} ${trailWords} at `, fig(trail.r)];
  if (bench !== null) {
    // "3 of 6 are", "1 of 6 is", "both are", "all six are", "none is" ahead of the benchmark.
    const n = ends.length;
    const k = ends.filter((e) => e.r > bench).length;
    const count = k === 0 ? 'none is' : k === n ? (n === 2 ? 'both are' : `all ${countWord(n)} are`)
      : `${k} of ${n} ${k === 1 ? 'is' : 'are'}`;
    out.push(`; ${count} ahead of `, ...benchPart);
  }
  return [...out, '.'];
}

// Draws the selection on screen; with `print` ({width, height}), the all-six chart for paper (D6):
// never a subset, so no event markers, and no phone rules, at that size.
function drawChart(ctx, data, aligned, win, print = null) {
  const {series, union, bench} = aligned;
  const start = windowStart(win, union);
  let b = union.findIndex((d) => d >= start);
  if (b < 0) b = 0;
  const x = union.slice(b);
  const showing = print ? new Set(allCodes(ctx)) : selected;
  const subset = showing.size < ctx.list.length;
  const narrow = !print && NARROW.matches;

  // B4: only the shown companies are drawn; the key is a key, and the capsule the control.
  const shownSeries = series.filter((s) => showing.has(s.company.code));
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
    && subset && showing.has(e.company));
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

  // L2: the Key takeaway reads the same rebased lines as the end codes, for the shown companies,
  // names in full at every width (raw strings, never the escaped Plotly names). No company with a
  // value in this window hides it, so the last window's words never stay up.
  const lastOf = (ys) => ys.findLast((v) => v !== null);
  const asShown = (v) => Number((v - 100).toFixed(1));
  const ends = shownSeries.map((s, i) => ({name: String(s.company.name ?? s.company.code),
    v: lastOf(companyTraces[i].y)})).filter((e) => isNum(e.v))
    .map((e) => ({name: e.name, r: asShown(e.v)}));
  const benchEnd = lastOf(benchY);
  setTakeaway(document.getElementById('chart-takeaway'), chartTakeaway(win, ends,
    bench?.name, bench && benchVisible && isNum(benchEnd) ? asShown(benchEnd) : null));

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
  const h = print ? print.height - 60 : gd._fullLayout?._size?.h || gd.clientHeight - 60;
  endAnnotations = endLabelAnnotations(lo - pad, hi + pad, h);

  // Section 7. No layout.height on screen: #chart's CSS height reaches Plotly through responsive
  // autosizing, so a breakpoint resizes the plot without a redraw; paper gets a fixed size. The
  // right margin is 72, not 64: a moved DENTSU code (16px out, then its text) measured 5px past 64.
  const sans = getComputedStyle(document.body).fontFamily;
  const layout = {
    ...(print ? {width: print.width, height: print.height} : {}),
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
      nticks: narrow ? 4 : 11, tickfont: {size: 12, color: '#4f5f74'}},
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
  // The takeaway empties too, so a hidden live region never keeps a stale sentence.
  setTakeaway(document.getElementById('chart-takeaway'), null);
  const key = document.getElementById('chart-key');
  if (key) key.hidden = true;
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
  // Leaving the phone width while printing must not put the screen chart back on paper.
  let printing = false;
  NARROW.addEventListener('change', () => {
    if (!printing) draw();
  });
  // D6: paper gets all six at a fixed size, drawn in beforeprint and labelled as its promise
  // settles, before the printed page is laid out (Plots.resize waits 100ms, too late for it).
  // Afterwards the screen chart comes back, and an autosize relayout returns its size at once:
  // Plotly.react keeps the last width and height when the layout gives none.
  window.addEventListener('beforeprint', () => {
    if (!redrawChart) return;
    printing = true;
    drawChart(ctx, data, aligned, win, PRINT_CHART).then(placeEndLabels)
      .catch((err) => console.warn('[holdco] print chart failed:', err));
  });
  window.addEventListener('afterprint', () => {
    printing = false;
    if (!redrawChart) return;
    draw().then(() => Plotly.relayout(gd, {autosize: true}))
      .catch((err) => console.warn('[holdco] chart resize failed:', err));
  });

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
      r.note ? ' · ' + String(r.note) : '', ' · ', docLink(r.source_url, 'source'));
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

  // The corner names the grid's figures; screen readers keep "Company" as the column's name.
  const head = el('tr', {}, el('th', {scope: 'col', className: 'kpi-corner'},
    el('span', {'aria-hidden': 'true'}, 'Organic growth'),
    el('span', {className: 'visually-hidden'}, 'Company')),
    el('th', {scope: 'col', className: 'kpi-delta-head',
      title: 'Latest quarter vs the quarter before'}, 'Q/Q change'));
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
    // L1: the footnote opens with what the grid holds; the title alone does not say it is organic
    // growth only.
    el('p', {className: 'footnote'}, `Organic growth, last ${KPI_COLUMNS} quarters, as reported `
      + 'by each company; definitions differ, so figures are not directly comparable. A half-year '
      + 'figure spans two quarters only where no quarterly figure is published. Colors saturate '
      + 'at ±' + KPI_CLAMP + '%.'),
    defList.childElementCount ? defList : null,
  ].filter(Boolean));
  // Newest quarter first on narrow screens. A closed <details> has no width to scroll, so the
  // grid scrolls to its right end each time Quarterly history opens (Q6).
  const fold = document.getElementById(panel);
  fold.addEventListener('toggle', () => {
    if (fold.open) wrap.scrollLeft = wrap.scrollWidth;
  });
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
      // The value at 400 with its figures bold (J4).
      el('span', {className: 'g-rec-value'}, ...guidanceText(value)),
      // The set date links to the source with its ↗ (J3); without a valid date the link reads
      // "source".
      el('span', {className: 'g-meta muted'}, statusBadge(s, statusLabel(s)), ' · ',
        docLink(r.source_url, isIsoDate(r.set_date) ? fmtDayIn(r.set_date, year) : 'source')),
      showQuote ? el('span', {className: 'g-quote'}, quote) : null);
  });
}

// Q6: G1's summary line, then every current record per company, following the selection.
function renderGuidanceFold(ctx, data) {
  const panel = 'fold-guidance';
  const fold = document.getElementById(panel);
  redrawGuidanceFold = null;
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

const PRESS_PHONE_CAP = 8; // D5: key rows a collapsed list shows at 720px and below

// A fold (F1) of the last 30 days' releases: date, code, category, title (D5). Its summary is its
// title (L1): "Show N other releases" carries the count, and the first row is the newest.
function renderPress(ctx, data) {
  const panel = 'panel-press';
  const fold = document.getElementById(panel);
  const all = Array.isArray(data.press?.items) ? data.press.items : [];
  const since = addDays(ctx.today, -30);
  // Newest first, the higher id breaking a tie; key items are pulled ahead in draw().
  const items = all.filter((p) => p && isIsoDate(p.published) && p.published.slice(0, 10) >= since)
    .sort((a, b) => b.published.localeCompare(a.published)
      || String(b.id ?? '').localeCompare(String(a.id ?? '')));
  redrawPress = null;
  resetPress = null;
  if (!items.length) return empty(panel, 'No press releases in the last 30 days.');
  // No company color: the code in ink, the category as a word in an outlined pill (key rows only).
  const rows = new Map(items.map((p) => [p,
    el('li', {className: isKeyPress(p) ? 'key' : 'rest'},
      el('span', {className: 'nowrap date'}, fmtDate(p.published)),
      el('span', {className: 'pr-co'}, String(p.company ?? '')),
      isKeyPress(p) ? el('span', {className: 'chip category'}, PRESS_KEY[p.category]) : null,
      el('span', {className: 'title'}, docLink(p.url, String(p.title ?? ''))))]));
  const release = (n) => (n === 1 ? 'release' : 'releases');

  const list = el('ul', {className: 'press', id: 'press-list'});
  const sub = el('li', {className: 'press-sub'}, 'Other releases');
  const none = el('p', {className: 'empty'});
  // Key items show; the button reveals the rest under "Other releases". A selection with no
  // key item shows every item and no button. Print shows every item for all six companies.
  const more = el('button', {type: 'button', className: 'show-more', 'aria-expanded': 'false',
    'aria-controls': 'press-list'});
  // D5: at 720px and below a collapsed list stops after 8 key rows; this pill (CSS shows it there
  // only, in place of the other one) shows the rest of them, and goes once it has.
  const capMore = el('button', {type: 'button', className: 'show-more show-cap',
    'aria-controls': 'press-list'});
  let extra = [];
  let over = []; // key rows past the phone cap
  const isOpen = () => more.getAttribute('aria-expanded') === 'true';
  const isCapped = () => list.classList.contains('capped');
  const setCapped = (on) => {
    list.classList.toggle('capped', on);
    capMore.hidden = !on;
    capMore.textContent = `Show ${over.length} more key ${release(over.length)}`;
  };
  const setOpen = (open) => {
    for (const li of extra) li.hidden = !open;
    sub.hidden = !open || !extra.length;
    more.setAttribute('aria-expanded', String(open));
    more.textContent = open ? 'Show fewer' : `Show ${extra.length} other ${release(extra.length)}`;
    setCapped(!open && over.length > 0);
  };
  // replaceChildren blurs a focused row even when it stays, so focus goes back to it, else to a
  // button, else to the first shown link. Shown means laid out: CSS hides the capped rows.
  const shown = (node) => node.isConnected && node.getClientRects().length > 0;
  const keepFocus = (change) => {
    const had = document.activeElement;
    const inside = had && (list.contains(had) || had === more || had === capMore);
    change();
    if (!inside) return;
    ([had, capMore, more].find(shown) || [...list.querySelectorAll('a')].find(shown))?.focus();
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
      over = key.length ? shownRows.slice(PRESS_PHONE_CAP) : [];
      for (const li of shownRows) {
        li.hidden = false;
        li.classList.toggle('over-cap', over.includes(li));
      }
      list.replaceChildren(...shownRows, ...(extra.length ? [sub, ...extra] : []));
      list.hidden = !mine.length;
      none.hidden = mine.length > 0;
      none.textContent = mine.length ? '' : 'No press releases from '
        + (want.size === 1 ? companyName(ctx, [...want][0]) : 'the selected companies')
        + ' in the last 30 days.';
      more.hidden = !extra.length;
      setOpen(open);
    });
  }

  // Closing shrinks the list; bring the button back so the reader isn't left further down.
  // Esc scrolls only when the button has gone up under the pinned filter band (or off the top),
  // so the page never jumps; a closed fold has nothing to scroll to.
  const collapse = (fromEsc) => {
    keepFocus(() => setOpen(false));
    const btn = [more, capMore].find(shown);
    if (!fold.open || !btn) return;
    const covered = document.getElementById('filter')?.getBoundingClientRect().bottom ?? 0;
    if (!fromEsc || btn.getBoundingClientRect().top < covered) {
      btn.scrollIntoView({block: 'nearest'});
    }
  };
  more.addEventListener('click', () => {
    if (isOpen()) collapse(false);
    else setOpen(true);
  });
  // The rest of the key rows; "Show N other releases" then takes over. Focus moves to the first
  // row it showed, else (a release with no safe link) to that pill.
  capMore.addEventListener('click', () => {
    setCapped(false);
    [over[0]?.querySelector('a'), more].find((n) => n && shown(n))?.focus();
  });
  // Same guard as openForPrint: a second beforeprint before afterprint keeps the first state, and
  // a lifted phone cap stays lifted.
  let wasOpen = null;
  let wasCapped = null;
  window.addEventListener('beforeprint', () => {
    if (!redrawPress) return;
    if (wasOpen === null) {
      wasOpen = isOpen();
      wasCapped = isCapped();
    }
    draw(allCodes(ctx), true);
  });
  window.addEventListener('afterprint', () => {
    if (!redrawPress) return;
    draw([...selected], wasOpen === true);
    if (wasCapped === false) setCapped(false);
    wasOpen = null;
    wasCapped = null;
  });
  bodyOf(panel).replaceChildren(list, none, capMore, more);
  draw([...selected], false);
  redrawPress = () => draw([...selected], false);
  // Esc collapses an open list, and puts back a lifted phone cap.
  resetPress = () => {
    if (isOpen() || (over.length && !isCapped())) collapse(true);
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
    el('li', {}, 'Last run: ' + fmtTimestamp(st.run_at)),
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

// ---------- The header's freshness note (step 21) ----------

// Weekdays d with from < d <= to (ISO dates).
function weekdaysAfter(from, to) {
  let n = 0;
  for (let d = dayNum(from) + 1; d <= dayNum(to); d++) {
    const wd = new Date(d * DAY_MS).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

// The newest curation: press_releases.json's last_curate_at or any curated_at in
// commentary.json, since a document run adds quotes without moving last_curate_at (the rule
// mcp_server's _commentary_as_of uses). The string as stored, or null.
function curatedAt(press, commentary) {
  const stamps = [press?.last_curate_at];
  for (const key of ['records', 'headlines']) {
    const list = commentary?.[key];
    if (Array.isArray(list)) for (const r of list) stamps.push(r?.curated_at);
  }
  let best = null;
  for (const s of stamps) {
    const t = typeof s === 'string' ? Date.parse(s) : NaN;
    if (!Number.isNaN(t) && (!best || t > best.t)) best = {s, t};
  }
  return best ? best.s : null;
}

// "Closing prices to 27 Oct 2026." from the newest company close (the pipeline never takes the
// day's own close), then any company two or more weekdays behind it ("Dentsu last closed
// 24 Oct."; YTD and the chart keep using that close), then "Curated 26 Oct 2026, 17:07 UTC.".
// The header is not under the capsule, so this covers every company whatever the selection.
function renderFreshness(ctx, data) {
  const lasts = [];
  for (const c of ctx.list) {
    const pts = nonNullPoints(data.prices?.series?.[c.ticker]);
    if (pts.length) lasts.push({code: c.code, last: pts[pts.length - 1][0]});
  }
  const newest = lasts.reduce((m, x) => (x.last > m ? x.last : m), '');
  document.getElementById('fresh-prices').textContent = newest
    ? `Closing prices to ${fmtDate(newest)}.` : 'Closing prices: unknown.';

  // Companies behind by the same date share one clause; the oldest date comes first.
  const behind = new Map();
  for (const x of lasts) {
    if (weekdaysAfter(x.last, newest) < 2) continue;
    if (!behind.has(x.last)) behind.set(x.last, []);
    behind.get(x.last).push(companyName(ctx, x.code));
  }
  const clauses = [...behind].sort(([a], [b]) => a.localeCompare(b)).map(([date, names]) => {
    const who = names.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    return `${who} last closed ${fmtDayIn(date, newest.slice(0, 4))}`;
  });
  const stale = document.getElementById('fresh-stale');
  stale.textContent = clauses.length ? clauses.join('; ') + '.' : '';
  stale.hidden = !clauses.length;

  document.getElementById('fresh-curated').textContent =
    'Curated ' + fmtTimestamp(curatedAt(data.press, data.commentary)) + '.';
}

// ---------- main ----------

// A panel that failed: its controls hide and its body shows one grey sentence.
function failPanel(panelId) {
  if (panelId === 'panel-chart') hideChartControls();
  if (panelId === 'panel-quotes') {
    const themes = document.querySelector('#panel-quotes .q-themes');
    if (themes) themes.hidden = true;
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

  // The freshness note never stops the page; a failure reads "unknown".
  try {
    renderFreshness(ctx, data);
  } catch (err) {
    console.warn('[holdco] freshness note failed:', err);
    document.getElementById('fresh-prices').textContent = 'Closing prices: unknown.';
    document.getElementById('fresh-stale').hidden = true;
    document.getElementById('fresh-curated').textContent = 'Curated unknown.';
  }
  // The footnote names the same benchmark as the chart's key and Key takeaway; the static text is
  // a fallback.
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
  // All four folds print open and return to their screen state afterwards (D6). A link to a fold
  // or into one (#fold-guidance, or the table's #definitions, opened in a new tab) opens it.
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
