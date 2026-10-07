# Gadget API

Each gadget (tile type) in Home Base is a **self-contained module**: one folder, one class, one manifest.
To build or upgrade a gadget you only read and change **its own folder**, plus its server file if it has one.
The rest of the app stays untouched. This also keeps AI sessions small: hand over this file and the
gadget's folder, not the whole code base.

```
public/gadgets/<type>/            ← everything the browser needs
  manifest.json                     name, icon, menu group, default size, data kinds, upload rule
  gadget.js                         class extends HB.Gadget, registered with HB.gadgets.define('<type>', …)
  gadget.css                        optional styles (prefix your classes, e.g. .yt-…)
  README.md                         what it does, its data, ideas (not served: .htaccess blocks it)
private/gadgets/<type>.php        ← optional: the gadget's server actions (fetching, files, anything PHP)
```

**Nothing is registered by hand.** The server reads the manifests to learn which tile types, entry kinds
and upload rules exist. `assets.php` bundles every gadget's JS and CSS with the core files into one
versioned download. Drop a folder in and reload; delete the folder and the tile type is gone. Tiles of
a missing type stay in the database and say "gadget is not installed" until the folder is back.

---

## 1. manifest.json

```json
{
  "type": "youtube",
  "version": "1.0.0",
  "label": "YouTube playlist",
  "icon": "▶️",
  "hint": "Your own list of videos, played in order",
  "group": "Files & media",
  "order": 25,
  "size": { "w": 5, "h": 7 },
  "entryKinds": ["video"],
  "searchKinds": ["video"]
}
```

| field | required | meaning |
|---|---|---|
| `type` | yes | Must equal the folder name. `^[a-z][a-z0-9_]{1,19}$`. Stored in `tiles.type`, so never rename it once tiles exist. |
| `label`, `icon`, `hint` | yes | Shown in the **+ Tile** menu, the command bar (Ctrl+K) and the tile header. |
| `group` | yes | One of `Everyday`, `Writing`, `Study`, `Focus`, `Web`, `Files & media` (others sort last). |
| `order` | no | Position inside its group (smaller is higher; default 999). |
| `size` | yes | Default `w` × `h` on the 12-column grid. |
| `version` | no | Your own version number. Raise it when you change the gadget; the app doesn't read it. |
| `entryKinds` | no | Kinds of rows this gadget stores in the `entries` table (`^[a-z][a-z0-9_]{0,11}$`). Only a tile of this type may own rows of these kinds. A kind belongs to one gadget. |
| `searchKinds` | no | Which of your `entryKinds` the search box (Ctrl+K) looks through (`a`, `b`, tags). |
| `uploads` | no | Lets files be uploaded into the tile: `any` (any file), `audio` (audio only), `image` (png/jpeg/gif/webp/avif), `png` (one PNG that can be replaced in place, used by Sketch). Leave it out for no uploads. |

A folder with a bad or missing `manifest.json` or `gadget.js` is skipped. The server logs it to the PHP
error log.

---

## 2. The class

```js
(function () {
  const HB = window.HB;
  const h = HB.h;

  HB.gadgets.define('hello', class extends HB.Gadget {
    static defaults() { return { greeting: 'Hello' }; }      // settings of a brand-new tile

    render(body, ctx) {                                     // draw the tile body (called on every redraw)
      const s = ctx.settings;
      body.append(h('p', { class: 'hello-text', text: s.greeting + ', ' + (s.name || 'you') + '!' }));
      if (!this.readOnly) body.append(HB.addRow({ placeholder: 'Your name', key: 'hello-name', onAdd: (v) => this.save({ name: v }, 'set name') }));
    }

    menu(tile, ctx) {                                       // extra items in the tile's ⋯ menu
      return [{ label: 'Say hi instead', checked: ctx.settings.greeting === 'Hi', onClick: () => this.save({ greeting: 'Hi' }) }];
    }
  });
})();
```

### Lifecycle

* There is **one instance per tile on screen**, created on first use (`HB.gadgets.instance(tile)`). Fields
  you set on `this` last until the tile is removed or the scenario is switched away. Use them for
  in-memory state such as `this.autoplay` or a cache.
* `render(body, ctx)` gets an **empty** body element each time. Build the DOM, then return. The board
  rebuilds the body only when the tile's *signature* changes (see `sig`). Your own small DOM updates
  (a ticking clock, a progress bar) can happen in between.
