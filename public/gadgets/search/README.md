# 🔎 Search box (`search`)

A search box with a row of site chips (Google Scholar, Google, library catalogues, Wikipedia…).
Pick a chip, type your words and press Enter or "Search": the chosen site's results open in a new tab.
Some sites have no search pattern yet (marked ⚙). Pressing "Set up…" asks for a word you searched there and the address of the results page, and learns the pattern from it.
Right-click a chip for "Set up / re-learn this search…" and "Open its home page". The tile ⋯ menu has "Edit search sites…" and "Restore default sites".

## Files
- `manifest.json` – size 4×3, group Web, order 150. No entryKinds, no uploads.
- `gadget.js` – the class overrides `render(body, ctx)`, `menu(tile, ctx)` and `static defaults()` (no `sig`, `keep` or `destroy`).
  In the same file: `DEFAULTS` (the 8 built-in sites), `learn(url, term)` (turns a results address into a pattern by
  replacing the search word with `{q}`; tries the encoded word, `+` for spaces, the raw word and lower-case; exported as `HB.searchLearn`),
  `setup(ctx, engines, eng)` (the learn dialog; repeats until it succeeds or is cancelled), `open(url, q)`.
  "Edit search sites…" takes one `Name | address` per line; lines without an `http(s)://` address are skipped, names are cut to 40 chars.
- `gadget.css` – the site chips: `.engines`, `.engine`, `.engine.on` (selected), `.engine.setup` (adds " ⚙").
  The input row reuses the shared `.add-row` style.

## Data
- **Tile settings** (`this.settings`, saved with `this.save(patch)`; this file calls the same `HB.setTileSettings(ctx.id, patch)`):
  - `sel` – id of the chosen site (default `'scholar'`; an unknown id falls back to the first site).
  - `engines` – array of `{id, name, url}`; `url` holds `{q}` where the words go, or no `{q}` = needs setup
    (default: unset = `DEFAULTS`; the list is saved into the tile the first time you pick another chip).
- Built-in sites: Google Scholar, Google, HKMU Library ⚙, Lancaster Library ⚙, HKU Libraries ⚙, Google Books, Wikipedia, YouTube.
- **Rows**: none. Search words are never saved.

## Server actions
None. There is no `private/gadgets/search.php`, so any `g/search/…` call answers 404.

## On a share page
- Visitors can search. The form has the extra class `search-form`, which the share-page CSS keeps visible.
- Sites that still need the one-time setup are left out. Picking another site is kept in memory (`this.local`), not saved.
- The right-click "Set up / re-learn" menu and the gadget's ⋯ menu items are not offered.

## Ideas for upgrades
- "Search all sites": a button in `render` that opens the words in every site with `{q}`, through `HB.openLinks` from the toolbox gadget (it handles pop-up blocking; check it exists first).
- Keyboard switch: in the input's `keydown` handler, let Alt+↑/↓ move `sel` to the previous/next site.
- Recent searches: keep the last 5 words in `settings.recent` and show them as small buttons under the input.
