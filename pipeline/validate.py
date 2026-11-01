"""Validate data/ and docs/data/ files against schemas/.

Run: python -m pipeline.validate [--check-reads [-]]

With no arguments (make validate, and daily.yml before its commit) every target file is checked
against its schema. data/guidance.json also follows the metric_label rule (step 23): a record
with metric "other" has a metric_label found in its quote as written (case-sensitive), and no
other record has one. data/commentary.json's reads also pass the read self-check (step 24a):
each read is checked against its own figure list only (2 or 3 sentences, every number one of
its listed figures, periods, KPI form, the company named before each figure), so a later edit
to data/ never fails the daily run.

--check-reads checks the newest read in data/commentary.json, and --check-reads - one draft
read given as JSON on stdin: its schema, the self-check, then every figure against
data/kpis.yaml, current data/guidance.json records and data/events.yaml. Only /curate runs it;
it is never part of make validate.
"""

import copy
import datetime
import json
import re
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

from core.commentary import get_commentary
from core.config import load_watchlist
from core.guidance import get_guidance

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = ROOT / "schemas"

DOCS_DATA = [
    "prices",
    "news",
    "press_releases",
    "events",
    "guidance",
    "commentary",
    "kpis",
    "status",
    "companies",
    "event_candidates",
]
TARGETS = [(f"docs/data/{name}.json", name) for name in DOCS_DATA] + [
    ("data/guidance.json", "guidance"),
    ("data/commentary.json", "commentary"),
    ("data/events.yaml", "events"),
    ("data/kpis.yaml", "kpis"),
]

# The read's figure rule (DESIGN.md J4, C6). Signs are written with chr() to keep this file ASCII.
MINUS = chr(0x2212)  # the true minus; a hyphen never stands for it
CURRENCY = {chr(0x20AC): "EUR", "$": "USD", chr(0xA3): "GBP", chr(0xA5): "JPY"}
SIGN_FOR = {currency: sign for sign, currency in CURRENCY.items()}
KPI_FIELDS = ("organic_growth_pct", "margin_pct", "revenue_local_m")
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
SENTENCE_END = re.compile(r"[.!?](?= |$)")
PERIOD_TOKEN = re.compile(r"\b(?:(?:Q[1-4]|H[12]|9M)(?: ?20\d\d)?|FY ?20\d\d)\b")
YEAR = re.compile(r"\b20\d\d\b")
NUMBER = re.compile(r"^[0-9]+(?:\.[0-9]+)?$")
RESULTS_DATE = re.compile(
    r"^([1-9]|[12][0-9]|3[01]) (" + "|".join(MONTHS) + r")( 20[0-9]{2})?( \(est\.\))?$"
)
# A figure counts only on clean edges: "2%" never inside "22%", "+2%" or "$2%".
EDGE_BEFORE = set("0123456789+-.,") | {MINUS} | set(CURRENCY)

FORMAT_CHECKER = copy.deepcopy(Draft202012Validator.FORMAT_CHECKER)


@FORMAT_CHECKER.checks("date-time", raises=ValueError)
def _is_datetime(value: object) -> bool:
    if not isinstance(value, str):
        return True
    s = value[:-1] + "+00:00" if value.endswith("Z") else value
    datetime.datetime.fromisoformat(s)
    return True


@FORMAT_CHECKER.checks("uri")
def _is_uri(value: object) -> bool:
    if not isinstance(value, str):
        return True
    return value.startswith(("http://", "https://"))


def to_jsonable(value: object) -> object:
    """Return value with date/datetime objects converted to ISO strings, recursively."""
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_jsonable(v) for v in value]
    return value


def load(path: Path) -> object:
    """Return the parsed contents of a JSON or YAML file, dates as ISO strings."""
    text = path.read_text()
    if path.suffix in (".yaml", ".yml"):
        return to_jsonable(yaml.safe_load(text))
    return json.loads(text)


