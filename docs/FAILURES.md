# Failures and fixes

One entry per surprise. Date, source, symptom, what was tried, what worked. This file is
quoted in the README, so write it for a reader who was not there.

| Date | Source | Symptom | Fix or workaround |
|------|--------|---------|-------------------|
| 2026-10-06 | Stooq | CSV endpoint returned access denied from a browser; robots.txt disallows the path | Dropped Stooq. yfinance primary with committed history and one-day appends; Alpha Vantage free key named as fallback. |
| 2026-10-06 | yfinance (HAVAS.AS) | Backfill market cap ~19.7bn USD, about 10x too high. Closes ~EUR 17 since listing although Havas listed near EUR 1.8 | Havas did a 1:10 reverse split on 2025-11-18; yfinance split-adjusts history. Config `shares_outstanding_m` was the pre-split ~1000m; set to 97.7m (Yahoo count, still unverified until step 11). |
| 2026-10-06 | yfinance (FX pairs) | `end=today` did not exclude today: FX trades 24h and returned a bar dated today | Backfill and fetch_latest_closes both drop rows dated >= today UTC explicitly. |
