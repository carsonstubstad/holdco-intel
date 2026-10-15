"""Tests for pipeline.verify_quote with fetch stubbed out: no network."""

import io
from urllib.robotparser import RobotFileParser

import pytest
import requests

from core.config import load_watchlist
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
    assert "[truncated: showing 0 to 60000 of 99999 chars; next: --from 60000]" in out
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


def test_text_from_reads_past_limit(serve, capsys):
    page = "<p>" + "word " * 13000 + "MARKER after the limit, near the end.</p>"
    serve(_response(page.encode(), "https://example.com/long", "text/html"))
    assert verify_quote.main(["--text", "https://example.com/long"]) == 0
    first = capsys.readouterr().out
    assert "MARKER" not in first
    assert "[truncated: showing 0 to 60000 of 65037 chars; next: --from 60000]" in first

    assert verify_quote.main(["--text", "--from", "60000", "https://example.com/long"]) == 0
    second = capsys.readouterr().out
    assert "word MARKER after the limit, near the end." in second
    assert "[truncated" not in second
    # quote matching always searched the full text
    assert verify_quote.main(["https://example.com/long", "MARKER after the limit"]) == 0


def test_from_past_end_exits_2(serve, capsys):
    serve(_response(HTML.encode(), "https://example.com/q3", "text/html"))
    assert verify_quote.main(["--text", "--from", "999999", "https://example.com/q3"]) == 2
    assert "[--from 999999 is past the end:" in capsys.readouterr().out


@pytest.mark.parametrize(
    "argv", [["--from", "5", "https://example.com/q3", QUERY], ["--text", "--from", "-1", "u"]]
)
def test_from_needs_text_and_a_non_negative_start(argv, capsys):
    with pytest.raises(SystemExit):
        verify_quote.main(argv)
    assert "--from N needs --text and N >= 0" in capsys.readouterr().err


def test_final_url_printed_first(serve, capsys):
    serve(_response(HTML.encode(), "https://example.com/final", "text/html"))
    assert verify_quote.main(["--text", "https://example.com/start"]) == 0
    assert capsys.readouterr().out.splitlines()[0] == "URL: https://example.com/final"
    assert verify_quote.main(["https://example.com/start", QUERY]) == 0
    assert capsys.readouterr().out.splitlines()[:2] == [
        "URL: https://example.com/final",
        "[1] FOUND",
    ]


# --company: registered domain and robots.txt

WPP = "https://www.wpp.com"
OMC = "https://investor.omc.com"
Q4CDN = "https://s1.q4cdn.com"
PRIVATE = "Disallow: /private/"
DOC_HTML = b"<html><body><p>DOCUMENT BODY: management words about strategy.</p></body></html>"


def _text(body: str, url: str) -> requests.Response:
    return _response(body.encode(), url, "text/plain")


def _http_error(status: int, url: str) -> requests.HTTPError:
    """An HTTPError carrying its response, as core.util.fetch raises it."""
    resp = _response(b"", url, "text/plain")
    resp.status_code = status
    return requests.HTTPError(f"{status} for {url}", response=resp)


@pytest.fixture
def route(monkeypatch):
    """Make fetch answer by URL from a table (response or exception) and stub time.sleep; return
    the shared log of fetched URLs and sleeps, in order."""
    log: list[str] = []

    def install(table: dict):
        def fake_fetch(url, **_):
            log.append(url)
            answer = table[url]
            if isinstance(answer, Exception):
                raise answer
            return answer

        monkeypatch.setattr(verify_quote, "fetch", fake_fetch)
        monkeypatch.setattr(verify_quote.time, "sleep", lambda s: log.append(f"sleep {s}"))
        return log

    return install


@pytest.mark.parametrize(
    ("code", "url", "reason"),
    [
        ("PUB", "https://example.com/q3", "example.com is not on publicisgroupe.com"),
        ("PUB", "https://publicisgroupe.com.evil.net/q3", "is not on publicisgroupe.com"),
        ("WPP", "https://evil.net\\@www.wpp.com/", "backslash, whitespace or a control"),
        ("WPP", "https://evil.net@www.wpp.com/", "user-info part (@)"),
        ("WPP", "https://www.wpp.com/a b", "backslash, whitespace or a control"),
        ("WPP", "https://www.wpp.com/a\tb", "backslash, whitespace or a control"),
        ("WPP", "https://www.wpp.com/a\nb", "backslash, whitespace or a control"),
        ("WPP", "https://www.wpp.com/a\x00b", "backslash, whitespace or a control"),
        ("WPP", "ftp://www.wpp.com/x", "not an http(s) URL"),
        ("WPP", "https://[::1/x", "URL does not parse"),
        ("NOPE", "https://www.wpp.com/x", "unknown company code"),
        ("", "https://www.wpp.com/x", "unknown company code"),  # empty never skips the checks
        ("WPP", "https://www.wpp.com/en/../private/x", "segment or '//'"),
        ("WPP", "https://www.wpp.com/en/%2e%2e/private/x", "segment or '//'"),
        ("WPP", "https://www.wpp.com/en/./x", "segment or '//'"),
        ("WPP", "https://www.wpp.com//private/x", "segment or '//'"),
    ],
)
def test_off_domain_refused_before_any_fetch(route, capsys, code, url, reason):
    log = route({})
    assert verify_quote.main(["--company", code, "--text", url]) == 2
    out = capsys.readouterr().out
    assert log == []
    assert out.startswith("REFUSED: ") and reason in out
    assert len(out.splitlines()) == 1


