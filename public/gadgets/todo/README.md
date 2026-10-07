# ✅ To-do (`todo`)

A task list split into buckets shown side by side: Urgent, Later, Brain-off and No category by default.
Type in a bucket's "Add task…" box and press Enter; `#words` in the text become tags.
Tick the box to mark a task done (it stays in place, struck through). Click the text to edit it inline (Enter saves, Esc cancels). × deletes.
Drag tasks between buckets or to another To-do tile, or drop them on the trash zone. Right-click a task for Edit text, Colour & tags…, Move to bucket, Move to tile and Delete.

## Files
- `manifest.json` – size 6×6, group Everyday, order 20. No entryKinds, no uploads.
- `gadget.js` – the class overrides `render(body, ctx)`, `menu(tile, ctx)` and `static defaults()` (no `sig`, `keep` or `destroy`).
  Helpers in the same file: `bucketsOf` (bucket list, always ends with "No category"), `taskEl` (one task row), `saveText`,
  `menu` (right-click menu of one task), `addBucket`, `renameBucket`, `deleteBucket`, `saveBuckets`.
  Each bucket header has a ⋯ button: Rename bucket…, Delete bucket (not allowed for "No category"; its tasks move to "No category").
  Tile ⋯ menu: Add bucket…, Clear completed (N) – deletes every done task in one undo step.
- `gadget.css` – the bucket columns (`.buckets`, `.bucket`, `.bucket-head`, `.bucket-name`, `.count`) and task rows
  (`.tasks`, `.task`, `.task-check`, `.task-text`, `.task.done`). The four default buckets get a coloured top border
  (urgent red, later blue, brainoff teal, none grey).

## Data
- **Tile settings** (`this.settings`, saved with `this.save(patch)`; this file calls the same `HB.setTileSettings(ctx.id, patch)`):
  `buckets` – array of `{id, name}` in display order (default `HB.defaultBuckets()`: `urgent`, `later`, `brainoff`, `none`).
  New buckets get an id like `b4k2x9` and are inserted before "No category".
- **Rows**: `tasks` with `tile_id = ctx.id` (the content owner, so a mirror tile shows the same tasks).
  `bucket` – bucket id (an unknown id shows under "No category"); `text` – up to 1000 chars;
  `done_at` – null while open, the tick time when done; `colour`, `tags` – label and comma list;
  `position` – order inside the bucket. "Move to bucket" puts the task at the end; "Move to tile" puts it in `none`.
- The count badge in a bucket header is the number of open (not done) tasks.

## Server actions
None. There is no `private/gadgets/todo.php`, so any `g/todo/…` call answers 404.

## On a share page
- Visitors see every bucket, task, tag chip and done state, with the open counts.
- Hidden: the add boxes, the × buttons and the bucket ⋯ buttons. The tick boxes cannot be clicked.
- Off: inline editing, dragging, right-click menus, and the gadget's ⋯ menu items (only Enlarge remains).

## Ideas for upgrades
- Hide done tasks: add a `settings.hideDone` toggle in `menu()` and filter `mine` by `done_at` in `render`.
- Due dates: add a "Due date…" item to the task `menu()`. `tasks` has no date column, so add one to `schema.sql` and `hb_spec()` first.
- Bucket colours: store a `colour` in each `{id, name}` bucket, set it as `data-color` on the `.bucket` section in `render`,
  and use `var(--accent)` for that bucket's top border in `gadget.css`.
- Reorder buckets: add "Move left / right" to the bucket ⋯ menu that swaps entries and calls `saveBuckets`.
