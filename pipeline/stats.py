"""Print a short Markdown report of run and coverage numbers, computed from docs/data/runs.jsonl,
the bot's status.json history and git log; "n/a" where an input is missing, never an estimate.
Run: python -m pipeline.stats"""

import datetime
import json
import math
import re
import statistics
import subprocess
import sys
from pathlib import Path

from core.config import load_watchlist

HISTORY_LIMIT = 365
STATUS_PATH = "docs/data/status.json"
NA = "n/a"
FEED_WORDS = {"press_releases": "press releases", "calendar": "results calendar"}


def read_runs(text: str) -> list[dict]:
    """Return the runs in a runs.jsonl text; blank or unreadable lines are skipped."""
    runs = []
    for line in text.splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict):
            runs.append(row)
    return runs


def run_numbers(runs: list[dict]) -> dict:
    """Return the run count, median and nearest-rank p95 runtime in seconds (None without
    runtimes) and how many runs had every source ok, of those that say."""
    secs = sorted(
        r["runtime_ms"] / 1000 for r in runs if isinstance(r.get("runtime_ms"), (int, float))
    )
    judged = [
        r for r in runs
        if isinstance(r.get("sources_ok"), int) and isinstance(r.get("sources_total"), int)
    ]
    return {
        "runs": len(runs),
        "median_s": statistics.median(secs) if secs else None,
        "p95_s": secs[math.ceil(0.95 * len(secs)) - 1] if secs else None,
        "all_ok": sum(r["sources_ok"] == r["sources_total"] for r in judged),
        "judged": len(judged),
    }


def source_failures(snapshots: list[dict]) -> dict[str, int]:
    """Return {source: snapshots in which it was not ok} for every source seen; a source missing
    from a snapshot is not a failure."""
    counts: dict[str, int] = {}
    for snap in snapshots:
        sources = snap.get("sources") if isinstance(snap, dict) else None
        for name, src in (sources if isinstance(sources, dict) else {}).items():
            failed = not (isinstance(src, dict) and src.get("ok") is True)
            counts[name] = counts.get(name, 0) + failed
    return counts


def curate_numbers(commits: list[tuple[str, str]]) -> dict:
    """Return the number of 'curate:' commits and the newest one's date (None without one), from
    (ISO date, subject) pairs."""
    dates = []
    for day, subject in commits:
        if subject.startswith("curate:"):
            try:
                dates.append(datetime.date.fromisoformat(day))
            except ValueError:
                continue
    return {"count": len(dates), "last": max(dates) if dates else None}


def source_label(source: str, names: dict[str, str]) -> str:
    """Return a status.json source name in plain words: 'press_releases:DENTSU' is 'Dentsu press
    releases', 'calendar:PUB' is 'Publicis Groupe results calendar'."""
    kind, _, code = source.partition(":")
    words = FEED_WORDS.get(kind, kind.replace("_", " "))
    return f"{names.get(code, code)} {words}" if code else words


def git(args: list[str], root: Path) -> str | None:
    """Return git's stdout for an argument list (never a shell), or None if git fails or is
    missing."""
    try:
        out = subprocess.run(
            ["git", *args], cwd=root, capture_output=True, text=True, check=False
        )
    except OSError:
        return None
    return out.stdout if out.returncode == 0 else None


def status_history(root: Path) -> list[dict] | None:
    """Return up to 365 committed versions of docs/data/status.json, newest first; None if git
    fails."""
    log = git(["log", "--format=%H", "-n", str(HISTORY_LIMIT), "--", STATUS_PATH], root)
    if log is None:
        return None
    snapshots = []
    for sha in log.split():
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            continue
        text = git(["show", f"{sha}:{STATUS_PATH}"], root)
        try:
            snapshots.append(json.loads(text or ""))
        except ValueError:
            continue
    return snapshots


def commit_log(root: Path) -> list[tuple[str, str]] | None:
    """Return (ISO date, subject) for every commit; None if git fails."""
    log = git(["log", "--format=%cs%x09%s"], root)
    if log is None:
        return None
    return [tuple(line.split("\t", 1)) for line in log.splitlines() if "\t" in line]


def _day(iso: str) -> str:
    d = datetime.date.fromisoformat(iso[:10])
    return f"{d.day} {d:%b %Y}"


def _runs_lines(runs: list[dict] | None) -> list[str]:
    if runs is None:
        return [f"- Pipeline runs: {NA}", f"- Runtime: {NA}", f"- Runs with every source ok: {NA}"]
    n = run_numbers(runs)
    runtime = (
        f"median {n['median_s']:.1f} s, p95 {n['p95_s']:.1f} s (nearest rank)"
        if n["median_s"] is not None else NA
    )
    all_ok = (
        f"{n['all_ok']} of {n['judged']} ({n['all_ok'] / n['judged']:.0%})" if n["judged"] else NA
    )
    return [f"- Pipeline runs: {n['runs']}", f"- Runtime: {runtime}",
            f"- Runs with every source ok: {all_ok}"]