* Timers, listeners on `document`, players and similar go in `HB.onCleanup(body, fn)`. That runs before
  the next rebuild and when the tile goes away. `destroy()` runs once when the instance itself is dropped.

### Override (all optional except `render`)

| method | purpose |
|---|---|
| `render(body, ctx)` | Draw the body. **Required.** |
| `menu(tile, ctx)` | Array of menu items: `{label, onClick, checked, danger, disabled, hint, children:[…]}`, `{sep:true}`, `{header:'…'}`. They appear after Rename / Colour and before the standard size, move and delete items. |
| `sig(ctx)` | Return any JSON-able value. The body is rebuilt only when it changes. Return `undefined` (default) for "redraw when the tile's settings or any of its rows change". Narrow it when a redraw would interrupt something, e.g. the YouTube player returns only its list and player settings so a playing video doesn't restart. |
| `keep(ctx)` | Return `true` to skip a pending redraw for now, e.g. while the user is typing or has unsaved strokes. When you are done, call `HB.board.markRendered(this.tileId)` (accept the current state as drawn) or `this.redraw()`. |
| `destroy()` | Stop anything that outlives a body: audio, intervals not tied to a body. |
| `openEntry(entryId)` | Optional. Ctrl+K calls it after jumping to the tile when the search hit was one of your `entries` rows, so a gadget can show that very row (the Writer folder opens the page). |
| `static defaults()` | Initial `settings` for a new tile of this type. |

### Use

| member | what it is |
|---|---|
| `this.tileId` / `this.type` / `this.meta` | The displayed tile's id, its type, its manifest. |
| `this.tile` | The displayed tile row (`id, scenario_id, type, title, x, y, width, height, settings`). |
| `this.ctx` / `ctx` | `{ tile, src, id, settings, shared, items(type) }`. **`src` is the tile that owns the content** (differs from `tile` for a *mirror* tile shown in a second scenario). Always use `ctx.id` / `this.id` for data, never `ctx.tile.id`. |
| `this.id`, `this.settings` | Shortcuts for `ctx.id` and `ctx.settings`. |
| `this.readOnly` | `true` on a share page (visitor, read-only). See §5. |
| `this.save(patch, label)` | Merge `patch` into the owning tile's settings (undo-able; `label` names the undo step). |
| `this.items(type)` | Rows of `links`, `tasks`, `files` or `thoughts` that belong to this tile, in order. |
| `this.entries(kind)` | `entries` rows of one kind, in order (`position`, then id). |
| `this.addEntry(kind, data)` | Create an entries row (`a`, `b`, `num`, `day`, `due_at`, `data`, `position`, `colour`, `tags`). Resolves with the row, or `null` if it failed (a toast was shown). |
| `this.call(action, query, opts)` | Run one of the gadget's **server actions** (§4). `opts = {method:'POST', body:{…}}` for writes. |
| `this.redraw()` | Rebuild this tile's body now. |

Editing rows: `HB.store.update(table, id, patch, {label})`, `HB.store.remove(table, id, {label})` (to the
trash), `HB.store.reorder(...)`, `HB.store.createMany(table, rows)`. Every change is optimistic. It is
coalesced, sent about 1 s later in one batch, and can be undone with Ctrl+Z.

---

## 3. Where data lives

| need | use | example |
|---|---|---|
| A few options, small lists (< ~100 items) | tile **settings** (`this.save`) | clock 12 h, countdown dates, feed list, weather place |
| Many records, each edited on its own | **entries** rows with your own `kind` (add it to `entryKinds`) | flashcards, quotes, YouTube videos, Writer documents |
| Links / tasks / thoughts | the shared tables (`links`, `tasks`, `thoughts`) with `tile_id` | toolbox, to-do, thought dump |
| Files | `uploads` in the manifest, then `HB.upload.one(file, this.id)` or the Files helpers | music, sketch, writer images |

`entries` columns: `a` (text, up to 1 MB), `b` (text), `num` (number), `day` (YYYY-MM-DD), `due_at` (ISO
time), `data` (JSON object), `position`, `colour`, `tags`. Rows go to the trash and can be restored. List a
kind in `searchKinds` to make Ctrl+K find it.