def guidance_label_errors(data: dict) -> list[str]:
    """Return "<id>: <problem>" for each guidance record breaking the metric_label rule."""
    errors = []
    for r in data["records"]:
        has_label = "metric_label" in r
        if r["metric"] != "other":
            if has_label:
                errors.append(f"{r['id']}: metric_label on metric {r['metric']}")
        elif not has_label:
            errors.append(f"{r['id']}: metric other without metric_label")
        elif r["metric_label"] not in r["quote"]:
            errors.append(f"{r['id']}: metric_label {r['metric_label']!r} not in its quote")
    return errors


def company_names(watchlist: dict) -> dict[str, str]:
    """Return {name: code} for each company's watchlist name's first word and its code."""
    names = {}
    for c in watchlist["companies"]:
        code = str(c["code"]).upper()
        names[str(c["name"]).split()[0]] = code
        names[code] = code
    return names


def _sentences(text: str) -> list[tuple[int, int]]:
    """(start, end) of each sentence: one ends at ".", "!" or "?" before a space or the end."""
    spans, start = [], 0
    for m in SENTENCE_END.finditer(text):
        if text[start : m.end()].strip():
            spans.append((start, m.end()))
        start = m.end()
    if text[start:].strip():
        spans.append((start, len(text)))
    return spans


def _occurrences(text: str, figure: str) -> list[int]:
    """Start of each occurrence of figure in text that sits on clean edges."""
    hits, i = [], text.find(figure)
    while i != -1:
        end = i + len(figure)
        before = text[i - 1] if i else ""
        after = text[end : end + 2]
        dirty_after = after[:1].isdigit() or (after[:1] in (".", ",") and after[1:2].isdigit())
        if before not in EDGE_BEFORE and not dirty_after:
            hits.append(i)
        i = text.find(figure, i + 1)
    return hits


def _norm(period: str) -> str:
    return period.replace(" ", "").upper()


def _period_matches(token: str, periods: set[str]) -> bool:
    """A token matches a figure's period exactly, or by prefix when it has no year ("Q3")."""
    if token in periods:
        return True
    if re.search(r"20\d\d$", token):
        return False
    return any(p.startswith(token) and re.fullmatch(r"20\d\d", p[len(token) :]) for p in periods)


def _label(n: int, fig: dict) -> str:
    return f"figure {n} ({fig['company']} {fig['field']} {fig['period'] or '-'} {fig['text']!r})"


def _shape_problem(fig: dict) -> str | None:
    """Which of period, value and ref a figure carries, by its field."""
    field, value, period, ref = fig["field"], fig["value"], fig["period"], fig["ref"]
    if field in KPI_FIELDS:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return "a KPI figure needs a numeric value"
        if not period:
            return "a KPI figure needs its row's period"
        if ref is not None:
            return "ref is for guidance figures only"
    elif field == "guidance":
        if not ref:
            return "a guidance figure needs ref (the record id)"
        if not period:
            return "a guidance figure needs its record's period"
        if value is not None:
            return "a guidance figure has a null value"
    elif period is not None or value is not None or ref is not None:
        return "a results date has null period, value and ref"
    return None


def _kpi_number(text: str, field: str) -> tuple[float | None, str | None]:
    """(number, None) parsed from a KPI figure's text, or (None, problem)."""
    if "-" in text:
        return None, "a hyphen; write the true minus (U+2212)"
    s, sign = text, 1
    if field == "organic_growth_pct":
        if s.startswith("+"):
            s = s[1:]
        elif s.startswith(MINUS):
            s, sign = s[1:], -1
    elif s[:1] in ("+", MINUS):
        return None, f"a sign on {field}; only organic growth is signed"
    if "bn" in s or "billion" in s:
        return None, '"bn" or "billion"; KPI figures are in millions'
    if s[:1] in CURRENCY:
        s = s[1:]
    s = s.replace(",", "")
    for unit in ("%", " million", "m"):
        if s.endswith(unit):
            s = s[: -len(unit)]
            break
    if not NUMBER.match(s):
        return None, "does not read as a number"
    return sign * float(s), None


