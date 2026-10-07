# 🔥 Habit tracker (`habits`)

A week grid of habits: one row per habit, one cell per day (Monday–Sunday) and a 🔥 streak column.
Click a cell to tick or untick that day. Today's column header is highlighted; future days are faded but still clickable.
‹ › move between weeks and "This week" jumps back. "+ Habit" (or ⋯ → Add habit…) adds a habit with a name, an icon (suggested from the name) and a colour.
Right-click a habit's name to edit or delete it.

## Files
- `manifest.json` – size 5×4, group Focus, order 120, entryKinds `["habit"]`.
- `gadget.js` – the class overrides `render` and `menu` (no `sig`, `keep`, `destroy` or `static defaults`).
  Helpers: `toggle(ctx, hid, day)` (a `pending` set stops a double click from making two rows), `streak(ctx, hid)`,
  `doneOn(ctx, hid, day)`, `rowsFor(ctx, hid)` and `editHabit(ctx, hab)` (add/edit form).
- `gadget.css` – `.habit-grid`, day headers `.hh` (`.today`), `.habit-name` (colour bar), cells `.hcell` (`.on` filled with the habit colour, `.future` faded), `.hstreak`.

## Data
- **Tile settings** on `ctx.id` (a mirror tile shows the same habits):
  `habits` – list of `{id ('h' + 6 random characters), name, icon, colour}` ([]).
  Written with `HB.setTileSettings(ctx.id, …)`, so add, edit and delete are undoable.
- **Rows**: `entries` with kind `habit`, on `ctx.id`.
  - `a` – the habit id, `day` – local day (YYYY-MM-DD), `num` – 1 done / 0 not done.
  - The first tick creates the row. Later clicks flip `num` on it; rows are never deleted.
  - Deleting a habit only removes it from `settings.habits`. Its rows stay in the database.
- Streak = days in a row with `num > 0`, counting back from today (or from yesterday when today is not ticked yet).
  Rows older than 400 days are not sent in `state`, so a streak cannot count past that.
- In memory only: the week offset (`offsets[ctx.id]`).

## Server actions
None.

## On a share page
The grid, the ticks and the streaks show, and the week buttons still work.
Cells cannot be clicked, "+ Habit" is hidden and the right-click menu on names is off.

## Ideas for upgrades
- Block ticks on future days: skip `toggle()` in the cell's `onclick` when `key > todayKey`.
- Reorder habits: "Move up" / "Move down" in the name's right-click menu, rewriting the `settings.habits` order.
- Weekly targets (e.g. 3 times a week): a `target` field in `editHabit()` and a "2/3" count next to the streak.
- Show the best streak next to the current one, computed beside `streak()`.