def _failures_line(snapshots: list[dict] | None, names: dict[str, str]) -> str:
    if not snapshots:
        return f"- Source failures in the daily snapshots: {NA}"
    counts = source_failures(snapshots)
    failed = sorted((c for c in counts.items() if c[1]), key=lambda c: (-c[1], c[0]))
    if not failed:
        detail = "none"
    else:
        detail = ", ".join(f"{source_label(name, names)} {count}" for name, count in failed)
        if len(failed) < len(counts):
            detail += "; every other source: 0"
    return f"- Source failures across {len(snapshots)} daily snapshots: {detail}"


def _curate_line(commits: list[tuple[str, str]] | None) -> str:
    if commits is None:
        return f"- Curate commits: {NA}"
    n = curate_numbers(commits)
    if n["last"] is None:
        return f"- Curate commits: {n['count']}"
    return f"- Curate commits: {n['count']}, the last on {_day(n['last'].isoformat())}"


def _guidance_line(guidance: dict | None) -> str:
    records = guidance.get("records") if isinstance(guidance, dict) else None
    if not isinstance(records, list):
        return f"- Verified guidance records: {NA}"
    verified = sum(isinstance(r, dict) and r.get("verified") is True for r in records)
    return f"- Verified guidance records: {verified}"


def _press_line(status: dict | None, names: dict[str, str]) -> str:
    sources = status.get("sources") if isinstance(status, dict) else None
    if not isinstance(sources, dict) or not names:
        return f"- Press release sources ok now: {NA}"
    failing = [
        name for code, name in names.items()
        if not (isinstance(sources.get(f"press_releases:{code}"), dict)
                and sources[f"press_releases:{code}"].get("ok") is True)
    ]
    detail = f" (not ok: {', '.join(failing)})" if failing else ""
    return f"- Press release sources ok now: {len(names) - len(failing)} of {len(names)}{detail}"


def _prices_line(prices: dict | None, tickers: list[str]) -> str:
    series = prices.get("series") if isinstance(prices, dict) else None
    if not isinstance(series, dict):
        return f"- Price history: {NA}"
    dates = [
        series[t]["dates"] for t in tickers
        if isinstance(series.get(t), dict) and isinstance(series[t].get("dates"), list)
        and series[t]["dates"]
    ]
    if not dates:
        return f"- Price history: {NA}"
    longest = max(dates, key=len)
    return (
        f"- Price history: {len(longest)} trading days "
        f"({_day(longest[0])} to {_day(longest[-1])})"
    )


def report(today: datetime.date, inputs: dict) -> str:
    """Return the Markdown report for inputs with keys runs, snapshots, commits, guidance,
    status, prices (None where unreadable) and companies ([{code, name, ticker}])."""
    companies = inputs.get("companies") or []
    names = {c["code"]: c["name"] for c in companies}
    lines = [f"Generated {today.isoformat()} by `python -m pipeline.stats`.", ""]
    lines += _runs_lines(inputs.get("runs"))
    lines.append(_failures_line(inputs.get("snapshots"), names))
    lines.append(_curate_line(inputs.get("commits")))
    lines.append(_guidance_line(inputs.get("guidance")))
    lines.append(_press_line(inputs.get("status"), names))
    lines.append(_prices_line(inputs.get("prices"), [c["ticker"] for c in companies]))
    return "\n".join(lines) + "\n"


def _read_json(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def main(root: Path = Path(".")) -> int:
    """Print the report for the repo at root."""
    out = root / "docs" / "data"
    try:
        runs = read_runs((out / "runs.jsonl").read_text(encoding="utf-8"))
    except OSError:
        runs = None
    watchlist = load_watchlist(str(root / "config" / "watchlist.yaml"))
    inputs = {
        "runs": runs,
        "snapshots": status_history(root),
        "commits": commit_log(root),
        "guidance": _read_json(out / "guidance.json"),
        "status": _read_json(out / "status.json"),
        "prices": _read_json(out / "prices.json"),
        "companies": [
            {"code": c["code"], "name": c["name"], "ticker": c["ticker"]}
            for c in watchlist["companies"]
        ],
    }
    sys.stdout.write(report(datetime.datetime.now(datetime.UTC).date(), inputs))
    return 0


if __name__ == "__main__":
    sys.exit(main())
