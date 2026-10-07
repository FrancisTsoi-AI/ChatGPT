# 📁 Files (`files`)

A list of uploaded files with previews and downloads. Upload with **⬆ Upload**, or drop files (or whole folders) anywhere on the page.
Click a file to preview it, double-click its name to rename it, and right-click it for Open / preview, Download, Rename, Colour & tags…, Move to tile ▸ and Delete.
Drag files to reorder them, to move them into another Files or Music tile, or onto the trash zone.

## Files
- `manifest.json` – size 4×5, group "Files & media", order 180, `uploads: "any"` (any file type).
- `gadget.js` – a tiny class. It overrides no `sig`, `keep`, `destroy` or `static defaults`.
  - `render(body, ctx)` – just calls `HB.fileTileRender(body, ctx)` from `js/filekit.js`.
  - `menu(tile, ctx)` – **Upload files…** (clicks the tile's hidden file input) and **Thumbnail view** (toggles `view`).
- No `gadget.css`: the list styles (`.files.list`, `.files.grid`, `.file`, `.thumb`, `.file-bar`) live in `css/app.css`.
- The real work is shared with the Music gadget in `js/filekit.js`:
  - `HB.fileTileRender(body, ctx, opt)` – upload bar with a file count, the list (thumbnail for images, an icon by type otherwise, name, size, date, tag chips, ⬇ and ×), and Sortable drag (`HB.sortable` + `HB.listDrop`).
  - `HB.preview(f)` – a dialog for images, PDF, audio, video and plain text under 400 KB; other types show "No preview" and a Download button.
  - `HB.fileUrl(f, dl)` – `file.php?id=…` (`&dl=1` to download). "Move to tile ▸" lists the other non-mirror Files and Music tiles of the scenario.
- Uploads go through `js/upload.js` (queue, chunking, drop anywhere).

## Data
- **Tile settings** (`this.settings`; written with `HB.setTileSettings(ctx.id, …)`, like `this.save(patch)`): `view` – `list` or `grid` (`list`).
- **Rows**: `files`, with `tile_id` = the content owner (`ctx.id`), so a mirror tile shows and receives the original's files.
  - `original_name` – shown and renamable (≤255 chars). `stored_name` – random 32-hex name in `private/storage/files`.
  - `size`, `created_at` (shown), and `type` (MIME; the server goes by the file extension first, then `finfo`).
  - `position` – order in the list (set by drag). `colour`, `tags` – from **Colour & tags…**; a tag chip opens search.
  - Delete is soft (`deleted_at` → the trash). The stored file is removed only when the row is purged.

## Server actions
None. It uses the core routes `upload` (whole file) and `upload-chunk` (bigger files, in ordered chunks, each retried), and `file.php?id=` to serve.
Two uploads run at a time, each with a progress toast. A drop on empty page space goes to the first Files tile of the scenario (a new Files tile is made if there is none).
The exception: when every dropped file is audio and the scenario has a Music tile, they go there.

## On a share page
- Files are listed only if the share link allows file downloads (`include_files`). Otherwise the list is empty.
- Preview and the ⬇ download button work. Upload, × delete, rename, drag and the right-click menu are off.
- The ⋯ menu only offers Enlarge / Restore.

## Ideas for upgrades
- Sorting: a `settings.sort` (`name`, `date`, `size` or manual) applied to `files` in `HB.fileTileRender` before the list is built, plus a menu item in `menu()`.
- A filter box in the `.file-bar` that hides rows whose `original_name` does not match.
- Show the total size next to the file count in the `.file-bar` (`HB.size` of the summed `f.size`).
- "Download all as zip": a new `private/gadgets/files.php` action that zips this tile's files (copy the ZipArchive pattern of `hb_export_zip()` in `src/files.php`).
