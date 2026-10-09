# Gadget API

Each gadget (tile type) in Home Base is a **plug-in**, like a WordPress plug-in: one folder holds all of
it (browser code, styles, server code, notes, pictures). Zip that folder and you have a package that
anyone can install on the **Gadgets page** (`⋯ → Gadgets & updates…`) by dropping the zip. The same page updates,
switches off, downloads and deletes gadgets, one at a time, without touching the others.

To build or upgrade a gadget you only read and change **its own folder**. This also keeps AI sessions
small: hand over this file and the gadget's folder, not the whole code base.

```
homebase-private/gadgets/<type>/   (in the repository: private/gadgets/<type>/)
  manifest.json      name, icon, version, author, menu group, size, data kinds, upload rule, share actions
  gadget.js          class extends HB.Gadget, registered with HB.gadgets.define('<type>', …)
  gadget.css         optional styles (prefix your classes, e.g. .yt-…)
  server.php         optional server actions (fetching, files, anything PHP)
  README.md          what it does, its data, ideas
  assets/…           optional pictures, sounds, fonts, data (reach them with this.asset('assets/…'))
```

**Nothing is registered by hand.** The server reads the manifests to learn which tile types, entry kinds
and upload rules exist. The folder sits outside the web folder; `assets.php` hands the browser only its
`gadget.js`, `gadget.css` and asset files (never `server.php`, `README.md` or dot files). Each gadget's
script and stylesheet load as **their own files**, so a gadget with an error only breaks itself.
Tiles of a missing or switched-off gadget stay in the database, say so, and work again once it is back.

---

## 1. manifest.json

```json
{
  "type": "youtube",
  "version": "1.0.0",
  "label": "YouTube playlist",
  "icon": "▶️",
  "hint": "Your own list of videos, played in order",
  "author": "Home Base",
  "group": "Files & media",
  "order": 25,
  "size": { "w": 5, "h": 7 },
  "entryKinds": ["video"],
  "searchKinds": ["video"],
  "shareActions": []
}
```

| field | required | meaning |
|---|---|---|
| `type` | yes | Must equal the folder name. `^[a-z][a-z0-9_]{1,19}$`. Stored in `tiles.type`, so never rename it once tiles exist. |
| `label`, `icon`, `hint` | yes | Shown in the **+ Tile** menu, the command bar (Ctrl+K) and the tile header. |
| `group` | yes | One of `Everyday`, `Writing`, `Study`, `Focus`, `Web`, `Files & media` (others sort last). |
| `order` | no | Position inside its group (smaller is higher; default 999). |
| `size` | yes | Default `w` × `h` on the 12-column grid. |
| `version` | no | `1.2.0` style. Shown on the Gadgets page, which also warns before installing an older version over a newer one. Raise it when you change the gadget. |
| `author`, `description` | no | Shown on the Gadgets page and in the install dialog (`description` falls back to `hint`). |
| `requires` | no | Lowest Home Base version the gadget needs, e.g. `"4.0"`. Older Home Base refuses to install it. |
| `shareActions` | no | Names of the server actions that **share-link visitors** may call (GET only). Default: none. See §4. |
| `entryKinds` | no | Kinds of rows this gadget stores in the `entries` table (`^[a-z][a-z0-9_]{0,11}$`). Only a tile of this type may own rows of these kinds. A kind belongs to one gadget. |
| `searchKinds` | no | Which of your `entryKinds` the search box (Ctrl+K) looks through (`a`, `b`, tags). |
| `uploads` | no | Lets files be uploaded into the tile: `any` (any file), `audio` (audio only), `image` (png/jpeg/gif/webp/avif), `png` (one PNG that can be replaced in place, used by Sketch). Leave it out for no uploads. |

A folder with a bad or missing `manifest.json` or `gadget.js` is skipped. The server logs it to the PHP
error log. The Gadgets page refuses such a zip with the reason.

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
| `this.asset(path)` | URL of a file in your folder, e.g. `h('img', { src: this.asset('assets/logo.svg') })` or `new Audio(this.asset('assets/ding.mp3'))`. Served types: js css json txt csv png jpg gif webp avif svg ico mp3 wav ogg m4a woff woff2 ttf otf. |

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

Put them in `server.php` in your folder. The file returns a map of action name → function:

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
* **Share visitors** (`$c['share'] !== null`) reach only the actions listed in the manifest's
  `shareActions`, and only by GET; everything else answers 403 before your code runs. For a listed
  action, scope it to what the shared tiles hold, so a visitor can't use your server as an open proxy:
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
* `server.php` is loaded only for requests to **your** gadget, so it never runs alongside another
  gadget's PHP. Still: define as few global functions as you can (closures in the returned array are best),
  and prefix any you need with your type (`hello_…`), never `hb_…`, which is the core's.
