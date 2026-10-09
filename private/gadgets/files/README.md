# 📁 Files (`files`)

A list of uploaded files with previews and downloads, organised in **folders** (nested as deep as you like). Upload with **⬆ Upload**, or drop files (or whole folders) anywhere on the page.
**📁 New folder** makes a folder in the one you have open; click a folder to open it, use the breadcrumb (*All files › Docs › 2024*) to go back up.
Drag a file onto a folder (or onto a breadcrumb step) to move it there, or right-click it → **Move to folder ▸**. Uploads go into the folder that is open.
A folder dropped from your computer keeps its structure (sub-folders are created, a folder with the same name is reused).
Right-click a folder for Open, Rename, Move to folder ▸ and **Delete folder** (its files and sub-folders move up one level, nothing is lost; undo works).
Click a file to preview it, double-click its name to rename it, and right-click it for Open / preview, Download, Rename, Colour & tags…, Move to tile ▸ and Delete.
Drag files to reorder them, to move them into another Files or Music tile, or onto the trash zone.

## Files
- `manifest.json` – size 4×5, group "Files & media", order 180, `uploads: "any"` (any file type), `entryKinds: ["folder"]`.
- `gadget.js` – a tiny class. It overrides no `sig`, `keep`, `destroy` or `static defaults`.
  - `render(body, ctx)` – just calls `HB.fileTileRender(body, ctx, { folders: true })` from `js/filekit.js` (the Music tile calls it without `folders`, so it stays a flat list).
  - `menu(tile, ctx)` – **Upload files…** (clicks the tile's hidden file input) and **Thumbnail view** (toggles `view`).
- No `gadget.css`: the list styles (`.files.list`, `.files.grid`, `.file`, `.thumb`, `.file-bar`) live in `css/app.css`.
- The real work is shared with the Music gadget in `js/filekit.js`:
  - `HB.fileTileRender(body, ctx, opt)` – upload bar with a file count (and **📁 New folder**), breadcrumb, folder rows (each one is a Sortable drop target for files; so is each breadcrumb step), the list (thumbnail for images, an icon by type otherwise, name, size, date, tag chips, ⬇ and ×), and Sortable drag (`HB.sortable` + `HB.listDrop`).
  - `HB.preview(f)` – a dialog for images, PDF, audio, video and plain text under 400 KB; other types show "No preview" and a Download button.
  - `HB.fileUrl(f, dl)` – `file.php?id=…` (`&dl=1` to download). "Move to tile ▸" lists the other non-mirror Files and Music tiles of the scenario.
- Uploads go through `js/upload.js` (queue, chunking, drop anywhere).

## Data
- **Tile settings** (`this.settings`; written with `HB.setTileSettings(ctx.id, …)`, like `this.save(patch)`): `view` – `list` or `grid` (`list`).
- **Folders**: `entries` rows with `kind: 'folder'`, owned by the content tile: `a` = name, `num` = parent folder id (0 = top level). Shown sorted by name. The folder that is open is kept in memory only (`HB.folderCur[contentTileId]`), so a reload starts at the top.
  A file's folder is `files.folder_id` (0 = top level). A file whose folder is gone (trashed) shows at the top level; a folder whose parent is gone shows at the top level.
  The DB column is added automatically by `hb_ensure_schema()` the first time the gateway runs after an upgrade (and is in `schema.sql` for new installs).
- **Rows**: `files`, with `tile_id` = the content owner (`ctx.id`), so a mirror tile shows and receives the original's files.
  - `original_name` – shown and renamable (≤255 chars). `stored_name` – random 32-hex name in `private/storage/files`.
  - `size`, `created_at` (shown), and `type` (MIME; the server goes by the file extension first, then `finfo`).
  - `position` – order in the list (set by drag). `colour`, `tags` – from **Colour & tags…**; a tag chip opens search.
  - Delete is soft (`deleted_at` → the trash). The stored file is removed only when the row is purged.

## Server actions
None. It uses the core routes `upload` (whole file) and `upload-chunk` (bigger files, in ordered chunks, each retried), and `file.php?id=` to serve.
Both upload routes take an optional `folder_id`; the server checks it is a live folder of the same tile and otherwise stores the file at the top level.
The zip backup keeps the tree: `files/<folder path>/<id>-<name>`.
Two uploads run at a time, each with a progress toast. A drop on empty page space goes to the first Files tile of the scenario (a new Files tile is made if there is none).
The exception: when every dropped file is audio and the scenario has a Music tile, they go there.

## On a share page
- Files are listed only if the share link allows file downloads (`include_files`). Otherwise the list is empty (folder names are not sent either).
- Visitors can open folders and use the breadcrumb; New folder, rename, delete and drag are off.
- Preview and the ⬇ download button work. Upload, × delete, rename, drag and the right-click menu are off.
- The ⋯ menu only offers Enlarge / Restore.

## Ideas for upgrades
- Sorting: a `settings.sort` (`name`, `date`, `size` or manual) applied to `files` in `HB.fileTileRender` before the list is built, plus a menu item in `menu()`.
- A filter box in the `.file-bar` that hides rows whose `original_name` does not match.
- Move a folder by drag (today: right-click → Move to folder), and let folders be re-ordered by hand (`position`).
- Show the total size next to the file count in the `.file-bar` (`HB.size` of the summed `f.size`).
- "Download all as zip": a new `server.php` action that zips this tile's files (copy the ZipArchive pattern of `hb_export_zip()` in `src/files.php`).
