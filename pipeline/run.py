"""Daily pipeline: run every collector, tolerate failures, write docs/data/*.json and status.
Run: python -m pipeline.run"""

import datetime
import importlib.util
import json
import os
import sys
import tempfile
import time
from pathlib import Path

from core.calendar import find_candidates, get_calendar, scan_press_releases
from core.config import load_watchlist
from core.events import get_events
from core.guidance import get_guidance
from core.kpis import get_kpi_definitions, get_kpis
from core.press_releases import get_press_releases
from core.prices import append_latest, fetch_latest_closes
from core.status import get_status, record
from core.util import now_iso
from pipeline.backfill import write_json_atomic

RETENTION_DAYS = 180
NEW_WINDOW_DAYS = 30  # flagged items this recent count as new when never curated
UPCOMING_DAYS = 90


def _step(status: dict, prev_sources: dict, source: str, fn) -> object:
    """Run fn() (returns (items, result)); record ok/FAIL in status; return result or None."""
    start = time.monotonic()
    status.setdefault("sources", {})[source] = {
        "last_ok": (prev_sources.get(source) or {}).get("last_ok")
    }
    try:
        items, result = fn()
        ok, error = True, None
    except Exception as exc:  # noqa: BLE001 - one source must never take the run down
        items, result = 0, None
        ok, error = False, f"{type(exc).__name__}: {exc}"
    ms = int((time.monotonic() - start) * 1000)
    record(status, source, ok=ok, items=items, ms=ms, error=error)
    print(f"[pipeline] {source} {'ok' if ok else 'FAIL'} {items} items {ms}ms")
    if error:
        print(f"[pipeline] {source} error: {error[:300]}")
    return result


def _press(code: str) -> tuple[int, list[dict]]:
    items = get_press_releases(code)
    return len(items), items


def _calendar(code: str) -> tuple[int, list[dict]]:
    events = get_calendar(code)
    return len(events), events


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def _append_line_atomic(path: Path, line: str) -> None:
    """Append one line to a text file by rewriting it via a temp file and os.replace."""
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    if existing and not existing.endswith("\n"):
        existing += "\n"
    with tempfile.NamedTemporaryFile(
        "w", dir=path.parent, suffix=".tmp", delete=False, encoding="utf-8"
    ) as f:
        f.write(existing + line + "\n")
        tmp = f.name
    os.replace(tmp, path)


def merge_press_releases(
    previous: list[dict], fresh: list[dict], today: datetime.date
) -> list[dict]:
    """Merge items by id (fresh wins), keep the last RETENTION_DAYS, newest first."""
    cutoff = (today - datetime.timedelta(days=RETENTION_DAYS)).isoformat()
    by_id = {item["id"]: item for item in previous}
    by_id.update({item["id"]: item for item in fresh})
    kept = [item for item in by_id.values() if item["published"] >= cutoff]
    kept.sort(key=lambda i: (i["published"], i["id"]), reverse=True)
    return kept


def new_since(items: list[dict], last_curate_at: str | None, today: datetime.date) -> list[str]:
    """Ids of flagged items published after last_curate_at (or in the last 30 days if null)."""
    if last_curate_at:
        return [i["id"] for i in items if i["flagged"] and i["published"] > last_curate_at[:10]]
    cutoff = (today - datetime.timedelta(days=NEW_WINDOW_DAYS)).isoformat()
    return [i["id"] for i in items if i["flagged"] and i["published"] >= cutoff]


