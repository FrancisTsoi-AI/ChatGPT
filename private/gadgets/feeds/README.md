# 📰 News feeds (RSS) (`feeds`)

Merges several RSS or Atom feeds into one list, newest first. Unread items have bold titles.
Click an item to open it in a new tab; that also marks it read. The top bar shows the unread count and has **Refresh** and **Mark all read**.
The ⋯ menu has **Edit feeds…** (one `Name | feed address` per line) and **Mark everything read**.

## Files
- `manifest.json` – size 4×6, group "Web", order 160, shareActions `["feed"]` (the only action share visitors may call).
- `gadget.js` – the class plus module helpers. It overrides no `sig`, `keep`, `destroy` or `static defaults`.
  - `loadFeed(f)` – calls `g/feeds/feed` and keeps the answer (or the error) in a page-wide `cache` Map for 10 min (`TTL`).
  - `render(body, ctx)` – an empty state with **Add feeds…**; otherwise loads all feeds in parallel (`paint(force)`), merges the items, sorts them by date, shows at most 60, and lists per-feed errors in red.
    It repaints with fresh data every 15 min while the page is visible (`setInterval`, stopped via `HB.onCleanup`).
  - `markRead(ctx, ids)` – adds item ids to `settings.read`.
  - `editFeeds(ctx)` – the textarea form. Keeps only lines with a name and an `http(s)://` address.
  - `menu(tile, ctx)` – Edit feeds…, and Mark everything read (every cached item of the tile's feeds, not only the 60 shown).
  - `ago(iso)` – "now", "5 min", "3 h", "2 d" under each title.
- `gadget.css` – the list and item cards: `.feed-list`, `.feed-item` (`.read` dims the title), `.feed-title`, `.feed-sum` (summary cut to 2 lines).
- `server.php` – server action `feed` (parser in `hb_feed($url)`).

## Data
- **Tile settings** (`this.settings`; written with `HB.setTileSettings(ctx.id, …)` and `S.update`, like `this.save(patch)`). `ctx.id` is the content owner, so a mirror tile shares the original's feeds and read marks.
  - `feeds` – `[{id, name, url}]`, name cut to 40 chars (`[]`). Saving the edit form keeps the `id` of every feed whose address did not change (so its read marks still match); new feeds get a new random `id`.
  - `read` – ids `"<feed id>:<item id>"` of read items; only the last 600 are kept (`[]`). Saved with `{record: false}`, so it is not part of undo / redo.
- **Rows**: none.

## Server actions
- `g/feeds/feed?url=` – fetches the feed through `hb_fetch` (public addresses only, max 3 MB) and refuses documents with `<!ENTITY`.
  Parses RSS 2.0 / 0.9x, Atom and RSS 1.0 (RDF) with `LIBXML_NONET`. Returns `{title, items}` for the first 30 items.
  Each item: `title` (plain text, ≤200 chars), `link` (http(s) only, else empty), `date` (ISO UTC or null), `summary` (plain text, ≤280 chars), `id` (10 hex chars of sha256 of the guid, or of link + title).
  Cached 15 min in `storage/cache` (key `feed:<url>`). So **Refresh** clears only the browser cache; the server may still answer from its own.
- Share visitors may load only addresses listed in one of the shared scenario's feed tiles (`hb_share_allows_setting`). Anything else is 403.

## On a share page
- The visitor sees the merged list with the owner's read marks and can open items in a new tab.
- Read marks are the owner's: a visitor's clicks change nothing (`markRead()` returns at once), and **Mark all read** and **Add feeds…** are not shown.
- The ⋯ menu only offers Enlarge / Restore.

## Ideas for upgrades
- Let a share visitor keep their own read marks in this browser: in `markRead()`, write to `localStorage` instead of returning when `HB.readOnly`.
- A "hide read items" toggle: `settings.hideRead`, applied to `shown` in `render()`, plus a menu item.
- Make the 60-item cap (`items.slice(0, 60)` in `paint`) a setting such as `settings.max`.
- A per-feed filter: clicking a feed name sets `settings.only = feed.id`, and `paint()` filters `items` by it.
