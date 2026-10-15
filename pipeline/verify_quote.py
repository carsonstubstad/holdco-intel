"""Check that quotes appear verbatim (after normalizing) in a public HTML or PDF document.
Run: python -m pipeline.verify_quote [--company CODE] --quotes - <url> <<'EOF'
     (one quote per line on stdin; --quotes FILE reads a file; /curate always uses this form)
     python -m pipeline.verify_quote [--company CODE] --text [--from N] <url>
       (cleaned text from character N, and PDF links, for /curate)
     python -m pipeline.verify_quote <url> "<quote>" ...   (tests and hand checks only)
The line starting 'URL:' gives the final URL after redirects. --company refuses a malformed
URL, or one off that company's registered domain, before any fetch; it refuses a URL that
robots.txt on its host disallows for our User-Agent before downloading it (requested URL) or
before extracting or printing anything (final URL after redirects).
Exit 0 all found, 1 any not found, 2 fetch/extraction error, refusal or quote too short."""

import argparse
import difflib
import functools
import io
import re
import sys
import time
import unicodedata
from urllib.parse import unquote, urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

from core.config import get_company, load_watchlist
from core.util import fetch

MIN_QUOTE = 20
CONTEXT = 80
WINDOW = 120
WINDOW_STEP = 20
TEXT_LIMIT = 60000
MAX_LINKS = 20
ROBOTS_REFUSE = (401, 403, 429)

INVISIBLE = dict.fromkeys(map(ord, "\u00ad\u200b\u200c\u200d\u2060\ufeff"))
PUNCTUATION = str.maketrans(
    {
        **dict.fromkeys("\u2018\u2019\u201a\u201b\u2032", "'"),
        **dict.fromkeys("\u201c\u201d\u201e\u201f\u2033", '"'),
        **dict.fromkeys("\u2010\u2011\u2012\u2013\u2014\u2015\u2212", "-"),
    }
)


def _is_pdf(resp: requests.Response) -> bool:
    return "pdf" in resp.headers.get("Content-Type", "").lower() or urlparse(
        resp.url or ""
    ).path.lower().endswith(".pdf")


def extract(resp: requests.Response) -> tuple[str, list[str]]:
    """Return (raw document text, absolute http(s) .pdf links) for an HTML or PDF response."""
    links: list[str] = []
    if _is_pdf(resp):
        import pdfplumber  # dev dependency: only /curate runs this module

        with pdfplumber.open(io.BytesIO(resp.content)) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        text = re.sub(r"-\n\s*", "", text)
    else:
        soup = BeautifulSoup(resp.content, "html.parser")
        for tag in soup(["script", "style"]):
            tag.decompose()
        text = soup.get_text(" ")
        for a in soup.find_all("a", href=True):
            link = urljoin(resp.url or "", a["href"].strip())
            parsed = urlparse(link)
            is_pdf = parsed.scheme in ("http", "https") and parsed.path.lower().endswith(".pdf")
            if is_pdf and link not in links:
                links.append(link)
        links = links[:MAX_LINKS]
    if not text.strip():
        raise ValueError("no text extracted")
    return text, links


def clean(text: str) -> str:
    """Return the display form: NFKC, invisible characters removed, whitespace collapsed."""
    text = unicodedata.normalize("NFKC", text).translate(INVISIBLE)
    return " ".join(text.split())


def normalize(text: str) -> str:
    """Return the match form: clean(), lowercase, straight quotes, ASCII dashes, '4 %' as '4%'."""
    text = clean(text).lower().translate(PUNCTUATION).replace(" %", "%")
    return " ".join(text.split())


def find(doc: str, quote: str) -> tuple[bool, str | list[str]]:
    """Return (True, hit with context) or (False, the 3 closest non-overlapping windows)."""
    at = doc.find(quote)
    if at >= 0:
        return True, doc[max(0, at - CONTEXT) : at + len(quote) + CONTEXT]
    starts = range(0, max(1, len(doc) - WINDOW + WINDOW_STEP), WINDOW_STEP)
    scored = sorted(
        ((difflib.SequenceMatcher(None, quote, doc[s : s + WINDOW]).ratio(), s) for s in starts),
        reverse=True,
    )
    best: list[int] = []
    for _, s in scored:
        if all(abs(s - b) >= WINDOW for b in best):
            best.append(s)
        if len(best) == 3:
            break
    for _, s in scored:  # short documents: fill with overlapping windows
        if len(best) == 3:
            break
        if s not in best:
            best.append(s)
    return False, [doc[s : s + WINDOW] for s in best]


