# 🔎 Search box (`search`)

A search box with a row of site chips (Google Scholar, Google, library catalogues, Wikipedia…).
Pick a chip, type your words and press Enter or "Search": the chosen site's results open in a new tab.
The **Search all N ↗** button next to Search opens the same words in one tab per site of a group (default: HKMU, Lancaster, HKU, HKPL, Google); right-click a chip for "Include in / Leave out of Search all". Browsers may block the extra tabs until pop-ups are allowed for the site (a toast says so).
Some sites have no search pattern yet (marked ⚙). Pressing "Set up…" asks for a word you searched there and the address of the results page, and learns the pattern from it.
Right-click a chip for "Set up / re-learn this search…" and "Open its home page". The tile ⋯ menu has "Edit search sites…" and "Restore default sites".

## Files
- `manifest.json` – size 4×3, group Web, order 150. No entryKinds, no uploads.
- `gadget.js` – the class overrides `render(body, ctx)`, `menu(tile, ctx)` and `static defaults()` (no `sig`, `keep` or `destroy`).
  In the same file: `DEFAULTS` (the 9 built-in sites), `learn(url, term)` (turns a results address into a pattern by
  replacing the search word with `{q}`; tries the encoded word, `+` for spaces, the raw word and lower-case; exported as `HB.searchLearn`),
  `openGroup(sites, q)` (Search all, via `HB.openLinks`), `enginesOf` (also upgrades an old saved library placeholder to its real pattern), `setup(ctx, engines, eng)` (the learn dialog; repeats until it succeeds or is cancelled), `open(url, q)`.
  "Edit search sites…" takes one `Name | address` per line; lines without an `http(s)://` address are skipped, names are cut to 40 chars.
- `gadget.css` – the site chips: `.engines`, `.engine`, `.engine.on` (selected), `.engine.setup` (adds " ⚙").
  The input row reuses the shared `.add-row` style.

## Data
- **Tile settings** (`this.settings`, saved with `this.save(patch)`; this file calls the same `HB.setTileSettings(ctx.id, patch)`):
  - `sel` – id of the chosen site (default `'scholar'`; an unknown id falls back to the first site).
  - `all` – ids of the sites "Search all" opens (default unset = HKMU, Lancaster, HKU, HKPL, Google; sites without `{q}` are skipped).
  - `engines` – array of `{id, name, url}`; `url` holds `{q}` where the words go, or no `{q}` = needs setup
    (default: unset = `DEFAULTS`; the list is saved into the tile the first time you pick another chip).
- Built-in sites: Google Scholar, Google, HKMU Library, Lancaster Library, HKU Libraries (Primo catalogues), HKPL (webcat), Google Books, Wikipedia, YouTube.
- **Rows**: none. Search words are never saved.

## Server actions
None. There is no `server.php` in this folder, so any `g/search/…` call answers 404.

## On a share page
- Visitors can search. The form has the extra class `search-form`, which the share-page CSS keeps visible.
- Sites that still need the one-time setup are left out. Picking another site is kept in memory (`this.local`), not saved.
- The right-click "Set up / re-learn" menu and the gadget's ⋯ menu items are not offered.

## Ideas for upgrades
- Keyboard switch: in the input's `keydown` handler, let Alt+↑/↓ move `sel` to the previous/next site.
- Recent searches: keep the last 5 words in `settings.recent` and show them as small buttons under the input.