Rules:
* Never change the DOM to reflect data without changing the store. The next redraw would undo it.
* Text from users, feeds or the web goes in through `textContent` (`h(…, {text})`) or `HB.md.render`. **Never
  `innerHTML`.** (The Writer is the one exception. It uses its own whitelist sanitizer, `HB.sanitizeHtml`.)
* Anchors: `target:'_blank', rel:'noopener'`. Anchors and images inside sortable lists need `draggable:false`.
* Dates: store UTC ISO strings, show with the browser's time zone. Never assume a city or time zone.

---

## 4. Server actions (optional)

Put them in `private/gadgets/<type>.php`. The file returns a map of action name → function:

```php
<?php
declare(strict_types=1);

/** Server actions of the Hello gadget. */
return [
    // GET api.php?r=g/hello/time   →   this.call('time')
    'time' => function (array $c): array {
        return ['utc' => gmdate('c')];
    },
    // POST with CSRF (added automatically by this.call(..., {method:'POST', body}))
    'shout' => function (array $c): array {
        if ($c['share'] !== null) {
            throw new HttpError(403, 'Read-only');
        }
        $text = (string) (hb_input()['text'] ?? '');
        return ['text' => mb_strtoupper(mb_substr($text, 0, 200))];
    },
];
```

* `$c = ['type' => 'hello', 'share' => <share row or null>, 'method' => 'GET'|'POST']`.
* The owner must be signed in, and every non-GET call needs the CSRF header. The gateway does both
  checks before your function runs.
* **Share visitors** (`$c['share'] !== null`) may call **GET** actions only. Either refuse
  (`throw new HttpError(403, …)`), or scope the action to what the shared tiles hold, so a visitor can't
  use your server as an open proxy:
  ```php
  if ($c['share'] !== null && !hb_share_allows_setting($c['share'], 'feeds', fn($st) => in_array($url, array_column($st['feeds'] ?? [], 'url'), true))) {
      throw new HttpError(403, 'Not part of this shared page');
  }
  ```
  `hb_share_has_tile($share, $tileId)` checks that a tile is part of the share.
* Return an array, which is sent as JSON. Or send your own response (headers + `echo`) and `exit`, as
  `g/writer/run` and `g/embed/snapshot` do. Errors: `throw new HttpError($status, 'Message for the user')`.
* Outbound HTTP: **only** through `hb_fetch($url, $maxBytes, $headers)`. It refuses private and
  cloud-metadata addresses, pins DNS, re-checks redirects and caps size and time. Cache results with
  `hb_cache_get($key, $ttlSeconds)` / `hb_cache_put($key, $string)`. Clean remote text with
  `hb_clean_text($html, $max)`.
* Database: `hb_q($sql, $params)` (PDO, prepared). Times are UTC. Convert rows you send with
  `hb_row($table, $row)`, so datetimes become ISO strings with a zone.
* PHP 8.0: no enums, `readonly`, `never` or first-class callable syntax.

---

## 5. Share pages (read-only visitors)

A scenario can be shared at `https://<site>/<name>`. That needs a password, and the link can expire.
Visitors get the same gadget code with `HB.readOnly === true`. Most of the work is already done for you:

* `HB.store` refuses writes (with a toast), `HB.addRow` returns nothing, `HB.sortable` does nothing,
  `HB.ui.form` / `inlineEdit` return `null`, the grid is static, tile menus show only Enlarge.
* What you still do: hide your own edit buttons (`if (!this.readOnly) …`), and keep viewer-only choices
  (current video, flipped card) in `this` instead of `this.save()`.
* Visitors only receive the shared scenario's tiles and rows. Files are included only when the owner
  allows them, except pictures inside `image`/`png` upload tiles.

---

## 6. Helpers cheat-sheet

