"""Tests for core.util.fetch with requests.get stubbed out: no network."""

import io
import re

import pytest
import requests

from core import util
from core.config import load_watchlist


def _response(status: int = 200, body: bytes = b"ok", headers: dict | None = None):
    resp = requests.Response()
    resp.status_code = status
    resp.reason = "stub"
    resp.url = "https://example.com/"
    resp.raw = io.BytesIO(body)
    resp.headers.update(headers or {})
    return resp


class _Calls(list):
    """Recorded requests.get calls, plus .outcomes: a queue of responses or exceptions."""


@pytest.fixture
def stub(monkeypatch):
    """Replace requests.get with a queue of canned outcomes; return the recorded calls."""
    made = _Calls()
    made.outcomes = []

    def fake_get(url, **kwargs):
        made.append({"url": url, **kwargs})
        outcome = made.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(util.requests, "get", fake_get)
    return made


def test_rejects_non_http_schemes(stub):
    for url in ["file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)", "example.com"]:
        with pytest.raises(ValueError):
            util.fetch(url)
    assert stub == []


def test_sends_configured_user_agent_and_extra_headers(stub):
    stub.outcomes.append(_response(body=b"hello"))
    resp = util.fetch("https://example.com/", headers={"Accept": "text/xml"}, timeout=5)
    assert resp.text == "hello"
    sent = stub[0]
    assert sent["headers"]["User-Agent"] == load_watchlist()["dashboard"]["user_agent"]
    assert sent["headers"]["Accept"] == "text/xml"
    assert sent["timeout"] == 5
    assert sent["stream"] is True


def test_retries_once_on_5xx_then_succeeds(stub):
    stub.outcomes += [_response(503), _response(body=b"second")]
    assert util.fetch("https://example.com/").text == "second"
    assert len(stub) == 2


def test_retries_once_on_timeout_then_raises(stub):
    stub.outcomes += [requests.Timeout("t1"), requests.Timeout("t2")]
    with pytest.raises(requests.Timeout):
        util.fetch("https://example.com/")
    assert len(stub) == 2


def test_raises_after_repeated_5xx(stub):
    stub.outcomes += [_response(500), _response(502)]
    with pytest.raises(requests.HTTPError):
        util.fetch("https://example.com/")
    assert len(stub) == 2


def test_4xx_raises_without_retry(stub):
    stub.outcomes.append(_response(404))
    with pytest.raises(requests.HTTPError):
        util.fetch("https://example.com/")
    assert len(stub) == 1


def test_refuses_large_content_length(stub):
    stub.outcomes.append(_response(headers={"Content-Length": str(util.MAX_BYTES + 1)}))
    with pytest.raises(ValueError):
        util.fetch("https://example.com/")


def test_refuses_large_streamed_body(stub, monkeypatch):
    monkeypatch.setattr(util, "MAX_BYTES", 10)
    stub.outcomes.append(_response(body=b"x" * 11))
    with pytest.raises(ValueError):
        util.fetch("https://example.com/")


def test_now_iso_format():
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", util.now_iso())