def _form_problem(fig: dict) -> str | None:
    """How a figure's text breaks its field's form (C6), or None."""
    field, text, value = fig["field"], fig["text"], fig["value"]
    if field == "results_date":
        if RESULTS_DATE.match(text):
            return None
        return 'a results date reads "13 Nov" or "2 Feb 2027", either with " (est.)"'
    if field == "guidance":
        return None
    number, problem = _kpi_number(text, field)
    if problem:
        return problem
    if field == "organic_growth_pct":
        want = "+" if value > 0 else MINUS if value < 0 else ""
        has = text[:1] if text[:1] in ("+", MINUS) else ""
        if has != want:
            needed = {"+": '"+"', MINUS: "the true minus (U+2212)", "": "no sign"}[want]
            return f"organic growth {value} starts with {needed}"
    if number != float(value):
        return f"reads as {number}, not its value {value}"
    return None


def read_errors(read: dict, names: dict[str, str]) -> list[str]:
    """Return "<id>: <problem>" for each way a read's text disagrees with its own figures."""
    rid, text, figures = read["id"], read["text"], read["figures"]
    errors: list[str] = []
    if rid[5:15] != read["date"]:
        errors.append(f"{rid}: id date differs from date {read['date']}")
    spans = _sentences(text)
    if not 2 <= len(spans) <= 3:
        count = f"{len(spans)} sentence{'' if len(spans) == 1 else 's'}"
        errors.append(f"{rid}: {count}; a read has 2 or 3")
    codes = set(names.values())
    pattern = re.compile(
        r"\b(?:" + "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True)) + r")\b"
    )
    mask = [False] * len(text)
    in_sentence: list[set[int]] = [set() for _ in spans]
    for n, fig in enumerate(figures, 1):
        label, company = _label(n, fig), str(fig["company"]).upper()
        if company not in codes:
            errors.append(f"{rid}: {label}: unknown company")
        shape = _shape_problem(fig)
        problem = shape or _form_problem(fig)
        if problem:
            errors.append(f"{rid}: {label}: {problem}")
        hits = _occurrences(text, fig["text"])
        if not hits:
            errors.append(f"{rid}: {label}: not in the read's text")
            continue
        nearest = []
        for i in hits:
            for k in range(i, i + len(fig["text"])):
                mask[k] = True
            s = next((j for j, (a, b) in enumerate(spans) if a <= i < b), None)
            if s is None:
                continue
            in_sentence[s].add(n - 1)
            named = [m.group(0) for m in pattern.finditer(text, spans[s][0], i)]
            nearest.append(names[named[-1]] if named else None)
        if company in codes and company not in nearest:
            errors.append(f"{rid}: {label}: the nearest company named before it is not {company}")
    blanked = "".join(" " if hidden else c for c, hidden in zip(text, mask))
    for s, (a, b) in enumerate(spans, 1):
        piece = blanked[a:b]
        periods = {
            _norm(figures[j]["period"])
            for j in in_sentence[s - 1]
            if isinstance(figures[j].get("period"), str)
        }
        for token in PERIOD_TOKEN.findall(piece):
            if not _period_matches(_norm(token), periods):
                errors.append(
                    f"{rid}: sentence {s}: period {token!r} matches no figure's period there"
                )
        stray = re.search(r"\d+(?:[.,]\d+)*", YEAR.sub(" ", PERIOD_TOKEN.sub(" ", piece)))
        if stray:
            errors.append(
                f"{rid}: sentence {s}: stray number {stray.group(0)!r}; every number is a listed"
                " figure and counts are words"
            )
    return errors


