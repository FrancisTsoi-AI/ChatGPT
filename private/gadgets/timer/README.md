# ⏱ Timer (`timer`)

A countdown timer and a stopwatch in one tile. Pick "Count down" or "Count up" (locked while running), then Start / Pause and Reset.
Countdown presets: 1, 5, 10, 25, 45 and 60 minutes, or Custom… (hours, minutes, seconds; at most 99 h).
When a countdown ends it plays three soft beeps, shows a "⏰ Timer finished" toast with the tile title, and sets the page title to "⏰ Time is up" for 8 s. The digits then blink red.
The state is saved in the tile settings, so a running timer keeps going after a reload. A countdown that ended while the page was closed is marked done without a sound.

## Files
- `manifest.json` – size 3×4, group Focus, order 100. No entryKinds, no uploads.
- `gadget.js` – the class overrides only `render` (no `menu`, `sig`, `keep`, `destroy` or `static defaults`).
  - Inside `render`: `paint()` updates the digits every 250 ms; `start`, `pause`, `reset` and `finish(silent)` change the state.
    The interval is stopped with `HB.onCleanup`.
  - Module: `prime()` creates the AudioContext on the Start click (browsers need a click), `chime()` plays the beeps
    (exposed as `HB.chime`), `clock(ms)` formats `h:mm:ss`, `elapsed(st)` adds the running part to `el`.
- `gadget.css` – `.timer` (a size container, so the digits scale with the tile), `.timer-time` (`.over` blinks red), `.timer-btns`, `.presets`.

## Data
- **Tile settings** on `ctx.id` (a mirror tile shows and drives the same timer). They are written with
  `S.update('tiles', ctx.id, …, { record: false })`, so timer clicks are not in undo/redo:
  - `mode` – `'down'` or `'up'` (`'down'`)
  - `dur` – countdown length in seconds (1500 = 25 min)
  - `since` – ms timestamp when the current run started; null when stopped
  - `el` – ms already counted before `since` (0)
  - `done` – true after a countdown finished (false)
- Start after a finished countdown begins again from the full length. Changing mode or preset resets the time.
- **Rows**: none.

## Server actions
None.

## On a share page
The visitor sees the time and the status label ("Ready", "Counting down", "Paused"…). It ticks if the owner left it running.
Mode buttons, Start/Reset and the presets are hidden.
If a countdown ends while a visitor watches, they get the finished toast (no sound) and a read-only notice; nothing is saved.

## Ideas for upgrades
- Add `static defaults()` returning `{ mode: 'down', dur: 1500 }`, so new tiles store their setup.
- Pomodoro breaks: a `breakDur` setting that `finish()` uses to start a short countdown right away.
- Desktop notification: ask for permission in `start()` and show a `Notification` in `finish()` when the tab is hidden.
- Skip the `set()` call in `finish()` when `this.readOnly`, so share visitors get no read-only toast.
