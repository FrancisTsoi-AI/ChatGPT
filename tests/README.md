# Tests

Six scripts, all plain Node (no framework). They need a **throw-away database** (they create and delete
data) and the dev server running.

```bash
# 1. dev server with small upload limits so the chunked path is exercised
(cd public && php -S 127.0.0.1:8080 -d upload_max_filesize=2M -d post_max_size=3M) &

# 2. API / gateway rules: lockout, CSRF, validation, transactions, trash, purge, uploads, disk cleanup
STORAGE=private/storage MYSQL="mysql homebase" node tests/api.cjs

# 3. browser end-to-end (Chromium via Playwright): drag, resize, trash, undo, upload, music, search, phone layout
PLAYWRIGHT_PATH=/path/to/node_modules/playwright CHROME=/path/to/chrome node tests/e2e.cjs
```

```bash
# 4. the extra tiles: needs a SECOND dev server that may fetch from the fake RSS/weather server the test starts on :9099
(cd public && HB_ALLOW_PRIVATE_FETCH=1 HB_OPENMETEO_FORECAST=http://127.0.0.1:9099/forecast \
  HB_OPENMETEO_GEOCODE=http://127.0.0.1:9099/geocode php -S 127.0.0.1:8082 -d upload_max_filesize=2M -d post_max_size=3M) &
BASE=http://127.0.0.1:8082 PLAYWRIGHT_PATH=... CHROME=... node tests/gadgets.cjs     # runs the browser in UTC+8 on purpose
```
```bash
# 5. round 3: gadget modules, embed check + copy, mp3, Toolbox open-all / icons, Writer (rich, HTML + JS sandbox, code),
#    YouTube playlist, delete scenario, share links (password, expiry, read-only scope), sign out on all devices.
#    Same second server; also needs the mysql CLI (to expire a link). Browser runs in Asia/Singapore time.
BASE=http://127.0.0.1:8082 STORAGE=private/storage MYSQL="mysql homebase" PLAYWRIGHT_PATH=... CHROME=... node tests/v3.cjs
```
```bash
# 6. Files gadget folders: create, open, nest, drag + menu moves, delete folder (+ undo), upload into a folder, folder drop,
#    zip paths, share page. Main server (:8080), fresh DB, needs nothing else.
PLAYWRIGHT_PATH=... CHROME=... node tests/folders.cjs
```
Before each browser suite, empty the tables **and** `private/storage/cache/` (the server caches what it fetched for
6–24 h by address, so a cached answer from another suite's fake server would be served).

`HB_ALLOW_PRIVATE_FETCH=1` switches off the "no private addresses" guard and exists **only for this test**: never put it in a real `.env`.
The main server (:8080, without it) is the one `api.cjs` uses to prove the guard works.

Environment: `BASE` (default `http://localhost:8080`), `PASS` (default `test-passphrase-123`; the dev
`private/.env` must hold its hash). `api.cjs` also needs the `mysql` CLI to age rows for the 30-day purge.
`e2e.cjs`, `gadgets.cjs` and `v3.cjs` expect a freshly seeded (empty) database: truncate the tables first, e.g.
`mysql homebase -e "SET FOREIGN_KEY_CHECKS=0; TRUNCATE files; TRUNCATE links; TRUNCATE tasks; TRUNCATE thoughts; TRUNCATE entries; TRUNCATE shares; TRUNCATE tiles; TRUNCATE scenarios; TRUNCATE settings; SET FOREIGN_KEY_CHECKS=1"`
and delete the files in `private/storage/{files,ratelimit,tmp,cache}`.