def reads_errors(reads: list[dict], names: dict[str, str]) -> list[str]:
    """Return "<id>: <problem>" for every read failing the self-check, and for a repeated id."""
    errors, seen = [], set()
    for read in reads:
        if read["id"] in seen:
            errors.append(f"{read['id']}: id used twice")
        seen.add(read["id"])
        errors.extend(read_errors(read, names))
    return errors


def _kpi_data_problems(fig: dict, kpi_rows: list[dict]) -> list[str]:
    """How a KPI figure disagrees with its data/kpis.yaml row."""
    company, field = str(fig["company"]).upper(), fig["field"]
    rows = [r for r in kpi_rows if str(r["company"]).upper() == company]
    row = next((r for r in rows if r["period"] == fig["period"]), None)
    if row is None:
        return ["no data/kpis.yaml row for that company and period"]
    problems = []
    if row.get(field) is None:
        problems.append(f"no {field} on file for that row")
    elif float(row[field]) != float(fig["value"]):
        problems.append(f"value {fig['value']} differs from {row[field]} on file")
    if fig["source_url"] != row["source_url"]:
        problems.append("source_url is not the row's")
    if field == "revenue_local_m":
        sign = SIGN_FOR.get(row.get("currency"))
        if sign is None or not fig["text"].startswith(sign):
            problems.append(f"revenue carries its row's {row.get('currency')} sign")
    return problems


def _guidance_data_problems(fig: dict, current: dict[str, dict]) -> list[str]:
    """How a guidance figure disagrees with its current data/guidance.json record."""
    record = current.get(fig["ref"])
    if record is None:
        return [f"ref {fig['ref']!r} is not a current guidance record"]
    problems = []
    if fig["text"] != record["value"]:
        problems.append(f"text is not the record's whole value {record['value']!r}")
    same = str(record["company"]).upper() == str(fig["company"]).upper()
    if not same or record["period"] != fig["period"]:
        problems.append("company or period differs from the record's")
    if fig["source_url"] != record["source_url"]:
        problems.append("source_url is not the record's")
    return problems


def _date_data_problems(fig: dict, read_date: str, events: list[dict]) -> list[str]:
    """How a results date disagrees with the company's next results event in data/events.yaml."""
    company = str(fig["company"]).upper()
    ahead = sorted(
        (
            e
            for e in events
            if str(e["company"]).upper() == company
            and e["type"] == "results"
            and e["date"] >= read_date
        ),
        key=lambda e: e["date"],
    )
    if not ahead:
        return [f"no results event on or after {read_date} in data/events.yaml"]
    event, problems = ahead[0], []
    day = datetime.date.fromisoformat(event["date"])
    expected = f"{day.day} {MONTHS[day.month - 1]}"
    if day.year != int(read_date[:4]):
        expected += f" {day.year}"
    if not event.get("confirmed", False):
        expected += " (est.)"
    if fig["text"] != expected:
        problems.append(f"the next results event reads {expected!r}")
    if fig["source_url"] != event.get("source_url"):
        problems.append("source_url is not the event's")
    return problems


def read_data_errors(
    read: dict, kpi_rows: list[dict], current_guidance: list[dict], events: list[dict]
) -> list[str]:
    """Return "<id>: figure <n> (...): <problem>" for each figure that disagrees with data/."""
    current = {g["id"]: g for g in current_guidance}
    errors = []
    for n, fig in enumerate(read["figures"], 1):
        if fig["field"] in KPI_FIELDS:
            problems = _kpi_data_problems(fig, kpi_rows)
        elif fig["field"] == "guidance":
            problems = _guidance_data_problems(fig, current)
        else:
            problems = _date_data_problems(fig, read["date"], events)
        errors.extend(f"{read['id']}: {_label(n, fig)}: {p}" for p in problems)
    return errors


def _item_id(data: object, path: object) -> str | None:
    """The id of the outermost item on a schema error's path, so a failure names its record."""
    node = data
    for key in path:
        try:
            node = node[key]
        except (KeyError, IndexError, TypeError):
            return None
        if isinstance(node, dict) and isinstance(node.get("id"), str):
            return node["id"]
    return None


