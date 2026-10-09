.PHONY: check pipeline validate serve backfill backfill-benchmark

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

backfill-benchmark:
	uv run python -m pipeline.backfill --years 2 --only "$$(uv run python -c 'from core.config import load_watchlist; print(load_watchlist()["dashboard"]["benchmark"]["symbol"])')"