def registered_domain(host: str) -> str:
    """Return the last two labels of a host name, lowercased ('investor.omc.com' -> 'omc.com')."""
    return ".".join(host.lower().rstrip(".").split(".")[-2:])


def check_domain(code: str, url: str) -> str | None:
    """Return a REFUSED line for a malformed URL or one off the company's registered domain."""
    try:
        company = get_company(code)
    except KeyError:
        return f"REFUSED: unknown company code {code!r}"
    # urlparse strips tabs and newlines and reads 'evil.net\@host' as host; urllib3 does not
    if any(ch == "\\" or ch.isspace() or not ch.isprintable() for ch in url):
        return "REFUSED: URL contains a backslash, whitespace or a control character"
    try:
        parsed = urlparse(url)
        host = parsed.hostname
    except ValueError as e:
        return f"REFUSED: URL does not parse: {e}"
    if parsed.scheme not in ("http", "https") or not host:
        return f"REFUSED: not an http(s) URL with a host: {url}"
    if "@" in parsed.netloc:
        return f"REFUSED: URL has a user-info part (@): {url}"
    if _odd_path(parsed.path):
        return f"REFUSED: URL path has a '.' or '..' segment or '//': {url}"
    want = registered_domain(urlparse(company["press_releases"]["url"]).hostname or "")
    if registered_domain(host) != want:
        return f"REFUSED: {host} is not on {want}, the registered domain of {company['code']}"
    return None


def _odd_path(path: str) -> bool:
    """True when a path has '.' or '..' segments (also percent-encoded) or '//': the path
    checked against robots.txt would not be the path the server serves."""
    return "//" in path or any(unquote(s) in (".", "..") for s in path.split("/"))


@functools.cache
def _agent() -> str:
    return load_watchlist()["dashboard"]["user_agent"]


def _disallows(text: str, agent: str) -> list[str]:
    """Return the Disallow paths of every robots.txt group that applies to agent, merged: the
    groups naming it, else every '*' group; a leading BOM and comments are ignored."""
    token = agent.split("/")[0].lower()
    groups: list[tuple[set[str], list[str]]] = []
    in_agents = False
    for line in text.lstrip("\ufeff").splitlines():
        key, _, value = line.split("#", 1)[0].partition(":")
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            if not in_agents:
                groups.append((set(), []))
                in_agents = True
            groups[-1][0].add(value.lower())
        elif key in ("allow", "disallow", "crawl-delay"):
            in_agents = False
            if key == "disallow" and value and groups:
                groups[-1][1].append(value)
    named = [g for g in groups if any(a and a != "*" and a in token for a in g[0])]
    chosen = named or [g for g in groups if "*" in g[0]]
    return [rule for _, rules in chosen for rule in rules]


def _robots(url: str, cache: dict) -> tuple[RobotFileParser, list[str]] | str:
    """Return (stdlib parser, our Disallow rules) for robots.txt on url's host, cached per host,
    or a REFUSED line."""
    parsed = urlparse(url)
    root = f"{parsed.scheme}://{parsed.netloc}"
    if root in cache:
        return cache[root]
    rp = RobotFileParser()
    try:
        text = fetch(f"{root}/robots.txt").text.lstrip("\ufeff")
        rp.parse(text.splitlines())
        cache[root] = (rp, _disallows(text, _agent()))
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else None
        if status is not None and 400 <= status < 500 and status not in ROBOTS_REFUSE:
            rp.parse([])  # no robots.txt: nothing is disallowed
            cache[root] = (rp, [])
        else:
            cache[root] = f"REFUSED: robots.txt on {parsed.hostname} returned HTTP {status}"
    except Exception as e:  # noqa: BLE001 - an unreadable robots.txt refuses, never allows
        cache[root] = f"REFUSED: robots.txt on {parsed.hostname}: {type(e).__name__}: {e}"
    return cache[root]


def _rule_pattern(rule: str) -> re.Pattern:
    """Compile a robots.txt path rule: '*' is any run of characters, a trailing '$' ends it."""
    anchored = rule.endswith("$")
    body = rule[:-1] if anchored else rule
    return re.compile(".*".join(map(re.escape, body.split("*"))) + ("$" if anchored else ""))


