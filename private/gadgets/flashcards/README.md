# 🃏 Flashcards (`flashcards`)

A spaced-repetition deck. The tile shows how many cards are due, new today and in total, and a big "▶ Study N" button.
Study opens a full-window session. Click, Space or Enter shows the answer. Then grade with 1 Again, 2 Hard, 3 Good or 4 Easy (Space/Enter after the answer = Good, Esc closes).
Each grade button shows when the card would come back. Add cards one by one, import many from pasted text, or filter, edit and delete them in Browse.
The ⋯ menu has Study now, Add card…, Import cards…, Browse cards… and New cards per day (N)….

## Files
- `manifest.json` – size 3×4, group Study, order 70, entryKinds `["card"]`, searchKinds `["card"]` (Ctrl+K finds them).
- `gadget.js` – the class overrides only `render` and `menu` (no `sig`, `keep`, `destroy` or `static defaults`).
  Module functions: `next(card, grade)` (the SM-2 style scheduler), `queueFor(ctx)` (due cards + today's new cards),
  `editCard` (add/edit form, with "Add another card after this one"), `importCards` (`front | back` or tab-separated lines),
  `browse` (filterable modal list) and `study(ctx)` (the full-window session with its own key handler).
  Exposes `HB.srs = { next, preview, span }` for other code.
- `gadget.css` – tile counters (`.fc`, `.fc-n`, `.fc-btns`), the browse list (`.card-list`, `.card-row`),
  the study overlay (`.study-*`, grade buttons `.grade.g1`–`.g4`) and the share view (`.fc-ro*`).

## Data
- **Tile settings**: `newPerDay` – how many new cards may start per day (20). Set from the ⋯ menu with `HB.setTileSettings(ctx.id, …)`.
- **Rows**: `entries` with kind `card`, on `ctx.id` (a mirror tile shows the original's deck).
  - `a` – front (Markdown), `b` – back (Markdown), `tags` – comma tags (Browse filters on them too).
  - `due_at` – next review time (ISO). Empty means a new card that was never studied.
  - `data` – `{ivl (days), ease (starts at 2.5, never below 1.3), reps, lapses, first (local day of the first review), last (ms of the last review)}`.
  - `position` – order; new cards are taken in this order.
- "Again" makes the card due in 10 minutes and puts it at the end of the current session.
- Today's new-card allowance = `newPerDay` minus the cards whose `data.first` is today.
- Grades are saved with `record: false`, so they are not in undo/redo. Adding, editing, importing and deleting are.

## Server actions
None.

## On a share page
The tile shows "N cards · click a card to see its answer" and lists every card's front.
A click on a card shows or hides its back. There are no counts, no Study button and nothing is scheduled.
The ⋯ menu only offers Enlarge, so Add, Import, Browse and the daily limit are not reachable.

## Ideas for upgrades
- Reverse mode: a `reverse` tile setting read in `study()` so `b` is asked and `a` is the answer.
- A daily review cap: a `maxReviews` setting that trims the `due` list in `queueFor()`.
- Let `importCards()` read a third column as tags (imported rows get no tags today).
- Show `data.reps` / `data.lapses` as a chip in `browse()` to spot hard cards.
