"""Shared helpers: the single HTTP entry point, UTC timestamps, title classification."""

import datetime
import functools
from urllib.parse import urlparse

import requests

from core.config import load_watchlist

MAX_BYTES = 25 * 1024 * 1024
CHUNK_BYTES = 65536


@functools.cache
def _user_agent() -> str:
    return load_watchlist()["dashboard"]["user_agent"]


def _read_capped(resp: requests.Response, url: str) -> requests.Response:
    """Read a streamed response body into memory; raise ValueError past MAX_BYTES."""
    length = resp.headers.get("Content-Length")
    if length and length.isdigit() and int(length) > MAX_BYTES:
        resp.close()
        raise ValueError(f"{url}: Content-Length {length} exceeds {MAX_BYTES} bytes")
    chunks, total = [], 0
    for chunk in resp.iter_content(CHUNK_BYTES):
        total += len(chunk)
        if total > MAX_BYTES:
            resp.close()
            raise ValueError(f"{url}: body exceeds {MAX_BYTES} bytes")
        chunks.append(chunk)
    resp._content = b"".join(chunks)
    return resp


def fetch(
    url: str, *, timeout: int = 20, retries: int = 1, headers: dict | None = None
) -> requests.Response:
    """GET with a descriptive User-Agent, one retry on 5xx/timeout; raise on final failure."""
    if urlparse(url).scheme not in ("http", "https"):
        raise ValueError(f"refusing non-http(s) URL: {url!r}")
    merged = {"User-Agent": _user_agent()}
    merged.update(headers or {})
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            resp = requests.get(url, headers=merged, timeout=timeout, stream=True)
        except (requests.Timeout, requests.ConnectionError) as e:
            last_error = e
            print(f"[fetch] attempt {attempt + 1} failed: {type(e).__name__} {url}")
            continue
        if resp.status_code >= 500:
            resp.close()
            last_error = requests.HTTPError(f"{resp.status_code} for {url}", response=resp)
            print(f"[fetch] attempt {attempt + 1} failed: HTTP {resp.status_code} {url}")
            continue
        if resp.status_code >= 400:
            resp.close()
            resp.raise_for_status()
        return _read_capped(resp, url)
    raise last_error


def now_iso() -> str:
    """Current UTC time as ISO 8601 with 'Z'."""
    return datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def classify(title: str, company: dict) -> tuple[str, bool]:
    """Return (category, flagged) for a press release title from global and company patterns."""
    raise NotImplementedError("classify is implemented in step 05")