def check_robots(url: str, cache: dict) -> str | None:
    """Return a REFUSED line when robots.txt on url's host disallows it for our User-Agent;
    any matching Disallow refuses, even where an Allow line or the stdlib parser would not."""
    robots = _robots(url, cache)
    if isinstance(robots, str):
        return robots
    rp, rules = robots
    parsed = urlparse(url)
    if _odd_path(parsed.path):
        return f"REFUSED: URL path has a '.' or '..' segment or '//': {url}"
    target = unquote(parsed.path or "/") + (f"?{parsed.query}" if parsed.query else "")
    for rule in rules:
        if _rule_pattern(unquote(rule)).match(target):
            return f"REFUSED: robots.txt on {parsed.hostname} disallows {url} (Disallow: {rule})"
    if not rp.can_fetch(_agent(), url):
        return f"REFUSED: robots.txt on {parsed.hostname} disallows {url}"
    return None


def _print_text(text: str, links: list[str], start: int = 0) -> bool:
    """Print TEXT_LIMIT cleaned characters from start, then the links; False if start is past
    the end."""
    shown = clean(text)
    if start and start >= len(shown):
        print(f"[--from {start} is past the end: {len(shown)} chars]")
        return False
    end = start + TEXT_LIMIT
    print(shown[start:end])
    if len(shown) > end:
        print(f"[truncated: showing {start} to {end} of {len(shown)} chars; next: --from {end}]")
    print("LINKS:")
    print("\n".join(links) if links else "(none)")
    return True


def main(argv: list[str] | None = None) -> int:
    """Run the CLI; return the worst exit code across all quotes (0 found, 1 missing, 2 error)."""
    parser = argparse.ArgumentParser(prog="verify_quote", description=__doc__)
    parser.add_argument("--text", action="store_true", help="print the cleaned document text")
    parser.add_argument(
        "--from", dest="start", type=int, metavar="N", help="with --text: start at character N"
    )
    parser.add_argument(
        "--company", metavar="CODE", help="refuse URLs off CODE's domain or barred by robots.txt"
    )
    parser.add_argument(
        "--quotes", metavar="FILE", help="read quotes one per line from FILE ('-' for stdin)"
    )
    parser.add_argument("url")
    parser.add_argument("quotes_args", nargs="*", metavar="quotes")
    args = parser.parse_args(argv)
    if args.quotes is not None and args.quotes_args:
        parser.error("give quotes with --quotes or as arguments, not both")
    quotes = args.quotes_args
    if args.quotes is not None:
        if args.quotes == "-":
            lines = sys.stdin.read()
        else:
            with open(args.quotes, encoding="utf-8") as f:
                lines = f.read()
        quotes = [line.strip() for line in lines.splitlines() if line.strip()]
    if not args.text and not quotes:
        parser.error("give at least one quote, or --text")
    if args.start is not None and (not args.text or args.start < 0):
        parser.error("--from N needs --text and N >= 0")
    company = args.company is not None  # an empty code is refused as unknown, never skipped

    if company:
        refusal = check_domain(args.company, args.url)
        if refusal:
            print(refusal)
            return 2

    short = {i for i, quote in enumerate(quotes, 1) if len(normalize(quote)) < MIN_QUOTE}
    if not args.text and len(short) == len(quotes):
        for i in sorted(short):
            print(f"[{i}] quote too short to verify")
        return 2

    robots: dict = {}
    if company:
        refusal = check_robots(args.url, robots)
        if refusal:
            print(refusal)
            return 2
        delay = _robots(args.url, robots)[0].crawl_delay(_agent())
        if delay:
            time.sleep(float(delay))

    try:
        resp = fetch(args.url)
        refusal = check_robots(resp.url, robots) if company else None
        if refusal:
            print(refusal)
            return 2
        text, links = extract(resp)
    except Exception as e:  # noqa: BLE001 - any fetch or parse failure is reported as exit 2
        print(f"ERROR: {type(e).__name__}: {e}")
        return 2

    print(f"URL: {resp.url}")
    if args.text:
        return 0 if _print_text(text, links, args.start or 0) else 2

    doc = normalize(text)
    codes: dict[int, int] = {}
    for i, quote in enumerate(quotes, 1):
        if i in short:
            print(f"[{i}] quote too short to verify")
            codes[i] = 2
            continue
        found, detail = find(doc, normalize(quote))
        if found:
            print(f"[{i}] FOUND\n    ...{detail}...")
            codes[i] = 0
        else:
            print(f"[{i}] NOT FOUND; closest:")
            for window in detail:
                print(f"    {window}")
            codes[i] = 1
    return max(codes.values())


if __name__ == "__main__":
    sys.exit(main())
