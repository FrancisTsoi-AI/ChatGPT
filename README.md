# Home Base

A private start page for **task.francistsoi.com**: your toolbox, files, to-dos and loose thoughts as
tiles on one drag-and-drop grid, with a separate layout per scenario (Work, Idea, PhD, and any you add).

* **Deploying?** Read [DEPLOY.md](DEPLOY.md) — the complete step-by-step procedure.
* **Developing with Claude Code?** Read [CLAUDE.md](CLAUDE.md).

## Using it

| Do this | To get this |
|---|---|
| Drag a tile **by its title** | Move it |
| Pull **any edge or corner** | Resize it (snaps to whole grid cells, 1×1 up to full width, 12 columns) |
| Drop a tile, link, task, thought or file on **🗑 Trash** | Delete it (restorable for 30 days) |
| Drop files **anywhere on the page** | Upload (into the tile under the pointer, else your first Files tile) |
| **Right-click** anything | The same actions as a menu (rename, colour, tags, move to…, delete) |
| Keys **1 – 9** | Switch scenario (tabs: double-click to rename, drag to reorder, **+** to add) |
| **Ctrl/⌘ + K** | Search links, files, tasks and thoughts, and run commands |
| **Ctrl/⌘ + Z**, **Ctrl/⌘ + Shift + Z** | Undo / redo recent changes (moves, resizes, edits, deletes) |
| `⋯` on a tile | Rename, colour, size, move to another scenario, **Also show in…** (a shared tile) |

### Tiles

| Tile | What it does |
|---|---|
| **Toolbox** | Link cards with icon, colour and tags; group headers; paste a link or `Name \| address`; drag to reorder or into another toolbox |
| **To-do** | Buckets *Urgent · Later · Brain-off · No category* (rename, add or remove buckets); tick, edit in place, drag between buckets and tiles; `#tags` in the text become tags |
| **Thought dump** | Type, press Enter, timestamped; Shift+Enter for a new line; click to edit |
| **Clock** | Time and date (12/24 h, seconds in the tile menu) |
| **Files** | Upload by drop or button; click to preview images, PDF, audio, video, text; download, rename, tag, drag between Files tiles; list or thumbnail view |
| **Countdown** | Several named deadlines; day counts roll over at midnight |
| **Music player** | Plays your uploaded audio: queue, skip, seek, shuffle, repeat; keeps playing while you switch scenarios |

### Good to know

* **Everything autosaves.** The screen updates instantly; the change goes to the server ~1 s after you stop
  dragging. The top bar shows *Saved / Saving… / Offline: retrying* (changes are kept and retried).
* **Instant start.** The page draws from a local cache first, then syncs; it also re-reads when you return
  to the tab and every 30 s while visible, so two devices stay in step.
* **Nothing gets lost.** Deletes go to the trash; undo covers the current session.
* **Colour & tags.** Tiles have colours; links, tasks, files and thoughts have colour labels and tags
  (shown as chips, searchable with Ctrl+K, click a chip to search it).
* **Phone / tablet (under 900 px):** tiles stack in one column; drag a tile by its title to reorder
  (long-press on touch screens); the tile menu has *Size*.
* **Backup:** `⋯ → Backup` downloads your data as JSON, or JSON plus all uploaded files as a zip.

## Layout of this repository

```
web/ → public/            the web folder (page, API entry points, css/js, vendored GridStack + SortableJS)
private/                  gateway code (src/), CLI helpers (bin/), storage/ (files, sessions…), .env
schema.sql                the 7 MySQL tables
tests/                    API test (node) and browser end-to-end test (Playwright)
tools/build-zip.py        builds the upload zip into dist/
DEPLOY.md  CLAUDE.md
```

On the server the folders are named `web/` (document root of the subdomain) and `homebase-private/`
(outside it); the build script renames them.

## Run it locally

```bash
mysql -e "CREATE DATABASE homebase CHARACTER SET utf8mb4; CREATE USER 'hb'@'localhost' IDENTIFIED BY 'hbpass'; GRANT ALL ON homebase.* TO 'hb'@'localhost'"
mysql homebase < schema.sql
cp private/.env.example private/.env           # fill in DB_*; then:
php private/bin/hash-passphrase.php             # paste the printed line into private/.env
(cd public && php -S 127.0.0.1:8080)            # open http://127.0.0.1:8080
```

Tests: see [tests/README.md](tests/README.md). Build the upload zip: `python3 tools/build-zip.py`.

## Credits

[GridStack](https://gridstackjs.com) (MIT) for the grid and [SortableJS](https://sortablejs.github.io/Sortable/)
(MIT) for lists — both vendored under `public/vendor/` with their licences. No build step.
