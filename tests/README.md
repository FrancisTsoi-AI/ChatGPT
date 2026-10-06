# Tests

Two scripts, both plain Node (no framework). They need a **throw-away database** (they create and delete
data) and the dev server running.

```bash
# 1. dev server with small upload limits so the chunked path is exercised
(cd public && php -S 127.0.0.1:8080 -d upload_max_filesize=2M -d post_max_size=3M) &

# 2. API / gateway rules: lockout, CSRF, validation, transactions, trash, purge, uploads, disk cleanup
STORAGE=private/storage MYSQL="mysql homebase" node tests/api.cjs

# 3. browser end-to-end (Chromium via Playwright): drag, resize, trash, undo, upload, music, search, phone layout
PLAYWRIGHT_PATH=/path/to/node_modules/playwright CHROME=/path/to/chrome node tests/e2e.cjs
```

Environment: `BASE` (default `http://localhost:8080`), `PASS` (default `test-passphrase-123`; the dev
`private/.env` must hold its hash). `api.cjs` also needs the `mysql` CLI to age rows for the 30-day purge.
`e2e.cjs` expects a freshly seeded (empty) database: truncate the tables first.