def _schema_error(schema: dict, data: object) -> str | None:
    """Return "<path> (<id>): <message>" for the first schema error, or None."""
    validator = Draft202012Validator(schema, format_checker=FORMAT_CHECKER)
    error = next(validator.iter_errors(data), None)
    if error is None:
        return None
    where = "/".join(str(p) for p in error.path) or "<root>"
    item = _item_id(data, error.path)
    return f"{where}{f' ({item})' if item else ''}: {error.message}"


def _names() -> dict[str, str]:
    return company_names(load_watchlist(ROOT / "config" / "watchlist.yaml"))


def validate_file(rel: str, schema_name: str) -> bool:
    """Validate one file (data/guidance.json and data/commentary.json also by their own rules);
    False only on failure."""
    path = ROOT / rel
    schema_path = SCHEMAS / f"{schema_name}.schema.json"
    if not path.exists():
        print(f"skip {rel} (missing)")
        return True
    if not schema_path.exists():
        print(f"skip {rel} (no schema {schema_path.name})")
        return True
    try:
        data = load(path)
    except (ValueError, yaml.YAMLError) as exc:
        print(f"FAIL {rel}: parse error: {exc}")
        return False
    problem = _schema_error(json.loads(schema_path.read_text()), data)
    if problem is not None:
        print(f"FAIL {rel}: {problem}")
        return False
    problems = []
    if rel == "data/guidance.json":
        problems = guidance_label_errors(data)
    elif rel == "data/commentary.json" and data.get("reads"):
        problems = reads_errors(data["reads"], _names())
    for problem in problems:
        print(f"FAIL {rel}: {problem}")
    if problems:
        return False
    print(f"ok {rel}")
    return True


def check_reads(source: str | None) -> int:
    """Check the newest read in data/commentary.json (source None) or a draft read on stdin
    ("-") against itself and data/; return 0 if it passes, else 1."""
    if source == "-":
        try:
            read = json.load(sys.stdin)
        except ValueError as exc:
            print(f"FAIL draft read: not JSON: {exc}")
            return 1
    else:
        reads = get_commentary(path=ROOT / "data" / "commentary.json")["reads"]
        if not reads:
            print("FAIL data/commentary.json: no reads")
            return 1
        read = reads[0]
    rid = read.get("id", "draft read") if isinstance(read, dict) else "draft read"
    schema = json.loads((SCHEMAS / "commentary.schema.json").read_text())
    problem = _schema_error(schema["properties"]["reads"]["items"], read)
    if problem is not None:
        print(f"FAIL {rid}: {problem}")
        return 1
    problems = read_errors(read, _names())
    if not problems:
        kpis_path, events_path = ROOT / "data" / "kpis.yaml", ROOT / "data" / "events.yaml"
        kpi_rows = (load(kpis_path) or {}).get("rows") or [] if kpis_path.exists() else []
        events = (load(events_path) or {}).get("items") or [] if events_path.exists() else []
        current = [
            g
            for g in get_guidance(current_only=True, path=ROOT / "data" / "guidance.json")
            if g["status"] != "withdrawn"
        ]
        problems = read_data_errors(read, kpi_rows, current, events)
    for problem in problems:
        print(f"FAIL {problem}")
    if problems:
        return 1
    print(f"ok {rid}")
    return 0


def main(argv: list[str] | None = None) -> int:
    """Validate every target file (no arguments) or check a read (--check-reads [-]); return
    the exit code."""
    argv = [] if argv is None else list(argv)
    if not argv:
        results = [validate_file(rel, name) for rel, name in TARGETS]
        return 0 if all(results) else 1
    if argv == ["--check-reads"]:
        return check_reads(None)
    if argv == ["--check-reads", "-"]:
        return check_reads("-")
    print("usage: python -m pipeline.validate [--check-reads [-]]")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
