# ❝ Quotes & citations (`quotes`)

Collects quotes with the source kept apart from the text: author, work, year, page and an optional link.
"+ Quote" (or ⋯ → Add quote…) opens the form. Each quote shows Copy, Edit and × buttons on hover.
Copy puts the quote on the clipboard as “text” — Author, Source, (Year), p. 12 plus the link.
Right-click a quote for Edit…, Copy quote with source, Colour & tags…, Move to tile (other Quotes tiles in this scenario) and Delete.
Drag quotes to reorder them, into another Quotes tile, or onto the trash zone. A filter box appears when there are more than 3 quotes.

## Files
- `manifest.json` – size 4×5, group Study, order 80, entryKinds `["quote"]`, searchKinds `["quote"]` (Ctrl+K finds them).
- `gadget.js` – the class overrides only `render` and `menu` (no `sig`, `keep`, `destroy` or `static defaults`).
  Helpers: `sourceText(q)` builds the source line (a leading "p." in the page is not doubled), `citation(q)` builds the copied text,
  `edit(ctx, q)` is the add/edit form, `copy(q)` uses the clipboard API with an `execCommand('copy')` fallback.
  Exposes `HB.quoteSource = sourceText` for other code.
- `gadget.css` – quote cards with a colour bar on the left (`.quotes`, `.quote`, `.quote-text`, `.quote-src`, `.quote-link`), the hover buttons (`.quote-btns`) and the filter box (`.quote-filter`).

## Data
- **Tile settings**: none. The filter text is kept in memory only (`filters[ctx.id]`), not saved.
- **Rows**: `entries` with kind `quote`, on `ctx.id` (a mirror tile shows the original's quotes).
  - `a` – the quote text, `b` – the source (title of the work).
  - `data` – `{author, year, page, url}`; `url` is normalised with `HB.normUrl` and must be http(s).
  - `tags`, `colour` – from the form or Colour & tags…; the colour tints the left bar.
  - `position` – list order (drag). Moving to another tile changes `tile_id`.
- The filter matches text, source, author and tags.

## Server actions
None.

## On a share page
Quotes show with their source, link and tag chips, and the filter box works. Copy works too.
The × button, "+ Quote" and Edit are hidden, dragging is off and the right-click menu is off (the browser's menu shows).

## Ideas for upgrades
- Add "Copy as APA" / "Copy as MLA" items to the right-click menu, built from `sourceText()` parts.
- A "random quote" view: a `mode` setting (saved with `this.save`) that makes `render()` show one quote at a time.
- Bulk import like flashcards' `importCards()`, using `S.createMany` with `text | author | source` lines.
