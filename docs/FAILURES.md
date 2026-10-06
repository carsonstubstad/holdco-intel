# Failures and fixes

One entry per surprise. Date, source, symptom, what was tried, what worked. This file is
quoted in the README, so write it for a reader who was not there.

| Date | Source | Symptom | Fix or workaround |
|------|--------|---------|-------------------|
| 2026-10-06 | Stooq | CSV endpoint returned access denied from a browser; robots.txt disallows the path | Dropped Stooq. yfinance primary with committed history and one-day appends; Alpha Vantage free key named as fallback. |
