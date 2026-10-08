"""Check that quotes appear verbatim (after normalizing) in a public HTML or PDF document.
Run: python -m pipeline.verify_quote <url> "<quote>" ["<quote>" ...]
     python -m pipeline.verify_quote --text <url>   (cleaned text and PDF links, for /curate)
Exit 0 all found, 1 any not found, 2 fetch/extraction error or quote too short."""

import argparse
import difflib
import io
import re
import sys
import unicodedata
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from core.util import fetch

MIN_QUOTE = 20
CONTEXT = 80
WINDOW = 120
WINDOW_STEP = 20
TEXT_LIMIT = 60000
MAX_LINKS = 20

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


def _print_text(text: str, links: list[str]) -> None:
    shown = clean(text)
    print(shown[:TEXT_LIMIT])
    if len(shown) > TEXT_LIMIT:
        print(f"[truncated: {TEXT_LIMIT} of {len(shown)} chars]")
    print("LINKS:")
    print("\n".join(links) if links else "(none)")


def main(argv: list[str] | None = None) -> int:
    """Run the CLI; return the worst exit code across all quotes (0 found, 1 missing, 2 error)."""
    parser = argparse.ArgumentParser(prog="verify_quote", description=__doc__)
    parser.add_argument("--text", action="store_true", help="print the cleaned document text")
    parser.add_argument("url")
    parser.add_argument("quotes", nargs="*")
    args = parser.parse_args(argv)
    if not args.text and not args.quotes:
        parser.error("give at least one quote, or --text")

    codes: dict[int, int] = {}
    for i, quote in enumerate(args.quotes, 1):
        if len(normalize(quote)) < MIN_QUOTE:
            print(f"[{i}] quote too short to verify")
            codes[i] = 2
    if not args.text and len(codes) == len(args.quotes):
        return 2

    try:
        text, links = extract(fetch(args.url))
    except Exception as e:  # noqa: BLE001 - any fetch or parse failure is reported as exit 2
        print(f"ERROR: {type(e).__name__}: {e}")
        return 2

    if args.text:
        _print_text(text, links)
        return 0

    doc = normalize(text)
    for i, quote in enumerate(args.quotes, 1):
        if i in codes:
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
