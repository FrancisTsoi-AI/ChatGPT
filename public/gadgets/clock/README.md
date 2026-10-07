# 🕒 Clock (`clock`)

Shows the current time in large digits with the full date below it (for example "Wednesday, 7 October 2026").
It uses the browser's own time zone and language, and updates every second.
The digits grow and shrink with the tile size. The tile ⋯ menu has two switches: 12-hour clock and Show seconds.

## Files
- `manifest.json` – size 3×2, group Everyday, order 50. No entryKinds, no uploads.
- `gadget.js` – the class overrides `render(body, ctx)` and `menu(tile, ctx)` (no `sig`, `keep`, `destroy` or `static defaults`).
  `render` builds the time and date lines and starts a 1-second `setInterval` (`tick`), stopped through `HB.onCleanup` when the body is rebuilt or the tile removed.
  Time: `toLocaleTimeString` with 2-digit hour and minute (plus seconds when on). Date: `toLocaleDateString` with weekday, day, month and year.
- `gadget.css` – `.clock` (a size container, centred), `.clock-time` (font size in `cqw`/`cqh` units, tabular digits) and `.clock-date` (muted).

## Data
- **Tile settings** (`this.settings`, saved with `this.save(patch)`; this file calls the same `HB.setTileSettings(ctx.id, patch)`):
  - `h12` – true = 12-hour clock, otherwise 24-hour (default: unset = 24-hour).
  - `seconds` – true = show seconds (default: unset = hidden).
- **Rows**: none.
- A clock tile cannot be mirrored: the grid leaves "Also show in…" out of the tile menu for `clock`.

## Server actions
None. There is no `private/gadgets/clock.php`, so any `g/clock/…` call answers 404.

## On a share page
- Visitors see a running clock in their own time zone and language, using the owner's 12-hour and seconds choices.
- The tile ⋯ menu only offers Enlarge, so the switches cannot be changed.

## Ideas for upgrades
- Time zone: add a `settings.tz` (for example `Europe/London`) chosen from `menu()`, and pass it as `timeZone` to both calls in `tick`.
- Hide the date: add a `settings.noDate` switch in `menu()` and skip the `.clock-date` line in `render`.
- Short date: a `settings.dateStyle` switch in `menu()` that uses `{ weekday: 'short', month: 'short', day: 'numeric' }` in `tick`.
