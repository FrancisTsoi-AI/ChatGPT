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
| **Ctrl/⌘ + K** | Search links, files, tasks, thoughts, cards, quotes, notes and reading items, and run commands |
| **Ctrl/⌘ + Z**, **Ctrl/⌘ + Shift + Z** | Undo / redo recent changes (moves, resizes, edits, deletes) |
| `⋯` on a tile | Rename, colour, enlarge, bigger/smaller, move to another scenario, **Also show in…** (a shared tile) |

### Tiles

Add them from **+ Tile** (grouped), from Ctrl+K (*Add tile: …*), or the `⋯` menu. Every tile can be renamed, coloured, resized, enlarged,
moved to another scenario, shared into another scenario (*Also show in…*), and dragged to the Trash.

| Tile | What it does |
|---|---|
| **Toolbox** | Link cards; **emoji icons are picked for you** from the name (Gmail → 📧) and an emoji picker with keyword search is built in; group headers, colours, tags; paste a link or `Name \| address`; drag to reorder or into another toolbox |
| **To-do** | Buckets *Urgent · Later · Brain-off · No category* (rename, add or remove); tick, edit in place, drag between buckets and tiles; `#tags` become tags |
| **Thought dump** | Type, press Enter, timestamped; Shift+Enter for a new line; click to edit |
| **Note (Markdown)** | One formatted page: headings, **bold**, lists, `- [ ]` task boxes you can tick, quotes, code, links. Safe: pasted text can never run as script |
| **Clock** / **Countdown** | Time and date; several named deadlines whose day counts roll over at midnight |
| **Flashcards** | Spaced repetition (Again / Hard / Good / Easy). *Study* is a focused full-window view: **Space** flips, **1–4** grade, **Esc** leaves. Add cards one by one or **Import** `front \| back` lines (or paste from Excel/Anki); *new cards per day* limit; browse, edit, delete; Markdown on cards |
| **Quotes & citations** | Quote text with the **source entered separately**: author, source (book/article), year, page, link, tags. *Copy* gives `“quote” — Author, Source, (year), p. 12`; filter; drag to reorder |
| **Reading list** | Paste a link (title is fetched for you) or `Title \| link`; ○ unread → ◐ reading → ● read; filter by state; notes, tags |
| **Timer** | **Count down** (presets 1–60 min or custom) with a chime, or **count up** as a stopwatch; keeps running across reloads and devices |
| **Time log** | Start/stop per project label, add time by hand, today/week totals, bars per project, week navigation |
| **Habit tracker** | Tick today or any day this week; streaks; browse past weeks; colour and emoji per habit |
| **Stats & progress** | Counters with target, unit, step, progress bar and `+` / `−` (words written, papers read…) |
| **Embed** | Show a web page, **YouTube / YouTube Music playlist**, Spotify, Vimeo or an `<iframe>` snippet inside a tile |
| **Search box** | Search Google Scholar, Google, Wikipedia, YouTube… and your **libraries (HKMU, Lancaster, HKU)**. A library needs a one-time setup: search for a word on its site, paste the results address, and Home Base learns the pattern. Sites are editable |
| **News feeds (RSS)** | Several RSS/Atom feeds merged newest-first, unread marks, *Mark all read* |
| **Weather** | Current conditions and a 5-day forecast for your city (Open-Meteo, no key) |
| **Files** | Upload by drop or button; preview images, PDF, audio, video, text; download, rename, tag, drag between tiles; list or thumbnail view |
| **Music player** | Plays your uploaded audio: queue, skip, seek, shuffle, repeat; keeps playing while you switch scenarios |
| **Sketch board** | Draw freehand (colours, sizes, eraser, undo, clear, download PNG); autosaves as an image in the tile |

**Enlarge a tile:** the **⤢** button in its title bar fills the screen (**Esc** or ⤡ restores it); the `⋯` menu also has *Bigger* / *Smaller* steps.

**About ads on YouTube:** an embedded YouTube playlist is played by YouTube, which decides about ads. Home Base cannot remove them (YouTube
Premium, signed in in the same browser, does). For an ad-free playlist use the **Music player** tile with your own audio files.

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
* **Backup:** `⋯ → Backup` downloads your data as JSON, or JSON plus all uploaded files (and sketches) as a zip.
* **Outside data** (feeds, weather, page titles) is fetched by your server, not your browser, with strict safety checks; it needs PHP's cURL.

## Layout of this repository

```
web/ → public/            the web folder (page, API entry points, css/js, vendored GridStack + SortableJS)
private/                  gateway code (src/), CLI helpers (bin/), storage/ (files, sessions…), .env
schema.sql                the 8 MySQL tables (the gateway applies it itself when a new version needs a new table)
tests/                    API test, browser end-to-end test, and a gadgets test (Playwright)
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
