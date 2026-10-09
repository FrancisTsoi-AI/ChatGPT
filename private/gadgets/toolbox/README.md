# 🧰 Toolbox (`toolbox`)

A grid of link cards, optionally split into named groups by header rows.
Click a card to open its link in a new tab. "Open all N ↗" opens every link, and each group header has its own "open N ↗" button (shown on hover, always shown on phones).
Paste an address, or `Name | address`, into the box at the bottom to add a link. The icon is suggested from the name.
Drag cards to reorder them, move them to another toolbox, or drop them on the trash zone. Right-click a card for Edit…, Open in new tab, Choose icon…, Colour, Move to tile (when this page has another toolbox) and Delete. Headers get the same menu without the two link items.

## Files
- `manifest.json` – size 4×5, group Everyday, order 10. No entryKinds, no uploads.
- `gadget.js` – the class overrides `render(body, ctx)` and `menu(tile, ctx)` only (no `sig`, `keep`, `destroy` or `static defaults`).
  Helpers in the same file: `linkEl` / `headerEl` (draw a card or header), `iconEl` (emoji, or a coloured first letter),
  `openAll` (opens tabs, asks first when there are more than 8, reports blocked pop-ups; exported as `HB.openLinks`),
  `edit` (edit dialog), `menu` (right-click menu of one row), `quickAdd` (the bottom input).
  Tile ⋯ menu: Open all links, Icons only, Add group header…, Add link….
- `gadget.css` – the card grid (`.links`, `.link-card`, `.link-icon`, `.link-name`), group headers (`.link-header`, `.link-open-group`),
  the top bar (`.tb-bar`) and the icons-only view (`.links.icons`). Tag chips on cards are hidden (`.link-card .chips`).

## Data
- **Tile settings** (`this.settings`, saved with `this.save(patch)`; this file calls the same `HB.setTileSettings(ctx.id, patch)`):
  `view` – `'icons'` shows icons only, anything else shows cards with names (default: unset = cards).
- **Rows**: `links` with `tile_id = ctx.id` (the content owner, so a mirror tile shows the same links).
  `kind` – `link` or `header`; `name` – card or group name; `url` – http(s), mailto or tel only (checked by `HB.normUrl`);
  `icon` – an emoji (empty = coloured letter); `colour`, `tags` – label and comma list (tags are searchable with Ctrl+K);
  `position` – order in the list. A header owns the links below it up to the next header.

## Server actions
None. There is no `server.php` in this folder, so any `g/toolbox/…` call answers 404.

## On a share page
- Visitors see the cards in the view the owner chose, and can open links, "Open all" and per-group "open N ↗".
- Hidden: the add box and the Cards/Icons toggle. The empty text reads "No links."
- Off: dragging, right-click menus (the browser menu shows instead), and the gadget's ⋯ menu items (only Enlarge remains).

## Ideas for upgrades
- Collapsible groups: keep collapsed header ids in `settings.collapsed`, toggle them from `headerEl`, and skip those links in `render`.
- Show tags on cards: add a `settings.showTags` toggle in `menu()` that adds a class to `.links`, and let that class undo the `.link-card .chips { display: none }` rule.
- "Sort A–Z" in `menu()`: sort each group's links by name and save with `S.reorder('links', ids)`.
- Make the "ask before opening more than 8 tabs" limit in `openAll` a tile setting.