def test_same_registered_domain_is_accepted(route, capsys):
    log = route({
        f"{OMC}/robots.txt": _text("User-agent: *\nDisallow: /admin/\n", f"{OMC}/robots.txt"),
        f"{OMC}/files/q3": _response(DOC_HTML, f"{OMC}/files/q3", "text/html"),
    })
    assert verify_quote.main(["--company", "omc", "--text", f"{OMC}/files/q3"]) == 0
    assert "DOCUMENT BODY" in capsys.readouterr().out
    assert log == [f"{OMC}/robots.txt", f"{OMC}/files/q3"]


@pytest.mark.parametrize(
    ("robots", "rule"),
    [
        ("User-agent: *\nDisallow: /private/\n", PRIVATE),
        # a group naming our agent wins over *
        ("User-agent: holdco-intel\nDisallow: /\n\nUser-agent: *\nAllow: /\n", "Disallow: /"),
        ("User-agent: other\nUser-agent: holdco-intel\nDisallow: /private/\n", PRIVATE),
        # stdlib keeps only the first * group and misreads a leading BOM; we read every group
        ("User-agent: *\nDisallow: /a/\n\nUser-agent: *\nDisallow: /private/\n", PRIVATE),
        ("\ufeffUser-agent: *\nDisallow: /private/\n", PRIVATE),
        ("User-agent: * # everyone\nDisallow: /private/ # no\n", PRIVATE),
    ],
)
def test_robots_disallow_refuses_without_fetching_document(route, capsys, robots, rule):
    log = route({f"{WPP}/robots.txt": _text(robots, f"{WPP}/robots.txt")})
    assert verify_quote.main(["--company", "WPP", "--text", f"{WPP}/private/doc"]) == 2
    out = capsys.readouterr().out
    assert out == f"REFUSED: robots.txt on www.wpp.com disallows {WPP}/private/doc ({rule})\n"
    assert log == [f"{WPP}/robots.txt"]


@pytest.mark.parametrize(
    ("robots", "path", "rule"),
    [
        ("User-agent: *\nDisallow: /*.pdf$\n", "/files/q3.pdf", "Disallow: /*.pdf$"),
        ("User-agent: *\nDisallow: /*.pdf$\n", "/en/news/q3", None),
        ("User-agent: *\nAllow: /\nDisallow: /files/\n", "/files/a.pdf", "Disallow: /files/"),
        ("User-agent: holdco-intel\nAllow: /\n\nUser-agent: *\nDisallow: /\n", "/en/q3", None),
    ],
)
def test_robots_wildcard_fails_closed(route, capsys, robots, path, rule):
    stdlib = RobotFileParser()
    stdlib.parse(robots.splitlines())
    assert stdlib.can_fetch(load_watchlist()["dashboard"]["user_agent"], f"{WPP}{path}")

    route({
        f"{WPP}/robots.txt": _text(robots, f"{WPP}/robots.txt"),
        f"{WPP}{path}": _response(DOC_HTML, f"{WPP}{path}", "text/html"),
    })
    code = verify_quote.main(["--company", "WPP", "--text", f"{WPP}{path}"])
    out = capsys.readouterr().out
    if rule:
        assert code == 2 and out.endswith(f"({rule})\n")
    else:
        assert code == 0 and "DOCUMENT BODY" in out


@pytest.mark.parametrize(
    ("q4cdn_robots", "allowed"),
    [
        (_text("User-agent: *\nAllow: /\n", f"{Q4CDN}/robots.txt"), True),
        (_text("User-agent: *\nDisallow: /\n", f"{Q4CDN}/robots.txt"), False),
        # the real q4cdn host answers 403 for robots.txt: no robots.txt, so nothing is disallowed
        (_http_error(403, f"{Q4CDN}/robots.txt"), True),
    ],
)
def test_redirect_to_other_host_needs_its_robots(route, capsys, q4cdn_robots, allowed):
    log = route({
        f"{OMC}/robots.txt": _text("User-agent: *\nCrawl-delay: 10\n", f"{OMC}/robots.txt"),
        f"{OMC}/files/q3": _response(DOC_HTML, f"{Q4CDN}/doc/q3", "text/html"),
        f"{Q4CDN}/robots.txt": q4cdn_robots,
    })
    code = verify_quote.main(["--company", "OMC", "--text", f"{OMC}/files/q3"])
    out = capsys.readouterr().out
    assert log == [f"{OMC}/robots.txt", "sleep 10.0", f"{OMC}/files/q3", f"{Q4CDN}/robots.txt"]
    if allowed:
        assert code == 0
        assert out.splitlines()[0] == f"URL: {Q4CDN}/doc/q3"
        assert "DOCUMENT BODY" in out
    else:
        assert code == 2
        refused = f"REFUSED: robots.txt on s1.q4cdn.com disallows {Q4CDN}/doc/q3 (Disallow: /)"
        assert out == refused + "\n"