| helper | does |
|---|---|
| `HB.h(tag, props, ...children)` | Build DOM. `props`: `class`, `text`, `dataset`, `style` (object), `onclick`…, any attribute. |
| `HB.ui.toast(msg, {type:'error', timeout})` | Small message. `HB.ui.confirm({title, message, confirm, danger})` → Promise<bool>. |
| `HB.ui.form({title, fields:[{name,label,type,value,required,max,options,hint,validate}]})` | Dialog → Promise<values or null>. Field `type`: `textarea`, `select` (`options:[{value,label}]`), `checkbox`, `emoji`, `color`, or any `<input>` type (default text; date, number, url…). |
| `HB.ui.modal({title, content, actions, wide})` | Free dialog. `HB.ui.menu(x, y, items)` / `HB.ui.menuAt(button, items)`. |
| `HB.addRow({placeholder, key, onAdd})` | The "type and press Enter" row used by most tiles. |
| `HB.sortable(body, listEl, {group, draggable, onDrop, onTrash})` + `HB.listDrop(table, evt, parentOf)` | Drag to reorder, drag between tiles, drop on the trash. |
| `HB.onCleanup(body, fn)` | Run `fn` when the body is rebuilt or removed. |
| `HB.setTileSettings(tileId, patch, label)` | Same as `this.save` for another tile. |
| `HB.md.render(text)` | Safe Markdown → DOM node. |
| `HB.fileUrl(fileRow)`, `HB.isAudio(fileRow)`, `HB.preview(fileRow)`, `HB.upload.one(file, tileId, onProgress)` | Files. |
| `HB.api.gadget(type, action, query, opts)` | Another gadget's action (normally use `this.call`). |
| `HB.bus.on('data' / 'saved' / 'status' / 'rendered', fn)` | App events (`'rendered'` gets a tile id after its body was rebuilt). |
| `HB.localDay(date)`, `HB.fmtDateTime(iso)`, `HB.normUrl(text)`, `HB.debounce(fn, ms)` | Small utilities. |

**Document editor.** `HB.editor` (`public/js/editor.js`, styled by `css/editor.css`) is the editor behind the Writer and the Writer folder; use it instead of building another one.
`HB.editor.rich({ value, readOnly, onChange(html), upload(file, onProgress) → Promise<url> })` → `{ el, body, status, focus(), getHTML(), setHTML(html), destroy() }`
(register `destroy` with `HB.onCleanup`; put `status` text such as "Saved" in `status`); `HB.editor.code(value, lang, { readOnly, onInput, onRun })` → `{ el, ta }`;
`HB.editor.sanitizeToString(html)` (always run stored HTML through it before saving), `toText(html)`, `page(title, html)` (a full page for download / print), `print(title, html)`, `download(name, text, type)`, `LANGS`.

Styling: use the CSS variables from `css/app.css` (`--bg`, `--card`, `--card2`, `--text`, `--muted`, `--line`,
`--brand`, `--brand-ink`, `--danger`, `--ok`, `--hover`, `--radius`). Dark mode then works by itself. Prefix your classes with a short gadget tag.
Shared building blocks: `.btn`, `.btn.small`, `.btn.ghost`, `.btn.on`, `.seg`/`.seg-btn`, `.empty`, `.muted`,
`.small`, `.x` (remove button), `.add-row`.

---

## 7. Recipes

**Add a gadget**
1. Copy a small gadget folder (`clock` has no data, `quotes` uses entries, `youtube` has a server
   action) to `public/gadgets/<new>/`.
2. Edit `manifest.json`: set `type` (= folder name), label, icon, group, size. Add `entryKinds`/`uploads`
   if needed.
3. Write the class in `gadget.js` and styles in `gadget.css`. Add `private/gadgets/<new>.php` if it needs
   the server.
4. Reload the page. The new type is in **+ Tile**. No other file changes.
5. Upload just that folder (and the PHP file) to the host. See DEPLOY.md, "Upgrading one gadget".

**Upgrade a gadget**: change files inside its folder only. Settings keys you add need defaults (read
them as `s.newKey ?? fallback`), because older tiles don't have them. Never repurpose an existing key
or entry column with a different meaning. Add a new one instead.

**Remove a gadget**: delete its folder (and PHP file). Its tiles remain in the database and say "gadget
is not installed" until you put the folder back.

**Ask an AI to work on one gadget** (cheap). Give it this file, the gadget's folder, and its PHP file:
> "Here is docs/GADGET_API.md and public/gadgets/youtube/ (+ private/gadgets/youtube.php). Add a
> 'Play next' item to the video menu. Change only these files and keep to the API."

---

## 8. Testing

* `node tests/e2e.cjs`, `tests/gadgets.cjs`, `tests/v3.cjs`, `tests/v4.cjs` drive a real browser. Copy a section of
  `tests/v3.cjs` to test a new gadget: `addTile('<type>')`, then use `page.locator('.tile[data-tile="…"] …')`.
* After changing PHP, run `node tests/api.cjs` too. See tests/README.md for the servers they need.
