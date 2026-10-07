# 🖌 Sketch board (`sketch`)

A freehand drawing board, saved as a PNG picture. Draw with the mouse, a pen or a finger; pick one of 7 colours, a pen size (Thin / Medium / Thick) or the Eraser (white, twice the pen size).
The toolbar also has **↶ Undo**, **Clear** (asks first, and can be undone), **⬇ PNG** (download) and a status text (Blank / Unsaved… / Saving… / Saved).
The drawing saves itself 1.5 s after the last stroke.

## Files
- `manifest.json` – size 6×5, group "Files & media", order 200, `uploads: "png"` (the server accepts only PNG for this tile, and page-wide file drops never land here).
- `gadget.js` – the class plus module state (`dirty`, `saving`, `again`, `versions`, all keyed by `ctx.id`):
  - `sig(ctx)` – `[file id, updated_at]` of the saved picture (or null), so only a newly saved picture redraws the tile.
  - `keep(ctx)` – true while the tile has unsaved strokes, so a sync does not wipe them.
  - `render(body, ctx)` – a 1600×1000 canvas (`W`, `H`) on white. Loads the saved PNG (its URL has `&v=updated_at` to skip stale caches) into the canvas and into a hidden `base` canvas.
    Pointer events draw smoothed strokes (`drawStroke`, using coalesced events). `undo()` drops the last stroke and repaints `base` plus the rest; `clear()` adds a "clear" step; `download()` saves `<tile title>.png`.
    Pending strokes are saved when the page is hidden and when the body is rebuilt or removed (`HB.onCleanup`).
  - `save(ctx, canvas, setStatus)` – `canvas.toBlob` → POST `upload` with `tile_id` and, if the tile already has a picture, `replace_id`.
    One save at a time per tile; a change during a save queues one more. Afterwards it calls `HB.board.markRendered()` so the tile is not redrawn under the pen.
  - No `menu`, `destroy` or `static defaults` override.
- `gadget.css` – toolbar and canvas: `.sk`, `.sk-bar`, `.sk-color` (`.on`), `.sk-sep`, `.sk-wrap` (a size container), `.sk-canvas` (scaled to fit at 16:10, `touch-action: none`). Prefix `sk-`.

## Data
- **Tile settings**: none. Pen colour, size and eraser live only in the open tile and reset on redraw.
- **Rows**: one `files` row per sketch tile (the first file of `ctx.id`, so a mirror tile shows the original's picture), named `sketch.png`, type `image/png`.
  Each save replaces the stored file in place (`replace_id`): the server swaps `stored_name`, `size`, `type` and `original_name`, clears `deleted_at`, and deletes the old file. The row id stays the same.
- The strokes themselves are not stored. Undo only covers strokes made since the tile was last drawn.

## Server actions
None. It uses the core `upload` route (`replace_id` is only accepted for `png` tiles) and `file.php?id=` to load the picture.

## On a share page
- The saved picture is always visible, even when the share link does not include files (`hb_share_allows_file` allows pictures of Sketch tiles).
- The toolbar is hidden (`.readonly .sk-bar`) and the canvas ignores the pointer (`.readonly .sk-canvas`), so nothing can be drawn or saved.
- The ⋯ menu only offers Enlarge / Restore.

## Ideas for upgrades
- A custom colour: add an `<input type="color">` to `.sk-bar` that sets `tool.color` and calls `mark()`.
- Keyboard undo: give the canvas `tabindex="0"` and call `undo()` on Ctrl+Z / Cmd+Z.
- Remember the last pen: store `tool` per tile in `localStorage` inside `mark()` and read it back at the start of `render()`.
- A `menu()` with **Download PNG** and **Clear board…**, reusing `download()` and `clear()` (move them out of `render()` first).
