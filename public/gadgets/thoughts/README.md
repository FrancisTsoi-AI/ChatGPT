# 💭 Thought dump (`thoughts`)

A quick inbox for passing thoughts. Type in the box at the top and press Enter to save (Shift+Enter adds a new line).
Each thought shows its time, newest first. `#words` in the text become tags.
Click a thought to edit it inline (Enter saves, Shift+Enter new line, Esc cancels); clicking while text is selected does nothing, so you can copy.
Right-click a thought for Copy text, Tags…, Move to tile (when this page has another Thought dump) and Delete. × deletes. Drag a thought to another Thought dump tile or onto the trash zone.

## Files
- `manifest.json` – size 4×5, group Everyday, order 30. No entryKinds, no uploads.
- `gadget.js` – the class overrides only `render(body, ctx)` (no `menu`, `sig`, `keep`, `destroy` or `static defaults`, so the tile ⋯ menu has no gadget items).
  Helper in the same file: `thoughtEl` (one thought with time, text, tag chips, × and its right-click menu).
  `render` draws the input, then the newest 100 thoughts; "Show N older (M hidden)" adds 100 more each press.
  After saving, the input is focused again; if saving fails, the text is put back.
- `gadget.css` – the input (`.thought-input`), the list (`.thoughts`, `.thought`, `.thought-time`, `.thought-text`) and the "Show older" button (`.more`).

## Data
- **Tile settings** (`this.settings`, saved with `this.save(patch)`): none.
- **Rows**: `thoughts` with `tile_id = ctx.id` (the content owner, so a mirror tile shows the same thoughts).
  `text` – up to 20 000 chars, shown with line breaks kept; `tags` – comma list (hashtags are added, never removed, on edit);
  `created_at` – the time shown on each thought and the sort order. There is no `position`, so thoughts cannot be reordered by drag.
- The "Show older" count is kept in memory per content tile (`limits`), not saved; it resets on reload.

## Server actions
None. There is no `private/gadgets/thoughts.php`, so any `g/thoughts/…` call answers 404.

## On a share page
- Visitors see the thoughts with their times and tag chips, and can use "Show older".
- Hidden: the input box and the × buttons.
- Off: inline editing, dragging and right-click menus (the browser menu shows instead).

## Ideas for upgrades
- Filter box: add an input above the list in `render` and filter `all` by text before slicing.
- "Make a task" in the right-click menu of `thoughtEl`: `HB.safeCreate('tasks', { tile_id, bucket: 'none', text })` for a To-do tile of this scenario.
- Colours: `thoughts` has no `colour` column, so the Tags… dialog leaves the colour out (`HB.editMeta(…, { noColour: true })`).
  To add colours, add the column (an `ALTER TABLE`, since `hb_ensure_schema` only creates missing tables) and to `hb_spec()`,
  drop `noColour`, and set `dataset.color` in `thoughtEl`.
- "Copy all as text" in a new `menu()` override: join every thought's time and text and write it to the clipboard.
