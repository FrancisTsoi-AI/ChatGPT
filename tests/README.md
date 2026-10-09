# Tests

Eight scripts, all plain Node (no framework). They need a **throw-away database** (they create and delete
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
# 6. round 4: the document editor (Markdown shortcuts, toolbar, tables, links, pictures, find/replace, source, undo), the Writer folder
#    (pages, folders, drag, filter, search, move a Writer in, share page) and scenario groups. Main server, no fake sites needed.
BASE=http://127.0.0.1:8080 PLAYWRIGHT_PATH=... CHROME=... node tests/v4.cjs
```
```bash
# 7. round 5: gadgets as plug-ins (install/update from zip, bad zips, isolation, switch off, delete, share limits).
#    It installs and deletes gadgets, so its server uses a SCRATCH gadgets folder (the test refills it from private/gadgets):
(cd public && HB_GADGETS_DIR=/tmp/hb-gadgets php -S 127.0.0.1:8084 -d upload_max_filesize=25M -d post_max_size=26M) &
python3 tools/build-zip.py   # the test also checks every dist/gadgets/*.zip installs
GADGETS_DIR=/tmp/hb-gadgets BASE=http://127.0.0.1:8084 STORAGE=private/storage PLAYWRIGHT_PATH=... CHROME=... node tests/v5.cjs
```
```bash
# 8. round 6: the one-file installer and web updates. Builds real sites in a scratch folder with their own PHP servers
#    (ports 8086-8088): a new site from dist/homebase-setup.php, updates by dropping a file, the built-in catalog, installer
#    safety and expiry, and old sites (versions 1, 2 and 4, taken from git history) updated with the one file.
#    Needs the mysql CLI with admin rights (it creates homebase_v6 / homebase_v6_old for the DB user in private/.env).
python3 tools/build-zip.py
PLAYWRIGHT_PATH=... CHROME=... node tests/v6.cjs
```
```bash
# 9. Files gadget folders: create, open, nest, drag + menu moves, delete folder (+ undo), upload into a folder, folder drop,
#    zip paths, share page. Main server (:8080), fresh DB, needs nothing else.
PLAYWRIGHT_PATH=... CHROME=... node tests/folders.cjs
```
Before each browser suite, empty the tables **and** `private/storage/cache/` (the server caches what it fetched for
6–24 h by address, so a cached answer from another suite's fake server would be served).

`HB_ALLOW_PRIVATE_FETCH=1` switches off the "no private addresses" guard and exists **only for this test**: never put it in a real `.env`.
The main server (:8080, without it) is the one `api.cjs` uses to prove the guard works.

Environment: `BASE` (default `http://localhost:8080`), `PASS` (default `test-passphrase-123`; the dev
`private/.env` must hold its hash). `api.cjs` also needs the `mysql` CLI to age rows for the 30-day purge.
`e2e.cjs`, `gadgets.cjs`, `v3.cjs`, `v4.cjs` and `v5.cjs` expect a freshly seeded (empty) database: truncate the tables first, e.g.
`mysql homebase -e "SET FOREIGN_KEY_CHECKS=0; TRUNCATE files; TRUNCATE links; TRUNCATE tasks; TRUNCATE thoughts; TRUNCATE entries; TRUNCATE shares; TRUNCATE tiles; TRUNCATE scenarios; TRUNCATE settings; SET FOREIGN_KEY_CHECKS=1"`
and delete the files in `private/storage/{files,ratelimit,tmp,cache}`.
