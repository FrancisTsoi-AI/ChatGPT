# 🗓 Time log (`timelog`)

Tracks time per label (a project or task). Type what you are working on, then ▶ Start (or press Enter); ■ Stop saves the time as one entry.
The label box suggests the 12 most recent labels. The clock ticks while running, and the run survives a reload because it is saved in the tile settings.
Below: totals for today and for the shown week, a bar per label for that week (Monday–Sunday), and its 8 newest entries with a × to delete.
‹ › switch weeks. "+ Add time" (or ⋯ → Add time manually…) adds minutes to any day.

## Files
- `manifest.json` – size 4×6, group Focus, order 110, entryKinds `["time"]`.
- `gadget.js` – the class overrides `render` and `menu` (no `sig`, `keep`, `destroy` or `static defaults`).
  - `manual(ctx, labels)` – the Add time form (label, minutes, day).
  - Inside `render`: `setRun(r)` saves the running timer; the Start/Stop click creates the entry on Stop.
    The 1-second clock tick is stopped with `HB.onCleanup`.
  - `hms(s)` / `hm(s)` format seconds as `h:mm:ss` and `1h 05m`.
- `gadget.css` – `.tl-top` (label + button), `.tl-clock`, `.tl-sums`, `.tl-bars` / `.tl-bar*`, `.tl-recent` / `.tl-row*`.

## Data
- **Tile settings** on `ctx.id` (a mirror tile shows and drives the same run):
  `run` – `{label, start (ms)}` while a timer runs, null otherwise.
  Written with `S.update('tiles', ctx.id, …, { record: false })`, so Start/Stop is not in undo/redo.
- **Rows**: `entries` with kind `time`, on `ctx.id`.
  - `a` – label, `day` – local day (YYYY-MM-DD) when the run started, `num` – seconds.
  - `data` – `{start, end}` (ms) for timed runs, `{manual: true}` for manual ones.
  - Runs shorter than 1 s are not saved. Deleting an entry (×) is undoable.
  - Rows older than 400 days are not sent in `state`, so very old weeks look empty.
- Today's total includes the running time as of the last redraw (it does not tick).
- In memory only: the week offset (`weeks[ctx.id]`).

## Server actions
None.

## On a share page
Totals, bars and recent entries show, and ‹ › still browse the weeks. If the owner left a run going, the clock ticks.
The label box, Start/Stop, "+ Add time" and the × buttons are hidden.

## Ideas for upgrades
- Edit an entry: an `oncontextmenu` on `.tl-row` that opens a form like `manual()` and calls `S.update`.
- Export the shown week as CSV from `menu()`, using the same `inWeek` filter as `render()`.
- Make today's total tick by updating `.tl-today` in the same interval as the clock.
- Weekly goals per label: a `goals` setting (saved with `this.save`) drawn as a marker on each bar.
