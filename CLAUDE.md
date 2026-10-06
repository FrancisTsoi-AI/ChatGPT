# Home Base — notes for Claude Code sessions

Private start page at **task.francistsoi.com** (a subdomain, so the app lives at the web root `/`).
Tiles on a drag-and-drop grid, one layout per scenario (Work, Idea, PhD, more). Shared hosting:
**PHP 8.0+, MySQL/MariaDB, plain JavaScript, no build step.** Read this file, then the stage you are asked for.
Full user docs: README.md. Deployment: DEPLOY.md. Roadmap source: `docs/Home_Base_front_page_roadmap.docx`.

## Status
All roadmap stages S0–S15+ are built and tested (login, gateway, grid, scenarios, toolbox, to-do,
thoughts, clock, countdown, files + chunked upload, music, trash + 30-day purge, undo/redo, colours/tags,
dark mode, search + Ctrl+K, phone layout, backup, shared tiles, previews). Next work = whatever the user asks.

## Layout
```
public/    → web root of the subdomain (zip: web/)       private/ → outside web (zip: homebase-private/)
  index.php  login page or the app shell                    src/config.php  .env parser, paths
  api.php    JSON gateway (?r=state|batch|trash|search|     src/db.php      PDO (utf8mb4, UTC session)
             upload|upload-chunk|auth/*)                    src/http.php    HttpError, json, headers, CSP
  file.php   serve a file by id (login, Range, nosniff)     src/auth.php    sessions, CSRF, rate limit
  export.php JSON / zip backup                              src/data.php    table spec, state, batch ops, trash, search
  setup.php  host check + passphrase hash (404 once set)    src/files.php   upload, chunks, serve, zip
  _boot.php  finds the private folder                       src/setup.php   host checks (web + CLI)
  js/ css/ vendor/ (GridStack 11, SortableJS 1)             bin/            check-host.php, hash-passphrase.php
schema.sql  7 tables      tests/  api.cjs, e2e.cjs      tools/build-zip.py  → dist/*.zip
```
Private folder is found via `HB_PRIVATE_DIR`, a `public/.private-path` file, or `../homebase-private`, `../private` (up to 3 levels).

## Data model (schema.sql)
`scenarios`, `tiles` (x,y,width,height on a 12-col grid, `settings` JSON text), `links`, `tasks`, `files`, `thoughts`, `settings`.
All but `settings` have id, created_at, updated_at, `deleted_at` (= in trash; purged after `HB_TRASH_DAYS`, checked once a day in `hb_state`).
Deviations from the roadmap table (deliberate): content rows (links/tasks/files/thoughts) hang off **`tile_id`**, not scenario;
`files.position` orders files and music playlists; links/tasks/files/thoughts also carry `colour`/`tags`; `links.kind` can be `header`;
tiles with `settings.shared_from = <tile id>` are **mirror tiles** (same content shown in another scenario); `settings.m_order` = phone order.
To-do buckets live in the tile's `settings.buckets` (ids urgent/later/brainoff/none + custom); countdown dates in `settings.items`.

## API (public/api.php) — all JSON
* GET `state` full snapshot (also seeds the 3 scenarios on first run, runs the daily purge). GET `trash`, `search&q=`.
* POST `batch` `{ops:[{op:create|update|delete|restore|purge|setting,...}]}` — one transaction; only whitelisted columns
  (`hb_spec()` in data.php) are writable; `delete` is soft; `purge` only works on trashed rows and unlinks stored files.
* POST `upload` (multipart, whole file) and `upload-chunk` (upload_id, offset, total, name, tile_id, file) — ordered chunks, 409 otherwise.
* Writes need header `X-CSRF-Token`. Method override via `X-HTTP-Method-Override`. 401 = not signed in (client reloads to login).
* Sessions: PHP file sessions in `private/storage/sessions`, 90-day rolling cookie; 5 wrong tries → 15 min lock per IP (`storage/ratelimit`).

## Front end (classic scripts, global `HB`, loaded in order by index.php)
* `store.js` — the only state holder. `HB.store.update/create/remove/restore/reorder/setSetting`. Updates are optimistic and coalesced,
  sent 1 s after the last change; create awaits the server (needs the id); failures retry with backoff; `sync()` re-reads on focus / every 30 s;
  localStorage cache (`hb:cache:v1`) paints the page before the network answers. `HB.history` = in-session undo/redo (`history.run(label, fn)` groups).
* `grid.js` (`HB.board`) — GridStack on ≥900 px, stacked Sortable list below. `reconcile()` makes the DOM match the store (rAF-throttled;
  skipped while a drag is active). Tile bodies are rebuilt only when `HB.tileSig` changes. Never mutate the DOM of a tile and forget the store.
* `tiles/*.js` — `HB.registerTile(type, {w,h,render(body,ctx),menu(tile,ctx)})`. `ctx.src` is the tile that owns the content (mirrors!), so always
  use `ctx.id`/`ctx.items()`, not `ctx.tile.id`, for content. Use `HB.sortable` + `HB.listDrop` for draggable lists, `HB.onCleanup` for timers.
* `ui.js` — toast, modal, form, confirm, context menu, inlineEdit. `trash.js` — trash zone hit-test + dialog. `upload.js` — queue, chunking, drop anywhere.
* `HB.h(tag, props, ...kids)` builds DOM; `draggable:false` must reach the element (anchors are natively draggable and break Sortable otherwise).
* To add a tile type: register it (new file in `js/tiles/`, add to `index.php`), add its name to `HB_TILE_TYPES` in data.php and to `HB.typeInfo` in util.js.

## Commands
```bash
mysql homebase < schema.sql                        # local DB (see README "Run it locally"); private/.env holds creds + hash
(cd public && php -S 127.0.0.1:8080 -d upload_max_filesize=2M -d post_max_size=3M)
node tests/api.cjs                                 # gateway rules (needs mysql CLI)           — see tests/README.md
node tests/e2e.cjs                                 # browser e2e (Playwright + Chromium; fresh/empty DB)
python3 tools/build-zip.py                         # dist/homebase-task.francistsoi.com.zip (never includes .env or storage data)
```
Run both tests before committing a behaviour change; rebuild and commit the zip when public/ or private/ changes.

## Rules of the house
* Secrets only in `private/.env` (gitignored). Never log or echo them. Files live in `private/storage/files` under random 32-hex names.
* Every endpoint except auth/status+login needs a session; every non-GET needs CSRF. Keep it that way.
* No build step, no npm at runtime: vendored libs stay in `public/vendor/`. Keep PHP 8.0 compatible (no `never`, enums, readonly).
* Keep this file under ~200 lines; update "Status" and "Deviations" when you change them.
