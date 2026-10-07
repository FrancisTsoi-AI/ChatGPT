# Home Base — notes for Claude Code sessions

Private start page at **task.francistsoi.com** (a subdomain, so the app lives at the web root `/`).
Tiles on a drag-and-drop grid, one layout per scenario (Work, Idea, PhD, more). Shared hosting:
**PHP 8.0+, MySQL/MariaDB, plain JavaScript, no build step.** Read this file, then the stage you are asked for.
Full user docs: README.md. Deployment: DEPLOY.md. Roadmap source: `docs/Home_Base_front_page_roadmap.docx`.
**Gadget interface: `docs/GADGET_API.md`.** To work on ONE gadget, read that file plus `public/gadgets/<type>/` (its README.md first)
and `private/gadgets/<type>.php`. You do not need the rest of the code base for that. The user is in Singapore (UTC+8); never assume a city.

## Status
All roadmap stages S0–S15+ are built and tested (login, gateway, grid, scenarios, toolbox, to-do,
thoughts, clock, countdown, files + chunked upload, music, trash + 30-day purge, undo/redo, colours/tags,
dark mode, search + Ctrl+K, phone layout, backup, shared tiles, previews).
**Gadget pack (v2)** also built and tested: flashcards (SM-2 style), quotes (separate source), Markdown note, reading list, timer
(up/down), time log, habit tracker, stats, embed (YouTube/Spotify/web), search box (libraries, learn-a-pattern), RSS feeds, weather,
sketch board, emoji picker for toolbox links, enlarge/restore for every tile.
**Round 3** built and tested (`tests/v3.cjs`): gadgets are modules (folder + manifest + class, bundled by `assets.php`); Writer
(rich text / HTML + JS run sandboxed / code; double-click or double-tap empty space adds one); YouTube playlist; Toolbox *Open all* +
icon view; mp3 recognised by name; embed frame check + sandboxed copy + YouTube referrer fix (Error 153); delete scenario; sign out on
all devices (session epoch); password + expiry share links at `/<name>` (read-only visitors). Next work = whatever the user asks.

## Layout
```
public/    → web root of the subdomain (zip: web/)       private/ → outside web (zip: homebase-private/)
  index.php  login page or the app shell                    src/config.php  .env parser, paths
  api.php    JSON gateway (?r=state|batch|trash|search|     src/db.php      PDO (utf8mb4, UTC session)
             upload|upload-chunk|auth/*|shares*|g/…)        src/http.php    HttpError, json, headers, CSP
  assets.php core + every gadget's JS/CSS as one bundle     src/auth.php    sessions, CSRF, rate limit, epoch
  file.php   serve a file by id (login, Range, nosniff)     src/data.php    table spec, state, batch ops, trash, search
  share.php  share link: password page or read-only app    src/files.php   upload, chunks, serve, zip
  export.php JSON / zip backup                              src/gadgets.php manifests, server actions, bundle
  setup.php  host check + passphrase hash (404 once set)    src/shares.php  share links: unlock, scope, state
  _boot.php  finds the private folder                       src/fetch.php   SSRF-safe hb_fetch, cache, text clean
  gadgets/<type>/ manifest.json gadget.js gadget.css README  src/setup.php   host checks (web + CLI)
  js/ css/ vendor/ (GridStack 11, SortableJS 1)             gadgets/<type>.php  a gadget's server actions
                                                            bin/            check-host.php, hash-passphrase.php
schema.sql  9 tables      tests/  api.cjs, e2e.cjs, gadgets.cjs, v3.cjs      tools/build-zip.py  → dist/*.zip
```
Private folder is found via `HB_PRIVATE_DIR`, a `public/.private-path` file, or `../homebase-private`, `../private` (up to 3 levels).

