# 📝 Note (Markdown) (`note`)

One page of Markdown text per tile. The tile shows the rendered text and a word count.
Press ✎ Edit or double-click the text to open a plain textarea. Typing saves by itself 0.8 s after the last key ("Typing…", "Saving…", "Saved").
✓ Done or Esc saves and goes back to the rendered view. Tab inserts two spaces.
Task boxes (`- [ ]`) in the rendered view can be ticked without opening the editor.

## Files
- `manifest.json` – size 4×5, group Writing, order 20, entryKinds `["note"]`, searchKinds `["note"]` (Ctrl+K finds them).
- `gadget.js` – the class overrides `keep(ctx)` and `render`.
  - `keep(ctx)` returns true while this note is in edit mode, so store updates do not rebuild the textarea under the user.
  - Inside `render`: `view()` draws the Markdown, `edit()` swaps in the textarea, `done()` saves, returns to the view and calls `HB.board.markRendered(ctx.tile.id)`.
  - Module `save(ctx, text)` updates the row, or creates it on the first save. A `creating` map makes sure fast typing never creates two rows.
  - No `menu`, `sig`, `destroy` or `static defaults`.
- `gadget.css` – `.note` column layout, `.note-tools` bar, `.note-edit` monospace textarea.

## Data
- **Tile settings**: none.
- **Rows**: `entries` with kind `note`, on `ctx.id` (a mirror tile shows and edits the original's note).
  - One row per tile (the first one found is used). `a` – the Markdown text. No other columns are used.
  - The row is created on the first save, not when the tile is added.
  - Every save (typing and ticking a task box) uses `record: false`, so notes are not in undo/redo.
  - Ticking a box rewrites that line with `HB.md.toggleLine(text, index, checked)`.
- In memory only: `editing` (ids of notes in edit mode) and `timers` (the save delay). Both are keyed by `ctx.id`.

## Server actions
None.

## On a share page
The rendered Markdown and the word count show.
The Edit button is hidden, double-click does nothing (`edit()` returns when `HB.readOnly`) and task boxes cannot be ticked.

## Ideas for upgrades
- Add a `menu()` with "Copy as Markdown" and "Download .md", reading `rowOf(ctx).a`.
- Show the last save time from the row's `updated_at` next to the word count in `view()`.
- A `fontSize` tile setting (saved with `this.save`) applied to `.md` and `.note-edit` in `render()`.