@pytest.mark.parametrize(
    ("answer", "refusal"),
    [
        # RFC 9309: any 4xx except 429 means no robots.txt
        (_http_error(401, f"{WPP}/robots.txt"), None),
        (_http_error(403, f"{WPP}/robots.txt"), None),
        (_http_error(404, f"{WPP}/robots.txt"), None),
        (_http_error(410, f"{WPP}/robots.txt"), None),
        (_http_error(429, f"{WPP}/robots.txt"), "returned HTTP 429"),
        (_http_error(503, f"{WPP}/robots.txt"), "returned HTTP 503"),
        (requests.HTTPError("no response attached"), "returned HTTP None"),
        (requests.ConnectionError("boom"), "ConnectionError: boom"),
    ],
)
def test_robots_errors(route, capsys, answer, refusal):
    log = route({
        f"{WPP}/robots.txt": answer,
        f"{WPP}/en/doc": _response(DOC_HTML, f"{WPP}/en/doc", "text/html"),
    })
    code = verify_quote.main(["--company", "WPP", "--text", f"{WPP}/en/doc"])
    out = capsys.readouterr().out
    if refusal:
        assert code == 2 and out.startswith("REFUSED: robots.txt on www.wpp.com") and refusal in out
        assert log == [f"{WPP}/robots.txt"]
    else:
        assert code == 0 and "DOCUMENT BODY" in out


def test_crawl_delay_sleeps_before_fetch(route, capsys):
    log = route({
        f"{WPP}/robots.txt": _text("User-agent: *\nCrawl-delay: 10\n", f"{WPP}/robots.txt"),
        f"{WPP}/en/doc": _response(DOC_HTML, f"{WPP}/en/doc", "text/html"),
    })
    quote = "management words about strategy"
    assert verify_quote.main(["--company", "WPP", f"{WPP}/en/doc", quote]) == 0
    assert log == [f"{WPP}/robots.txt", "sleep 10.0", f"{WPP}/en/doc"]
    assert "[1] FOUND" in capsys.readouterr().out


def test_redirect_to_odd_path_refused_before_extract(route, capsys):
    route({
        f"{WPP}/robots.txt": _text("User-agent: *\nDisallow: /private/\n", f"{WPP}/robots.txt"),
        f"{WPP}/en/doc": _response(DOC_HTML, f"{WPP}//private/doc", "text/html"),
    })
    assert verify_quote.main(["--company", "WPP", "--text", f"{WPP}/en/doc"]) == 2
    out = capsys.readouterr().out
    assert out == f"REFUSED: URL path has a '.' or '..' segment or '//': {WPP}//private/doc\n"


# quotes never travel on the shell command line: /curate passes them on stdin (<<'EOF')

DOLLAR_HTML = b"<p>Revenue of $15.7 billion for the full year, up 4.1% organically.</p>"
DOLLAR_QUOTE = "Revenue of $15.7 billion for the full year"


def test_quotes_from_stdin_keep_dollar_signs(serve, monkeypatch, capsys):
    serve(_response(DOLLAR_HTML, "https://example.com/q3", "text/html"))
    stdin = f"{DOLLAR_QUOTE}\n\n  a sentence that is not there at all  \n"
    monkeypatch.setattr("sys.stdin", io.StringIO(stdin))
    assert verify_quote.main(["--quotes", "-", "https://example.com/q3"]) == 1
    out = capsys.readouterr().out
    assert "[1] FOUND" in out and "revenue of $15.7 billion" in out
    assert "[2] NOT FOUND" in out and "[3]" not in out  # blank lines are skipped


def test_quotes_from_file(serve, tmp_path, capsys):
    serve(_response(DOLLAR_HTML, "https://example.com/q3", "text/html"))
    path = tmp_path / "quotes.txt"
    path.write_text(DOLLAR_QUOTE + "\n", encoding="utf-8")
    assert verify_quote.main(["--quotes", str(path), "https://example.com/q3"]) == 0
    assert "[1] FOUND" in capsys.readouterr().out


def test_quotes_option_and_arguments_are_exclusive(capsys):
    with pytest.raises(SystemExit):
        verify_quote.main(["--quotes", "-", "https://example.com/q3", DOLLAR_QUOTE])
    assert "not both" in capsys.readouterr().err
