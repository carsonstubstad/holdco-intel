"""Tests for pipeline.verify_quote with fetch stubbed out: no network."""

import pytest
import requests

from pipeline import verify_quote

HTML = """<html><head><meta charset="utf-8"><title>Q3</title>
<script>var q = "organic growth of between 4% and 5% for the full year";</script>
<style>p { color: red; }</style></head>
<body>
<p>The Group\u2019s \u201cstrong\u201d quarter.</p>
<p>We now expect <b>organic growth</b> of
   between 4\u202f% and
   5\u202f% for the full year, up from \u2248 3\u00a0%.</p>
<p>Repr\u00e9sen\u00adtation of results.</p>
<a href="/files/q3-release.pdf">PDF</a>
<a href="https://example.com/files/q3-release.pdf">PDF again</a>
<a href="mailto:ir@example.com">mail</a>
<a href="/news.html">news</a>
</body></html>"""

QUERY = "we now expect organic growth of between 4% and 5% for the full year"


def _response(body: bytes, url: str, content_type: str) -> requests.Response:
    resp = requests.Response()
    resp.status_code = 200
    resp.url = url
    resp._content = body
    resp.headers["Content-Type"] = content_type
    return resp


@pytest.fixture
def serve(monkeypatch):
    """Make fetch return the given response; return the list of fetched URLs."""
    calls: list[str] = []

    def install(resp):
        def fake_fetch(url, **_):
            calls.append(url)
            if isinstance(resp, Exception):
                raise resp
            return resp

        monkeypatch.setattr(verify_quote, "fetch", fake_fetch)
        return calls

    return install


def _minimal_pdf(lines: list[str]) -> bytes:
    """Return a one-page PDF showing each line in Helvetica, with correct xref offsets."""
    ops = ["BT", "/F1 12 Tf", "14 TL", "72 720 Td"]
    for line in lines:
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        ops.append(f"({escaped}) Tj T*")
    ops.append("ET")
    stream = "\n".join(ops).encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
        ),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for n, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % n + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        xref,
    )
    return bytes(out)


def test_html_found_across_tags_lines_and_narrow_nbsp(serve, capsys):
    serve(_response(HTML.encode(), "https://example.com/q3", "text/html"))
    assert verify_quote.main(["https://example.com/q3", QUERY]) == 0
    out = capsys.readouterr().out
    assert "[1] FOUND" in out
    assert 'the group\'s "strong" quarter' in out


def test_pdf_found_with_hyphen_join(serve, capsys):
    pdf = _minimal_pdf(["Outlook: we expect organic growth of be-", "tween 4% and 5% in 2026."])
    serve(_response(pdf, "https://example.com/q3.pdf", "application/octet-stream"))
    code = verify_quote.main(
        ["https://example.com/q3.pdf", "we expect organic growth of between 4% and 5% in 2026"]
    )
    assert code == 0, capsys.readouterr().out


def test_not_found_prints_three_windows(serve, capsys):
    serve(_response(HTML.encode(), "https://example.com/q3", "text/html"))
    code = verify_quote.main(["https://example.com/q3", "we now expect organic growth of 7%"])
    out = capsys.readouterr().out
    assert code == 1
    assert "[1] NOT FOUND" in out
    assert len([ln for ln in out.splitlines() if ln.startswith("    ")]) == 3


def test_too_short_quote_does_not_fetch(serve, capsys):
    calls = serve(_response(HTML.encode(), "https://example.com/q3", "text/html"))
    assert verify_quote.main(["https://example.com/q3", "growth 4%"]) == 2
    assert "quote too short to verify" in capsys.readouterr().out
    assert calls == []


def test_text_is_cleaned_case_preserved_with_links(serve, capsys):
    serve(_response(HTML.encode(), "https://example.com/q3", "text/html"))
    assert verify_quote.main(["--text", "https://example.com/q3"]) == 0
    out = capsys.readouterr().out
    body, links = out.split("LINKS:\n")
    assert "The Group\u2019s" in body
    assert "We now expect organic growth of between 4 % and 5 % for the full year" in body
    assert "var q" not in body and "color: red" not in body
    assert "Repr\u00e9sentation" in body
    assert "\u00a0" not in body and "\u202f" not in body and "  " not in body.strip()
    assert links.split() == ["https://example.com/files/q3-release.pdf"]

    copied = "We now expect organic growth of between 4 % and 5 % for the full year"
    assert verify_quote.main(["https://example.com/q3", copied]) == 0


def test_text_truncated(serve, capsys):
    page = "<p>" + "word " * 20000 + "</p>"
    serve(_response(page.encode(), "https://example.com/long", "text/html"))
    assert verify_quote.main(["--text", "https://example.com/long"]) == 0
    out = capsys.readouterr().out
    assert "[truncated: 60000 of 99999 chars]" in out
    assert "LINKS:\n(none)" in out


def test_several_quotes_one_fetch_worst_code(serve, capsys):
    calls = serve(_response(HTML.encode(), "https://example.com/q3", "text/html"))
    code = verify_quote.main(
        ["https://example.com/q3", QUERY, "a sentence that is not there at all"]
    )
    out = capsys.readouterr().out
    assert code == 1
    assert "[1] FOUND" in out and "[2] NOT FOUND" in out
    assert calls == ["https://example.com/q3"]


def test_fetch_failure_exits_2(serve, capsys):
    serve(requests.ConnectionError("boom"))
    assert verify_quote.main(["https://example.com/q3", QUERY]) == 2
    assert "ERROR: ConnectionError: boom" in capsys.readouterr().out
