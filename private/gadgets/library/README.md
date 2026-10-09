# 🗂️ Writer folder (`library`)

One tile that holds **many documents**: a list of pages and folders on the left (folders can hold folders), the open page on the right.
A page is a rich-text document (the same editor as the Writer: `HB.editor.rich`, see the Writer gadget's README.md) or a **code page** with colour highlighting.

## Using it
- **+ New** (or the tile's ⋯ menu) adds a page, a code page or a folder. The row menu (`⋯` on a row, or right-click) has *New … here* (folders), *Rename*, *Duplicate*, *Download*, *Move to* (any folder or the top level) and *Delete*.
- Click a page to open it; click a folder (or its arrow) to open or close it. The title is the big field above the text; the list updates as you type.
- **Drag** a row to reorder it, drop it on a folder's list to move it in, drop it on 🗑 Trash to delete it. Open a folder first to drop into it.
- **Filter…** hides everything that does not match (a folder stays if something inside matches).
- ☰ shows or hides the list. In a narrow tile the list slides over the page.
- Deleting a folder sends the folder and everything inside to the trash (one Ctrl+Z brings it all back).
- Ctrl+K finds text in pages and opens that page.
- A Writer tile can be moved in here: its ⋯ menu → *Move into a Writer folder*.
- ⋯ menu: *Expand / Collapse all folders*, *Download everything (.html)* (one file with every page, folders as headings).

## Files
- `manifest.json` – size 9×8, group Writing, order 11, entryKinds `["page"]`, searchKinds `["page"]`, uploads `"image"` (pictures in pages).
- `gadget.js` – the class: `tree()` (rows grouped by parent), `current()`, `select()`, `openEntry()` (Ctrl+K jump), `sig()` / `keep()` (redraw control), `saveSoon()` / `flush()`, `add()`, `remove()`, `moveTo()`, `duplicate()`, `download()`, `downloadAll()`, `rowMenu()`, `render()` (list + page), `drawPage()`.
- `gadget.css` – prefix `lib-`; narrow tiles use a container query (list overlays the page below 560 px).
- No server file: everything is stored through the normal `entries` rows.

## Data
`entries` rows of kind `page` on the tile (a mirror tile shows the original's pages):
| column | meaning |
|---|---|
| `a` | the text: cleaned HTML for pages, code for code pages, empty for folders |
| `b` | title (≤ 120 characters) |
| `num` | id of the folder it is in, `0` = top level (a row whose folder is gone shows at the top level) |
| `position` | order among its siblings (a drop renumbers the list) |
| `data` | `{t: 'page' \| 'code' \| 'folder', lang?, open?}`: `open` is whether a folder is expanded (saved, so every device agrees) |

Which page is open is remembered per browser (`localStorage` `hb:lib:<tile id>`), not saved to the server.
Pictures are `files` rows of the tile, shown as `<img src="file.php?id=N">`.
Saving works like the Writer: 700 ms after the last change, `{record: false}` (no board undo steps for typing), `keep()` blocks redraws while you type, `markRendered()` after the tile's own saves.

## Search and trash labels
`hb_search` shows `Title — start of the text` for pages; the trash lists a page by its title (`private/src/data.php`).

## On a share page
Read-only: the list (no buttons, no drag), the open page without a toolbar, to-do boxes cannot be ticked, other pages can be opened. Pictures are served because the manifest rule is `image`.

## Ideas for upgrades
- Drop onto a collapsed folder to open it after a moment (spring-loaded folders).
- Tags / colours per page (`entries.tags`, `entries.colour` exist) and a tag filter.
- Page history (keep the last few versions in `data`).
- Export as a zip with one `.html` per page and the pictures.
