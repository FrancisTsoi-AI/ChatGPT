# 📚 Reading list (`reading`)

A list of things to read, each marked unread ○, reading ◐ or read ●.
Paste a link, `Title | link`, or just a title into the box at the bottom. New items go to the top.
When only a link is pasted, the host name is used first and the server looks up the page title in the background.
Click the status icon to cycle unread → reading → read. Opening an unread item's link marks it "reading".
Tabs at the top filter All / Unread / Reading / Read, with counts. Right-click an item for Edit…, Mark <status>, Move to tile and Delete.
Drag items to reorder them, into another Reading list tile, or onto the trash zone.

## Files
- `manifest.json` – size 4×5, group Study, order 90, entryKinds `["reading"]`, searchKinds `["reading"]` (Ctrl+K finds them).
- `gadget.js` – the class overrides only `render` (no `menu`, `sig`, `keep`, `destroy` or `static defaults`).
  Helpers: `add(ctx, text)` parses the input, creates the row and calls the `title` action; `edit(ctx, r)` is the edit form
  (title, link, author, note, tags, colour); `setStatus(r, s)`, `statusOf(r)` and `host(url)`.
- `gadget.css` – `.reads` list, `.read` rows (`.st-read` greys and strikes through the title), `.read-state` icon button, `.read-title`, `.read-note`.
- `server.php` – the `title` action and its helper `hb_page_title($url)`.

## Data
- **Tile settings**: none. The status tab is kept in memory only (`filters[ctx.id]`), not saved.
- **Rows**: `entries` with kind `reading`, on `ctx.id` (a mirror tile shows the original's list).
  - `a` – title (the host name until the fetched title arrives), `b` – link, normalised with `HB.normUrl`.
  - `data` – `{status: 'unread' | 'reading' | 'read', author, note}`. A missing status counts as unread.
  - `tags`, `colour` – set in Edit…. `position` – order; a new item gets the top row's position − 1.
  - Moving to another tile changes `tile_id`. The fetched title is saved with `record: false` (not an undo step).

## Server actions
`g/reading/title?url=…` – fetches the page with `hb_fetch` (public addresses only, up to 512 KB, needs cURL).
It returns `{title, url}`, taking `og:title` or else `<title>`, cleaned and cut to 200 characters.
The client ignores failures. A share visitor gets 403 "Read-only".

## On a share page
Items show with their links, author, host, note and tags; links open in a new tab. The status tabs still filter.
The status icon cannot be clicked, the add box and × are hidden, dragging is off and the right-click menu is off.
Opening an unread link does not change its status (`setStatus()` returns at once when `HB.readOnly`).

## Ideas for upgrades
- Record when an item was finished: set `data.readAt` in `setStatus()` when the status becomes `read`, and show it in `render()`.
- Fill `data.author` from the page's `<meta name="author">` in `hb_page_title()` and use it in `add()`.
- Remember the status tab per tile with `this.save({ filter })` instead of the in-memory `filters` object.
