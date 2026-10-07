# ⏳ Countdown (`countdown`)

A list of named deadlines, each with the number of days left (or days ago) in large digits.
Upcoming dates come first (soonest at the top), then past ones (most recent first, faded).
Deadlines 3 days away or less turn the warning colour. Day counts follow the local calendar and refresh just after midnight.
Press "+ Deadline" (or "Add deadline…" in the tile ⋯ menu) to add one. Click a deadline's name to edit it, press × to delete it, or right-click it for Edit… and Delete.

## Files
- `manifest.json` – size 3×4, group Everyday, order 60. No entryKinds, no uploads.
- `gadget.js` – the class overrides `render(body, ctx)` and `menu(tile, ctx)` (no `sig`, `keep`, `destroy` or `static defaults`).
  Helpers in the same file: `daysLeft(date)` (whole local days from today, negative = past; exported as `HB.daysLeft`),
  `label(n)` ("Today / now", "1 day left", "N days left", "1 day ago", "N days ago"), `editItem(ctx, item)` (add / edit dialog: Name up to 80 chars, Date).
  `render` sets a timer for 00:00:02 local time that calls `HB.board.reconcile(true)` (redraws every tile), cleared through `HB.onCleanup`.
- `gadget.css` – the list (`.countdowns`, `.cd`), the day number (`.cd-days`), name and date (`.cd-info`, `.cd-name`, `.cd-date`),
  and the states `.cd.soon` (warning colour) and `.cd.past` (faded, danger colour).

## Data
- **Tile settings** (`this.settings`, saved with `this.save(patch)`; this file calls the same `HB.setTileSettings(ctx.id, patch)`):
  `items` – array of `{id, name, date}`; `id` like `c4k2x9`, `date` as `YYYY-MM-DD` (default: unset = no deadlines).
  Items whose `date` is not `YYYY-MM-DD` are not shown. A mirror tile reads the items of `ctx.id`, the content owner.
- **Rows**: none. Deleting a deadline only changes the settings, so it can be undone but does not go to the trash.

## Server actions
None. There is no `private/gadgets/countdown.php`, so any `g/countdown/…` call answers 404.

## On a share page
- Visitors see every deadline, with day counts worked out from their own local date.
- Hidden: "+ Deadline" and the × buttons.
- Off: right-click menus and the gadget's ⋯ menu items (only Enlarge remains). Clicking a name does nothing (`editItem()` returns at once when `HB.readOnly`).

## Ideas for upgrades
- Hide past deadlines: a `settings.hidePast` switch in `menu()`, used to drop `past` in `render`.
- Adjustable "soon": replace the fixed `n <= 3` in `render` with `settings.soonDays`.
- Weeks for far dates: in `label(n)`, show "N weeks left" when `n` is 28 or more.
- Clear past: a `menu()` item that saves `items` without the past ones, in one `HB.setTileSettings` call.
