# ✍️ Writer (`writer`)

A writing tile with three modes, picked with the tabs at the top: **Rich text** (formatted notes with a toolbar), **HTML + JS** (write a small web page and run it beside the code) and **Code** (a code editor with colour highlighting).
Each mode keeps its own text, and everything saves itself while you type.
Rich text has paragraph styles, bold / italic / underline / strike, text colour and highlight, lists, alignment, links (Ctrl+K), pictures (button, paste or drop), tables, dividers, clear formatting and a word count.
Double-click (or double-tap) on empty board space to add a new Writer right there, with the caret already in it (`quickWriter()` in `public/js/grid.js`).

## Files
- `manifest.json` – size 6×6, group Writing, order 10, entryKinds `["doc"]`, searchKinds `["doc"]` (Ctrl+K finds them), uploads `"image"`.
- `gadget.js` – the sanitizer (`sanitize`, `sanitizeToString`), the highlighter (`LANGS`, `tokenRe`, `highlight`, `codeEditor`) and the class:
  - `mode()` / `doc(ctx, mode)` – current mode and its row; `sig()` / `keep()` / `destroy()` – redraw control (see Data).
  - `saveSoon(value)` / `flush()` – debounced save; creates the row on first save.
  - `renderRich()` – contenteditable editor driven by `document.execCommand`; image upload, paste and drop.
  - `renderWeb()` – HTML editor + preview iframe; ▶ Run (also Ctrl/⌘+Enter), Auto-run, Starter page (asks before replacing), Open in new tab ↗, ⬇ download.
  - `renderCode()` – code editor, language list, Copy, ⬇ download, line count.
  - `menu()` – ⋯ → Mode (submenu) and Download (`.html` for rich and web, the language's extension for code).
- `gadget.css` – editor and toolbar, colour swatches, the code editor (a transparent textarea over a highlighted `<pre>`), token colours for light and dark, HTML + JS panes (stacked, side by side when the tile is at least 560 px wide). Class prefix `wr-`.
- `private/gadgets/writer.php` – the `run` action.

Code mode languages (`LANGS`): Plain text, HTML, CSS, JavaScript (default), Python, PHP, SQL, Shell, JSON, Markdown.
The highlighter is a small regex tokenizer per language: comments (`//`, `/* */`, `#`, `--`, `<!-- -->`), strings, numbers, keywords (SQL case-insensitive), HTML tags and attributes, CSS selectors and properties.
It builds `<span class="wr-c|s|n|k|t|a">` elements with text only (no innerHTML). Plain text and Markdown are not coloured.
Tab inserts two spaces. Key presses stay inside the editor, so digits and Ctrl+Z do not reach the board.

## Data
- **Tile settings** (`this.settings`, saved with `this.save(patch)`):
  `mode` – `rich`, `web` or `code` (`rich`); `lang` – code language key (unset = `js`); `autorun` – HTML + JS runs after every save (on unless `false`).
- **Rows**: entries of kind `doc` on `ctx.id`, one per mode per tile (a mirror tile shows and edits the original's text and settings). `data.mode` says which mode the row belongs to. `a` holds the text: cleaned HTML (rich), the page source (web) or the code (code).
- **Files**: pictures in rich text are `files` rows of the tile, shown as `<img src="file.php?id=N">`.
- **Saving**: `saveSoon()` waits 700 ms after the last change, then `flush()` writes (status "Typing…" → "Saved").
  Leaving the tile, switching mode or language, Run and `destroy()` flush at once. Saves use `{ record: false }`, so typing does not fill the board's undo history (the editor has its own undo).
- **No lost keystrokes**: `sig()` only covers mode, language, auto-run and the shown row's id and text. `keep()` returns true while a save is pending or the focus is in the editor, so a sync never redraws under your caret. `HB.board.markRendered()` stops the tile redrawing after its own save.

## Server actions
`g/writer/run?id=<doc id>` – GET. Serves the `a` of a `doc` row whose `data.mode` is `web`, on a live `writer` tile in a live scenario (404 "Nothing to run" otherwise).
The page is sent as raw HTML and the action exits. Not cached (`Cache-Control: no-store`); the preview adds `t=<time>` to force a fresh load.
A share visitor may run it only if the row's tile is part of that share (403 otherwise).

## Safety
- **Rich text sanitizer** (exposed as `HB.sanitizeHtml(html)` → string). The HTML is parsed with `DOMParser` (an inert document: nothing runs, nothing loads) and rebuilt from a whitelist into new elements.
  It runs on load (before the text touches the page), on paste and on every save. The server stores `a` as sent; safety comes from cleaning at load, so even a row written some other way cannot run script here.
  - Kept tags: P, DIV, BR, SPAN, B, STRONG, I, EM, U, S, STRIKE, DEL, SUB, SUP, MARK, H1–H6, UL, OL, LI, BLOCKQUOTE, PRE, CODE, A, IMG, HR, TABLE, THEAD, TBODY, TR, TH, TD. FONT becomes a SPAN with its colour as style.
  - Dropped with their content: SCRIPT, STYLE, IFRAME, FRAME(SET), OBJECT, EMBED, TEMPLATE, NOSCRIPT, SVG, MATH, HEAD, TITLE, META, LINK, BASE, FORM, INPUT, BUTTON, SELECT, TEXTAREA, AUDIO, VIDEO, CANVAS, DIALOG. Any other tag is unwrapped (its text stays). Comments go.
  - Attributes: all removed except link `href` (http/https, `mailto:`, `tel:`, `#`; gets `target="_blank" rel="noopener noreferrer"`), image `src` (http/https, `file.php?id=N`, base64 PNG/JPEG/GIF/WebP data URLs; an image with any other source is removed), simple `alt` / `width` / `height`, `colspan` / `rowspan` (1–2 digits).
  - `style` keeps only `color`, `background-color`, `text-align`, `font-weight`, `font-style`, `text-decoration(-line)`; values up to 60 characters, without `url(`, `expression`, `javascript:`, `<`, `>` or `\`.
- **Picture uploads** go through `HB.upload.one()` into this tile. The manifest rule `image` makes the server accept only PNG, JPEG, GIF, WebP and AVIF here (`private/src/files.php`); anything else gets 400. A drop on the editor calls `preventDefault()`, so the page-wide drop handler leaves it alone.
- **HTML + JS run page**: `g/writer/run` is sent with `Content-Security-Policy: sandbox allow-scripts allow-modals allow-popups allow-forms allow-downloads` and **no** `allow-same-origin`.
  The browser then gives the page an opaque origin, even though it comes from Home Base's address. Its scripts cannot read Home Base's cookies, storage or pages, have no CSRF token, and their requests to `api.php` count as cross-origin, so they cannot read your data or change it.
  Why it matters: the page is your own arbitrary code served from the app's domain. Without the sandbox, a pasted snippet (or a library it loads) would run as you, with full access to every tile.
  The sandbox comes from the response header, so it also holds in "Open in new tab" and in pop-ups the page opens. The preview iframe repeats it (`sandbox="allow-scripts allow-modals allow-popups allow-forms allow-downloads"`, `referrerpolicy="no-referrer"`).
  Other headers: `X-Frame-Options: SAMEORIGIN` (only Home Base may frame it), `Referrer-Policy: no-referrer`. The rest of the CSP (`default-src * data: blob: 'unsafe-inline' 'unsafe-eval'`) lets the page load libraries from any website.

## On a share page
- Only the current mode is shown: the other mode tabs are disabled, and the ⋯ menu has only Enlarge / Restore (no Mode or Download).
- Rich text is read-only: no toolbar, paste and drop ignored. Pictures still load: `hb_share_allows_file()` always hands out pictures of Writer tiles, even when the share does not include files.
- HTML + JS: no code pane, no Auto-run, no Starter page. The preview runs (same sandbox), with ▶ Run, Open in new tab ↗ and ⬇ download.
- Code: the editor is read-only and the language list disabled; Copy and ⬇ download still work.
- Double-click on empty space does nothing (`quickWriter()` returns when `HB.readOnly`).

## Ideas for upgrades
- Clean up unused pictures: deleting an image from the text leaves its `files` row on the tile. Add a `menu()` item that compares `this.items('files')` with the `file.php?id=` references in all `doc` rows and trashes the rest.
- More languages: add a key to `LANGS` (`name`, `ext`, `kw`, plus the `hash` / `dash` / `ci` flags); `tokenRe()` and the language list pick it up.
- Markdown preview: in `renderCode()`, when `lang` is `markdown`, add a pane rendered with `HB.md.render`.
- Line numbers: add a gutter next to the `<pre>` in `codeEditor()` and move it in the existing `scroll` handler.
- Rich text as Markdown or plain text: add a choice to the Download item in `menu()`.