* PHP 8.0: no enums, `readonly`, `never` or first-class callable syntax. Every `.php` file in the zip must
  parse, or the Gadgets page refuses it.

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

## 7. Packages: zip, install, update, remove

**A package** is the gadget folder zipped. Either the files sit at the top of the zip, or inside exactly one
folder (`pomodoro/manifest.json` or `pomodoro-1.2.0/manifest.json`, whatever the folder is called).
`manifest.json` and `gadget.js` are required. The Gadgets page also downloads any installed gadget in
this format (**⬇ .zip**), and `tools/build-zip.py` writes one per shipped gadget to `dist/gadgets/`.

What the Gadgets page refuses (and writes nothing):
* names with `../`, a leading `/`, a backslash, spaces or a leading dot (`.htaccess`), and links;
* file types other than json js css php md txt csv, pictures (png jpg gif webp avif svg ico), sounds
  (mp3 wav ogg m4a), fonts (woff woff2 ttf otf), and `LICENSE` / `README` / `CHANGELOG` without extension;
* more than 1000 files, a file over 10 MB, over 40 MB unpacked, or a zip over 20 MB;
* a bad manifest, an `entryKinds` name that belongs to another gadget, a `requires` newer than this Home Base,
  a `.php` file that does not parse.

**Installing** has two steps. The zip is checked and unpacked into a hidden staging folder. You then see
its name, version, author, size, and whether it has server code. You confirm with your passphrase (it
counts toward the 5-tries limit). The folder is then swapped in with a rename, and the page reloads.
Dropping a zip with the **same `type`** as an installed gadget **updates** it: tiles, settings and rows stay.
`HB_GADGET_INSTALL=0` in `.env` switches installing from the web off; copying the folder by FTP always works.

**Switching off** keeps the folder and the data but stops loading it. The browser gets none of its code,
its server actions answer 404, and its tiles say it is switched off. The choice is kept in
`homebase-private/storage/gadgets.json`, so it survives updates.

**Deleting** removes the folder. You choose whether its tiles (with their content) go to the Trash, or
stay and say the gadget is missing; installing it again brings them back. Tiles whose gadget is gone are
listed on the Gadgets page under "Tiles without a gadget".

## 8. Recipes

**Add a gadget**
1. Copy a small gadget folder (`clock` has no data, `quotes` uses entries, `youtube` has a server
   action) to `private/gadgets/<new>/`, or start from a downloaded zip.
2. Edit `manifest.json`: set `type` (= folder name), label, icon, version, author, group, size. Add
   `entryKinds`/`uploads`/`shareActions` if needed.
3. Write the class in `gadget.js`, styles in `gadget.css`, and `server.php` if it needs the server.
4. Reload the page (locally), or zip the folder and drop it on the Gadgets page (on your site).

**Upgrade a gadget**: change files inside its folder only, raise `version`, zip it, drop it on the
Gadgets page. Settings keys you add need defaults (read them as `s.newKey ?? fallback`), because older
tiles don't have them. Never repurpose an existing key or entry column with a different meaning. Add a
new one instead.

**Remove a gadget**: Gadgets page → Delete.

**Built-in gadgets** are the folders in `private/gadgets/` of the repository. `tools/build-zip.py` zips each one into the
release's catalog (`homebase-private/catalog/<type>.zip`): a new site gets all of them, the Gadgets page offers the missing ones
with an **Add** button, and a Home Base update that carries a newer version offers **Update** (and updates the ones you have).
So to ship a new built-in gadget, add its folder and build a release; to ship a fix, raise its `version`.

**Ask an AI to work on one gadget** (cheap). Give it this file and the gadget's folder (or its zip):
> "Here is GADGET_API.md and the youtube gadget folder. Add a 'Play next' item to the video menu.
> Change only this folder, raise the version to 1.1.0, and keep to the API."
Then zip the folder it gives back and drop it on the Gadgets page.

---

## 9. Testing

* `node tests/e2e.cjs`, `tests/gadgets.cjs`, `tests/v3.cjs`, `tests/v4.cjs`, `tests/v5.cjs` drive a real browser. Copy a section of
  `tests/v3.cjs` to test a new gadget: `addTile('<type>')`, then use `page.locator('.tile[data-tile="…"] …')`.
* `tests/v5.cjs` covers packages (install, update, bad zips, isolation, switch off, delete). It needs a server
  with a scratch gadgets folder; `tests/lib/zip.cjs` builds zips in tests.
* After changing PHP, run `node tests/api.cjs` too. See tests/README.md for the servers they need.
