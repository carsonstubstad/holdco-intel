.PHONY: check pipeline validate serve backfill

check:
	uv run ruff check .
	uv run pytest

pipeline:
	uv run python -m pipeline.run

validate:
	uv run python -m pipeline.validate

serve:
	uv run python -m http.server 8000 -d docs

backfill:
	uv run python -m pipeline.backfill --years 2
