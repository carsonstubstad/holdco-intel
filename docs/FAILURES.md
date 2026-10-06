# Failures and fixes

One entry per surprise. Date, source, symptom, what was tried, what worked. This file is
quoted in the README, so write it for a reader who was not there.

| Date | Source | Symptom | Fix or workaround |
|------|--------|---------|-------------------|
| 2026-10-06 | Stooq | CSV endpoint returned access denied from a browser; robots.txt disallows the path | Dropped Stooq. yfinance primary with committed history and one-day appends; Alpha Vantage free key named as fallback. |
| 2026-10-06 | yfinance (HAVAS.AS) | Backfill market cap ~19.7bn USD, about 10x too high. Closes ~EUR 17 since listing although Havas listed near EUR 1.8 | Havas did a 1:10 reverse split on 2025-11-18; yfinance split-adjusts history. Config `shares_outstanding_m` was the pre-split ~1000m; set to 97.7m (Yahoo count, still unverified until step 11). |
| 2026-10-06 | yfinance (FX pairs) | `end=today` did not exclude today: FX trades 24h and returned a bar dated today | Backfill and fetch_latest_closes both drop rows dated >= today UTC explicitly. |
| 2026-10-06 | Google News RSS | news.google.com/robots.txt has `User-agent: *` `Disallow: /` with no Allow for /rss; robotparser returns can_fetch=False for /rss/search | Respected robots.txt: news collector (step 04) parked, Google News `site:` press release fallback removed. Press releases come only from each company's own IR site. |
| 2026-10-06 | Omnicom IR (press releases) | Configured `omnicomgroup.com/newsroom/` returns 404 (site moved to omc.com); `investor.omnicomgroup.com` returns 403 (Cloudflare challenge). `www.omc.com/feed/` is valid WordPress RSS but carries awards and marketing posts, not results | Channel **rss**: the Q4 IR platform feed `investor.omc.com/rss/pressrelease.aspx` (robots allows, Crawl-delay 10, one fetch per run). It returns exactly 10 items including results and dividends. Config URL fixed. Zero parsed items raises. |
| 2026-10-06 | WPP (press releases) | No feed on wpp.com: no `<link rel=alternate>`, `/rss`, `/en/rss` and `/en/news/rss` return 404, and the sitemap has no titles | Channel **html**: `www.wpp.com/en/news` is server-rendered Next.js with 12 news anchors (titles) in the raw HTML. Publish dates sit in the inline `self.__next_f` payload of the same response (`PageNewsArticle.publishDate`, keyed by slug), parsed as JSON. No pagination (`?page=2` returns the same 12). Anchors with no dates raise, so a format change shows as a failure. |
