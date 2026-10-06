"""Validate data/ and docs/data/ files against schemas/. Run: python -m pipeline.validate"""

import copy
import datetime
import json
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = ROOT / "schemas"

DOCS_DATA = [
    "prices",
    "news",
    "press_releases",
    "events",
    "guidance",
    "kpis",
    "status",
    "companies",
]
TARGETS = [(f"docs/data/{name}.json", name) for name in DOCS_DATA] + [
    ("data/guidance.json", "guidance"),
    ("data/events.yaml", "events"),
    ("data/kpis.yaml", "kpis"),
]

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


def validate_file(rel: str, schema_name: str) -> bool:
    """Validate one file and print its result line; return False only on failure."""
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
    schema = json.loads(schema_path.read_text())
    validator = Draft202012Validator(schema, format_checker=FORMAT_CHECKER)
    error = next(validator.iter_errors(data), None)
    if error is not None:
        where = "/".join(str(p) for p in error.path) or "<root>"
        print(f"FAIL {rel}: {where}: {error.message}")
        return False
    print(f"ok {rel}")
    return True


def main() -> int:
    """Validate every target file; return 1 if any failed, else 0."""
    results = [validate_file(rel, name) for rel, name in TARGETS]
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
