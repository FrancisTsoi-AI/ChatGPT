# 📊 Stats & progress (`stats`)

Counters with an optional target and progress bar, for things like words written or papers read.
Each counter has − and + buttons that change it by its step. With a target it shows "value / target unit", a bar and a percentage; the bar turns green at 100 %.
Click a counter's name to edit it. Right-click a counter for Edit…, Reset to 0 and Delete.
"+ Counter" (or ⋯ → Add counter…) adds one.

## Files
- `manifest.json` – size 3×4, group Focus, order 130. No entryKinds, no uploads.
- `gadget.js` – the class overrides `render` and `menu` (no `sig`, `keep`, `destroy` or `static defaults`).
  Helpers: `edit(ctx, item)` (add/edit form: name, value, target, unit, step, colour), `bump(ctx, item, ±1)`,
  `num(v)` (reads a number and ignores commas; bad input becomes 0) and `fmt(n)` (thousands separators from 1000, else up to 2 decimals).
- `gadget.css` – `.stats` list, `.stat` cards (`.done` makes the bar green), `.stat-top`, `.stat-name`, `.stat-val`, `.stat-btns`.
  The bar itself is the shared `.bar` style, tinted by the counter's colour.

## Data
- **Tile settings** on `ctx.id` (a mirror tile shows the same counters):
  `items` – list of counters `{id ('k' + 6 random characters), name, value, target (0 = none), unit, step (1), colour}` ([]).
  Every change, including each + / − click, goes through `HB.setTileSettings(ctx.id, …)`, so it is undoable.
- `value` is rounded to 3 decimals after each step. The percentage is clamped to 0–100.
- **Rows**: none.

## Server actions
None.

## On a share page
Names, values, bars and percentages show.
The − / + buttons and "+ Counter" are hidden, and the right-click menu is off.
Clicking a name does nothing (`edit()` returns at once when `HB.readOnly`).

## Ideas for upgrades
- A "Set value…" item in the right-click menu that asks only for the number, instead of the full `edit()` form.
- Reorder counters by drag: `HB.sortable` on the `.stats` list, then save the new `items` order with `this.save`.
- A deadline per counter: a `deadline` field in `edit()` and a "N per day needed" line in `render()`.