def main(root: Path = Path(".")) -> int:
    """Run every source in order, write docs/data/*.json, status.json and runs.jsonl; return 0."""
    started = time.monotonic()
    run_at = now_iso()
    today = datetime.datetime.now(datetime.UTC).date()
    out = root / "docs" / "data"
    out.mkdir(parents=True, exist_ok=True)
    data = root / "data"
    prev_sources = get_status(path=out / "status.json").get("sources") or {}
    status: dict = {"sources": {}}
    watchlist = load_watchlist(str(root / "config" / "watchlist.yaml"))
    companies = watchlist["companies"]

    def companies_step():
        keys = ["code", "name", "ticker", "exchange", "currency", "color"]
        rows = [{k: c[k] for k in keys} for c in companies]
        payload = {"as_of": run_at, "companies": rows}
        bench = watchlist["dashboard"].get("benchmark")
        if bench:
            payload["benchmark"] = {"symbol": bench["symbol"], "name": bench["name"]}
        write_json_atomic(out / "companies.json", payload)
        return len(rows), None

    def prices_step():
        prices = _read_json(out / "prices.json")
        if not prices:
            raise FileNotFoundError("docs/data/prices.json missing; run make backfill")
        codes = [c["code"] for c in companies]
        latest = fetch_latest_closes(codes, watchlist["dashboard"].get("fx_pairs", []))
        updated = append_latest(prices, latest, today.isoformat(), watchlist)
        write_json_atomic(out / "prices.json", updated)
        if not latest:
            raise RuntimeError("no closes returned")
        return len(latest), None

    _step(status, prev_sources, "companies", companies_step)
    _step(status, prev_sources, "prices", prices_step)

    fresh = []
    failed: set[tuple[str, str]] = set()  # (company, "press_release" | "calendar")
    for company in companies:
        code = company["code"]
        adapter = company["press_releases"]["adapter"]
        source = f"press_releases:{code}"
        if importlib.util.find_spec(f"core.adapters.{adapter}") is None:
            print(f"[pipeline] {source} skip (no adapter)")
            continue
        result = _step(status, prev_sources, source, lambda c=code: _press(c))
        if result is None:
            failed.add((code, "press_release"))
        fresh.extend(result or [])

    flagged_new: list[str] = []
    press_count = 0
    scan_items = fresh
    try:
        last_curate_at = _read_json(data / "curate_state.json").get("last_curate_at")
        previous = _read_json(out / "press_releases.json").get("items") or []
        merged = merge_press_releases(previous, fresh, today)
        flagged_new = new_since(merged, last_curate_at, today)
        press_count = len(merged)
        scan_items = merged
        write_json_atomic(
            out / "press_releases.json",
            {
                "as_of": run_at,
                "last_curate_at": last_curate_at,
                "new_since_last_curate": flagged_new,
                "items": merged,
            },
        )
    except Exception as exc:  # noqa: BLE001 - a bad previous file must not stop the run
        print(f"[pipeline] press_releases merge FAIL: {type(exc).__name__}: {exc}"[:300])

    upcoming = 0

    def events_step():
        nonlocal upcoming
        items = get_events(past_days=730, future_days=365, path=data / "events.yaml")
        end = (today + datetime.timedelta(days=UPCOMING_DAYS)).isoformat()
        upcoming = sum(1 for e in items if today.isoformat() <= e["date"] <= end)
        write_json_atomic(out / "events.json", {"as_of": run_at, "items": items})
        return len(items), None

    def guidance_step():
        records = get_guidance(current_only=False, path=data / "guidance.json")
        write_json_atomic(out / "guidance.json", {"as_of": run_at, "records": records})
        return len(records), records

    def kpis_step():
        path = data / "kpis.yaml"
        payload = {
            "as_of": run_at,
            "definitions": get_kpi_definitions(path=path),
            "rows": get_kpis(path=path, quarters=None),
        }
        write_json_atomic(out / "kpis.json", payload)
        return len(payload["rows"]), None

    _step(status, prev_sources, "events", events_step)

    calendar_found: list[dict] = []
    for company in companies:
        if not company.get("calendar"):
            continue
        code = company["code"]
        result = _step(status, prev_sources, f"calendar:{code}", lambda c=code: _calendar(c))
        if result is None:
            failed.add((code, "calendar"))
        calendar_found.extend(result or [])

    try:
        previous = _read_json(out / "event_candidates.json").get("items") or []
        # a failed fetch keeps that collector's previous candidates; find_candidates re-checks them
        carried = [
            c
            for c in previous
            if (c["company"], "press_release" if c["source"] == "press_release" else "calendar")
            in failed
        ]
        candidates = find_candidates(
            calendar_found + carried,
            scan_press_releases(scan_items),
            get_events(past_days=36500, future_days=36500, path=data / "events.yaml"),
            today.isoformat(),
        )
        seen = {c["id"] for c in previous}
        new_ids = [c["id"] for c in candidates if c["id"] not in seen]
        write_json_atomic(
            out / "event_candidates.json",
            {"as_of": run_at, "items": candidates, "new_ids": new_ids},
        )
        print(f"[pipeline] event_candidates {len(candidates)} items, {len(new_ids)} new")
    except Exception as exc:  # noqa: BLE001 - a bad previous file must not stop the run
        print(f"[pipeline] event_candidates FAIL: {type(exc).__name__}: {exc}"[:300])
    records = _step(status, prev_sources, "guidance", guidance_step) or []
    _step(status, prev_sources, "kpis", kpis_step)

    curated = [r["curated_at"] for r in records if r.get("curated_at")]
    guidance_age_days = None
    if curated:
        newest = datetime.datetime.fromisoformat(max(curated))
        guidance_age_days = (datetime.datetime.now(datetime.UTC) - newest).days

    sources = status["sources"]
    sources_ok = sum(1 for s in sources.values() if s["ok"])
    runtime_ms = int((time.monotonic() - started) * 1000)
    status_doc = {
        "run_at": run_at,
        "runtime_ms": runtime_ms,
        "run_id": os.environ.get("GITHUB_RUN_ID") or None,
        "sources": sources,
        "guidance_age_days": guidance_age_days,
        "counts": {
            "companies": len(companies),
            "sources_total": len(sources),
            "sources_ok": sources_ok,
            "press_releases": press_count,
            "flagged_new": len(flagged_new),
            "news": 0,
            "events_upcoming": upcoming,
        },
    }
    write_json_atomic(out / "status.json", status_doc)
    run_line = {
        "run_at": run_at,
        "runtime_ms": runtime_ms,
        "sources_ok": sources_ok,
        "sources_total": len(sources),
        "flagged_new": len(flagged_new),
    }
    _append_line_atomic(out / "runs.jsonl", json.dumps(run_line))
    print(f"[pipeline] done {sources_ok}/{len(sources)} sources ok {runtime_ms}ms")
    return 0


if __name__ == "__main__":
    sys.exit(main())