## Data model (schema.sql)
`scenarios`, `tiles` (x,y,width,height on a 12-col grid, `settings` JSON text), `links`, `tasks`, `files`, `thoughts`, `entries`, `settings`,
`shares` (scenario_id, slug UNIQUE, pass_hash, expires_at, include_files, views; hard-deleted when switched off). Settings key `_auth_epoch`
= sign-out-all epoch (sessions must match it).
All but `settings` have id, created_at, updated_at, `deleted_at` (= in trash; purged after `HB_TRASH_DAYS`, checked once a day in `hb_state`).
Deviations from the roadmap table (deliberate): content rows (links/tasks/files/thoughts) hang off **`tile_id`**, not scenario;
`files.position` orders files and music playlists; links/tasks/files/thoughts also carry `colour`/`tags`; `links.kind` can be `header`;
tiles with `settings.shared_from = <tile id>` are **mirror tiles** (same content shown in another scenario); `settings.m_order` = phone order.
**`entries`** serves the richer tiles (`kind` must match the tile type: manifests' `entryKinds`, `hb_entry_tile()`; `searchKinds` = what Ctrl+K searches): `card` (a=front, b=back, `due_at`, data={ivl,ease,reps,lapses,first}),
`quote` (a=text, b=source, data={author,year,page,url}), `reading` (a=title, b=url, data={status,author,note}), `habit` (a=habit id, `day`, num 1/0 — toggled, never deleted),
`time` (a=label, `day`, num=seconds), `note` (a=Markdown, one row per tile), `doc` (Writer: a=HTML/code, data.mode rich|web|code, one per mode),
`video` (YouTube: a=title, b=url, data={vid,list,author}). `thoughts` has no `colour` column. `day` rows older than 400 days stay in the DB but are not sent in `state`.
The gateway creates missing tables itself from `schema.sql` (`hb_ensure_schema`). Datetime columns MUST go through `hb_row` ISO conversion (`due_at` once leaked a
zone-less string, which browsers read as local time: wrong by 8 h in Singapore, UTC+8). Sketch = one `files` row per `sketch` tile, replaced in place via `upload` + `replace_id`.
Other tiles keep their data in `tiles.settings`: To-do buckets live in the tile's `settings.buckets` (ids urgent/later/brainoff/none + custom); countdown dates in `settings.items`.

## API (public/api.php) — all JSON
* GET `state` full snapshot (also seeds the 3 scenarios on first run, runs the daily purge). GET `trash`, `search&q=`.
* POST `batch` `{ops:[{op:create|update|delete|restore|purge|setting,...}]}` — one transaction; only whitelisted columns
  (`hb_spec()` in data.php) are writable; `delete` is soft; `purge` only works on trashed rows and unlinks stored files.
* `g/<type>/<action>` — a gadget's server actions (`private/gadgets/<type>.php` returns `['action' => fn(array $c): array]`): `g/feeds/feed`,
  `g/reading/title`, `g/weather/geocode|weather`, `g/embed/check|snapshot`, `g/writer/run`, `g/youtube/info`. Outbound only via `hb_fetch`
  (public addresses only; metadata 169.254/fe80 always refused; `HB_ALLOW_PRIVATE_FETCH=1` is for tests ONLY); cached in `storage/cache`.
* Share links: POST `share/unlock {slug,password}`; with `&share=<slug>` only GET `share/state` and GET gadget actions work (actions must
  refuse or scope via `hb_share_allows_setting` / `hb_share_has_tile` when `$c['share']` is set); everything else 403. Owner: `shares`,
  `shares/save`, `shares/delete`. `.htaccess` rewrites `/<slug>` → `share.php?s=<slug>`. POST `auth/logout-all {keep_this}`.
* POST `upload` (multipart, whole file) and `upload-chunk` (upload_id, offset, total, name, tile_id, file) — ordered chunks, 409 otherwise.
* Writes need header `X-CSRF-Token`. Method override via `X-HTTP-Method-Override`. 401 = not signed in (client reloads to login).
* Sessions: PHP file sessions in `private/storage/sessions`, 90-day rolling cookie; 5 wrong tries → 15 min lock per IP (`storage/ratelimit`).

## Front end (classic scripts, global `HB`, one bundle from `assets.php`; order in `HB_CORE_JS_BEFORE/AFTER`, gadgets in between)
* `store.js` — the only state holder. `HB.store.update/create/remove/restore/reorder/setSetting`. Updates are optimistic and coalesced,
  sent 1 s after the last change; create awaits the server (needs the id); failures retry with backoff; `sync()` re-reads on focus / every 30 s;
  localStorage cache (`hb:cache:v1`) paints the page before the network answers. `HB.history` = in-session undo/redo (`history.run(label, fn)` groups).
* `grid.js` (`HB.board`) — GridStack on ≥900 px, stacked Sortable list below. `reconcile()` makes the DOM match the store (rAF-throttled;
  skipped while a drag is active). Tile bodies are rebuilt only when `HB.tileSig` changes. Never mutate the DOM of a tile and forget the store.
* `gadget.js` — `HB.Gadget` base class + `HB.gadgets` registry (one instance per tile). Gadgets: `HB.gadgets.define(type, class extends HB.Gadget
  {render, menu, sig, keep, destroy, static defaults})`; `this.save/items/entries/addEntry/call/redraw`. `kit.js` = shared tile helpers,
  `filekit.js` = files/audio/preview. `ctx.src` is the tile that owns the content (mirrors!), so always use `ctx.id`/`this.id`, not `ctx.tile.id`.
  Use `HB.sortable` + `HB.listDrop` for draggable lists, `HB.onCleanup` for timers.
* Read-only (share page: `<meta name="hb-share">` → `HB.readOnly`, `HB.shareSlug`, `body.readonly`): store refuses writes with a toast, `addRow`/
  `sortable`/`ui.form`/`inlineEdit` are no-ops, grid static, tile menu = Enlarge. Gadgets hide their own edit buttons and keep viewer
  choices in `this.local`. `shares.js` = owner share dialogs.
* `ui.js` — toast, modal, form, confirm, context menu, inlineEdit. `trash.js` — trash zone hit-test + dialog. `upload.js` — queue, chunking, drop anywhere.
* `HB.h(tag, props, ...kids)` builds DOM; `draggable:false` must reach the element (anchors are natively draggable and break Sortable otherwise).
* Optional tile hooks: `sig(ctx)` narrows what triggers a redraw; `keep(ctx)` returns true to skip a redraw (note being typed, sketch with unsaved strokes);
  `HB.board.markRendered(tileId)` after a tile saved its own change. Row-based tiles use `HB.createEntry`, `S.entriesOf(tile, kind)`, `S.createMany`.
  Text from users/feeds/notes goes through `HB.md.render` or `textContent` only (never innerHTML). `HB.emoji` = picker + `suggest(text)`.
* To add a tile type: copy a folder in `public/gadgets/`, set `manifest.json` (type = folder name, group, size, entryKinds…). Nothing else to
  register: server types/kinds/upload rules and the bundle come from the manifests. Details: docs/GADGET_API.md.

## Commands
```bash
mysql homebase < schema.sql                        # local DB (see README "Run it locally"); private/.env holds creds + hash
(cd public && php -S 127.0.0.1:8080 -d upload_max_filesize=2M -d post_max_size=3M)
node tests/api.cjs                                 # gateway rules (needs mysql CLI)           — see tests/README.md
node tests/e2e.cjs                                 # browser e2e (Playwright + Chromium; fresh/empty DB)
node tests/gadgets.cjs                             # extra tiles; needs the 2nd server + fake feeds (tests/README.md); runs in UTC+8
node tests/v3.cjs                                  # round 3 (writer, youtube, shares, sign-out-all…); 2nd server; Asia/Singapore
python3 tools/build-zip.py                         # dist/homebase-task.francistsoi.com.zip (never includes .env or storage data)
```
Run all four tests before committing a behaviour change (empty the DB and `storage/cache` before each browser suite);
rebuild and commit the zip when public/ or private/ changes.

## Rules of the house
* Secrets only in `private/.env` (gitignored). Never log or echo them. Files live in `private/storage/files` under random 32-hex names.
* Every endpoint except auth/status+login needs a session (or, read-only, an unlocked share); every non-GET needs CSRF. Keep it that way.
* Writer HTML+JS runs only from `g/writer/run` under `CSP: sandbox allow-scripts` WITHOUT allow-same-origin. Never relax that.
* No build step, no npm at runtime: vendored libs stay in `public/vendor/`. Keep PHP 8.0 compatible (no `never`, enums, readonly).
* Keep this file under ~200 lines; update "Status" and "Deviations" when you change them.
