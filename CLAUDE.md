# Home Base — notes for Claude Code sessions

Private start page at **task.francistsoi.com** (a subdomain, so the app lives at the web root `/`).
Tiles on a drag-and-drop grid, one layout per scenario (Work, Idea, PhD, more). Shared hosting:
**PHP 8.0+, MySQL/MariaDB, plain JavaScript, no build step.** Read this file, then the stage you are asked for.
Full user docs: README.md. Deployment: DEPLOY.md. Roadmap source: `docs/Home_Base_front_page_roadmap.docx`.
**Gadget interface: `docs/GADGET_API.md`.** To work on ONE gadget, read that file plus `private/gadgets/<type>/` (its README.md
first; `server.php` is its server part). You do not need the rest of the code base for that. The user is in Singapore (UTC+8); never assume a city.

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
all devices (session epoch); password + expiry share links at `/<name>` (read-only visitors).
**Round 4** built and tested (`tests/v4.cjs`): the Writer's rich text is now a CKEditor-style editor (`public/js/editor.js` + `css/editor.css`, shared as `HB.editor`);
new **Writer folder** gadget (`library`: pages, code pages, folders, drag, filter, search; a Writer can be moved into one); **scenario groups**
(a named folder of tabs you minimise/maximise; setting `scenario_groups`, code in `app.js`).
**Pronounce names** gadget (`pronounce`, kind `pron`; `g/pronounce/lookup|audio`): name → IPA (Wiktionary/Wikipedia/dictionary), UK/US
device voice + recordings, howtopronounce links. Built, NOT yet covered by tests (only by v5's install check of its zip).
**Round 5** built and tested (`tests/v5.cjs`): gadgets are WordPress-style plug-ins. One folder each in `private/gadgets/<type>/`
(outside the web root, `server.php` inside); ⋯ → Gadgets… installs/updates from a dropped .zip (checked, staged, passphrase,
atomic rename), switches off/on (`storage/gadgets.json`), downloads, deletes (tiles kept or trashed). Each gadget's JS/CSS loads
as its own file, so a broken one only breaks itself. `dist/gadgets/*.zip` = one zip per gadget.
**Round 6** built and tested (`tests/v6.cjs`): Home Base is ONE file like WordPress. `dist/homebase-setup.php` (= `tools/installer.php`
+ `private/src/package.php` + the package appended after `__halt_compiler()`) installs a new site (host check, DB form, passphrase,
creates `../homebase-private`, writes .env, tables, all built-in gadgets, deletes itself; 2 h window) or updates an old one (passphrase).
In the app, the same Gadgets & updates drop box takes the Home Base file (update, journaled + rolled back) and offers the built-in
catalog (`homebase-private/catalog/<type>.zip`: Add / Update, no file). `private/core.json` on a site = installed version + web file
hashes (stale files removed on update).
**Round 7** built and tested (`tests/folders.cjs`): the Files gadget has nested folders (drag a file onto a folder/breadcrumb, upload into the open folder,
dropped desktop folders keep their tree, zip backup keeps paths; 🌳 Tree view = expandable hierarchy, several folders open at once, `HB.folderOpen`). Next work = whatever the user asks.

## Layout
```
public/    → web root of the subdomain (zip: web/)       private/ → outside web (zip: homebase-private/)
  index.php  login page or the app shell                    src/config.php  .env parser, paths
  api.php    JSON gateway (?r=state|batch|trash|search|     src/db.php      PDO (utf8mb4, UTC session)
             upload|upload-chunk|auth/*|shares*|g/…)        src/http.php    HttpError, json, headers, CSP
  assets.php core bundles (+ manifests), and gadget files  src/auth.php    sessions, CSRF, rate limit, epoch, reauth
  file.php   serve a file by id (login, Range, nosniff)     src/data.php    table spec, state, batch ops, trash, search
  share.php  share link: password page or read-only app    src/files.php   upload, chunks, serve, zip
  export.php JSON / zip backup                              src/gadgets.php manifests, on/off, actions, assets
  setup.php  host check + passphrase hash (404 once set)    src/gadget_admin.php  Gadgets & updates page: zips, catalog, core update
                                                            src/package.php  Home Base packages: open, check, apply (standalone)
                                                            src/shares.php  share links: unlock, scope, state
  _boot.php  finds the private folder                       src/fetch.php   SSRF-safe hb_fetch, cache, text clean
  js/ css/ vendor/ (GridStack 11, SortableJS 1)             src/setup.php   host checks (web + CLI)
  js/editor.js = HB.editor (rich + code editor, sanitizer)  gadgets/<type>/ manifest.json gadget.js gadget.css server.php README.md
                                                            bin/            check-host.php, hash-passphrase.php
schema.sql 9 tables  tests/ api e2e gadgets v3 v4 v5 v6 .cjs, lib/   tools/installer.php, build-zip.py → dist/homebase-setup.php, homebase.zip, gadgets/
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
`video` (YouTube: a=title, b=url, data={vid,list,author}), `page` (Writer folder: a=HTML/code, b=title, `num`=parent folder id (0 = top), data={t:page|code|folder,lang,open}), `folder` (Files: a=name, num=parent folder id, 0 = top; a file's folder is `files.folder_id`, a column `hb_ensure_schema` adds to old databases), `pron` (a=name, b=IPA, data={kind,uk,us,say,audio{uk,us},source,url,note}). `thoughts` has no `colour` column. `day` rows older than 400 days stay in the DB but are not sent in `state`.
The gateway creates missing tables itself from `schema.sql` (`hb_ensure_schema`). Datetime columns MUST go through `hb_row` ISO conversion (`due_at` once leaked a
zone-less string, which browsers read as local time: wrong by 8 h in Singapore, UTC+8). Sketch = one `files` row per `sketch` tile, replaced in place via `upload` + `replace_id`.
**Scenario groups** live in the `settings` key `scenario_groups` = `{"groups":[{id,name,collapsed}],"of":{"<scenario id>":"<group id>"}}` (no schema change; `app.groupData()/editGroups()`; tabs show in `app.displayItems()` order, keys 1-9 follow it).
Other tiles keep their data in `tiles.settings`: To-do buckets live in the tile's `settings.buckets` (ids urgent/later/brainoff/none + custom); countdown dates in `settings.items`.

## API (public/api.php) — all JSON
* GET `state` full snapshot (also seeds the 3 scenarios on first run, runs the daily purge). GET `trash`, `search&q=`.
* POST `batch` `{ops:[{op:create|update|delete|restore|purge|setting,...}]}` — one transaction; only whitelisted columns
  (`hb_spec()` in data.php) are writable; `delete` is soft; `purge` only works on trashed rows and unlinks stored files.
* `g/<type>/<action>` — a gadget's server actions (`<gadget>/server.php` returns `['action' => fn(array $c): array]`): `g/feeds/feed`,
  `g/reading/title`, `g/weather/geocode|weather`, `g/embed/check|snapshot`, `g/writer/run`, `g/youtube/info`, `g/pronounce/lookup|audio`. Outbound only via `hb_fetch`
  (public addresses only; metadata 169.254/fe80 always refused; `HB_ALLOW_PRIVATE_FETCH=1` is for tests ONLY); cached in `storage/cache`.
* Share links: POST `share/unlock {slug,password}`; with `&share=<slug>` only GET `share/state` and GET gadget actions listed in the
  manifest's `shareActions` work (they must still scope via `hb_share_allows_setting` / `hb_share_has_tile`); everything else 403. Owner: `shares`,
  `shares/save`, `shares/delete`. `.htaccess` rewrites `/<slug>` → `share.php?s=<slug>`. POST `auth/logout-all {keep_this}`.
* Gadgets page (owner): GET `gadgets` (installed, `available` from the catalog, `version`); POST `gadgets/catalog {type}` (add/update a
  built-in, no passphrase); POST `gadgets/upload` (multipart zip → staged in `<gadgets>/.stage-<token>`, preview; a zip with
  `homebase.json` = a Home Base update → kept as `storage/tmp/core-<token>.zip`, `hbp_apply` on install; refused in a git checkout),
  `gadgets/install {token,passphrase}` (403 on wrong passphrase, never 401), `gadgets/switch {type,on}`, `gadgets/delete {type,trash_tiles}`;
  GET `gadgets/export&type=`. `HB_GADGETS_DIR` moves the gadgets folder (tests); `HB_GADGET_INSTALL=0` disables web installs.
* POST `upload` (multipart, whole file) and `upload-chunk` (upload_id, offset, total, name, tile_id, file) — ordered chunks, 409 otherwise.
* Writes need header `X-CSRF-Token`. Method override via `X-HTTP-Method-Override`. 401 = not signed in (client reloads to login).
* Sessions: PHP file sessions in `private/storage/sessions`, 90-day rolling cookie; 5 wrong tries → 15 min lock per IP (`storage/ratelimit`).

## Front end (classic scripts, global `HB`; `assets.php?b=core` (+ manifests), one `?g=<type>&f=gadget.js` per gadget, then `?b=app`)
* `store.js` — the only state holder. `HB.store.update/create/remove/restore/reorder/setSetting`. Updates are optimistic and coalesced,
  sent 1 s after the last change; create awaits the server (needs the id); failures retry with backoff; `sync()` re-reads on focus / every 30 s;
  localStorage cache (`hb:cache:v1`) paints the page before the network answers. `HB.history` = in-session undo/redo (`history.run(label, fn)` groups).
* `grid.js` (`HB.board`) — GridStack on ≥900 px, stacked Sortable list below. `reconcile()` makes the DOM match the store (rAF-throttled;
  skipped while a drag is active). Tile bodies are rebuilt only when `HB.tileSig` changes. Never mutate the DOM of a tile and forget the store.
* `gadget.js` — `HB.Gadget` base class + `HB.gadgets` registry (one instance per tile). Gadgets: `HB.gadgets.define(type, class extends HB.Gadget
  {render, menu, sig, keep, destroy, static defaults})`; `this.save/items/entries/addEntry/call/redraw`. `kit.js` = shared tile helpers,
  `filekit.js` = files/audio/preview. `ctx.src` is the tile that owns the content (mirrors!), so always use `ctx.id`/`this.id`, not `ctx.tile.id`.
  Use `HB.sortable` + `HB.listDrop` for draggable lists, `HB.onCleanup` for timers. `this.asset(path)` = a file in the gadget folder.
  Core never depends on a particular gadget being installed (`HB.gadgets.has(type)`); gadget calls are wrapped in try/catch.
  `gadget-admin.js` = the Gadgets page; a missing/failed gadget's tile shows `HB.gadgetMissing(tile)`.
* Read-only (share page: `<meta name="hb-share">` → `HB.readOnly`, `HB.shareSlug`, `body.readonly`): store refuses writes with a toast, `addRow`/
  `sortable`/`ui.form`/`inlineEdit` are no-ops, grid static, tile menu = Enlarge. Gadgets hide their own edit buttons and keep viewer
  choices in `this.local`. `shares.js` = owner share dialogs.
* `ui.js` — toast, modal, form, confirm, context menu, inlineEdit. `trash.js` — trash zone hit-test + dialog. `upload.js` — queue, chunking, drop anywhere.
* `HB.h(tag, props, ...kids)` builds DOM; `draggable:false` must reach the element (anchors are natively draggable and break Sortable otherwise).
* Optional tile hooks: `sig(ctx)` narrows what triggers a redraw; `keep(ctx)` returns true to skip a redraw (note being typed, sketch with unsaved strokes);
  `HB.board.markRendered(tileId)` after a tile saved its own change. Row-based tiles use `HB.createEntry`, `S.entriesOf(tile, kind)`, `S.createMany`.
  Text from users/feeds/notes goes through `HB.md.render` or `textContent` only (never innerHTML). `HB.emoji` = picker + `suggest(text)`.
* To add a tile type: copy a folder in `private/gadgets/`, set `manifest.json` (type = folder name, group, size, entryKinds…). Nothing else to
  register: server types/kinds/upload rules and the asset tags come from the manifests. Details: docs/GADGET_API.md.

## Commands
```bash
mysql homebase < schema.sql                        # local DB (see README "Run it locally"); private/.env holds creds + hash
(cd public && php -S 127.0.0.1:8080 -d upload_max_filesize=2M -d post_max_size=3M)
node tests/api.cjs                                 # gateway rules (needs mysql CLI)           — see tests/README.md
node tests/e2e.cjs                                 # browser e2e (Playwright + Chromium; fresh/empty DB)
node tests/gadgets.cjs                             # extra tiles; needs the 2nd server + fake feeds (tests/README.md); runs in UTC+8
node tests/v3.cjs                                  # round 3 (writer, youtube, shares, sign-out-all…); 2nd server; Asia/Singapore
node tests/v4.cjs                                  # round 4 (editor, Writer folder, scenario groups); main server; Asia/Singapore
node tests/v5.cjs                                  # gadget plug-ins; 3rd server with HB_GADGETS_DIR=scratch (tests/README.md)
node tests/v6.cjs                                  # one-file installer + web updates + old-site upgrades (own servers 8086-8088)
node tests/folders.cjs                             # Files folders (drag, menu, nest, delete+undo, folder drop, zip, share); fresh DB, main server
python3 tools/build-zip.py                         # dist/homebase-setup.php, homebase.zip, gadgets/*.zip (never .env or stored data)
```
Run all eight tests before committing a behaviour change (empty the DB and `storage/cache` before each browser suite);
rebuild and commit the zip when public/ or private/ changes.

## Rules of the house
* Secrets only in `private/.env` (gitignored). Never log or echo them. Files live in `private/storage/files` under random 32-hex names.
* Every endpoint except auth/status+login needs a session (or, read-only, an unlocked share); every non-GET needs CSRF. Keep it that way.
* Installing a gadget = running its code: keep the zip checks, staging, passphrase re-check and CSRF in gadget_admin.php.
  The same for Home Base updates (package.php) and the installer (fresh install only when no site exists, 2 h window, self-delete).
  Bump `HB_VERSION` (gadgets.php) for every release; a gadget fix needs its manifest `version` raised to reach existing sites.
* Writer HTML+JS runs only from `g/writer/run` under `CSP: sandbox allow-scripts` WITHOUT allow-same-origin. Never relax that.
* No build step, no npm at runtime: vendored libs stay in `public/vendor/`. Keep PHP 8.0 compatible (no `never`, enums, readonly).
* Keep this file under ~200 lines; update "Status" and "Deviations" when you change them.
