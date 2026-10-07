# ✍️ Writer (`writer`)

A writing tile with three modes, picked with the tabs at the top: **Rich text** (a full document editor, see below), **HTML + JS** (write a small web page and run it beside the code) and **Code** (a code editor with colour highlighting).
Each mode keeps its own text, and everything saves itself while you type.
Double-click (or double-tap) on empty board space to add a new Writer right there, with the caret already in it (`quickWriter()` in `public/js/grid.js`).

The rich-text editor itself lives in **`public/js/editor.js`** (`HB.editor.rich`) and is shared with the Writer folder gadget (`library`). This gadget only wires it to a tile: saving, modes, menu.

## What the rich-text editor does
- **Toolbar** (collapses to one row in a small tile, `⋯` opens the rest): undo / redo, paragraph style (Paragraph, Heading 1–4, Quote, Code block), font, font size, bold, italic, underline, strikethrough, inline code, subscript, superscript, text colour and highlight (palette + any colour), alignment, bulleted / numbered / **to-do** lists, indent, line spacing, link, picture, table, quote, code block, horizontal line, special characters, emoji, find and replace, HTML source, clear formatting.
- **Markdown shortcuts while typing:** `# ` … `#### ` headings, `- ` / `* ` bullets, `1. ` numbers, `[] ` to-do, `> ` quote, ` ``` ` code block; `**bold**`, `*italic*`, `~~strike~~`, `` `code` `` turn into formatting when you type the closing mark.
- **Keys:** Ctrl+B/I/U, Ctrl+K link, Ctrl+F find and replace, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo, Ctrl+Shift+7/8/9 numbered / bulleted / to-do list, Ctrl+Shift+X strikethrough, Ctrl+Shift+L/E/R/J align, Ctrl+Alt+0–4 paragraph / headings, Ctrl+\ clear formatting, Tab / Shift+Tab (indent in a list, next / previous cell in a table; a Tab in the last cell adds a row).
- **Balloons:** put the caret in a link and a small bar offers *open*, *Edit*, *Unlink*. Click a picture and the bar offers width 25 / 50 / 75 / 100 %, float left / centre / right, *Alt* text and remove; drag the blue corner to resize.
- **Tables:** the table button opens a grid to pick the size; with the caret in a table the same menu adds or deletes rows and columns, toggles the header row or deletes the table.
- **Pictures:** upload (button), paste, drop, or from a web address. Pasting a web address over selected text links it.
- **Own undo history:** every change, also the ones made by buttons, is undoable (the browser's own undo is switched off, because script changes confuse it).
- **Status bar:** words and characters, and "Typing… / Saved".
- The ⋯ menu: *Download* (.html or plain text), *Print / save as PDF…*, *Move into a Writer folder*.

## Files
- `manifest.json` – size 6×6, group Writing, order 10, entryKinds `["doc"]`, searchKinds `["doc"]` (Ctrl+K finds them), uploads `"image"`.
- `gadget.js` – the class:
  - `mode()` / `doc(ctx, mode)` – current mode and its row; `sig()` / `keep()` / `destroy()` – redraw control (see Data).
  - `saveSoon(value)` / `flush()` – debounced save; creates the row on first save.
  - `renderRich()` – mounts `HB.editor.rich` (image upload goes to `HB.upload.one` into this tile).
  - `renderWeb()` – HTML editor + preview iframe; ▶ Run (also Ctrl/⌘+Enter), Auto-run, Starter page (asks before replacing), Open in new tab ↗, ⬇ download.
  - `renderCode()` – code editor, language list, Copy, ⬇ download, line count.
  - `menu()` / `download()` / `moveInto()` – tile menu, downloads, and turning this Writer into a page of a Writer folder (its pictures move with it, so they survive the tile being purged).
- `gadget.css` – tile layout, HTML + JS panes (stacked, side by side when the tile is at least 560 px wide). Class prefix `wr-`. The editor, toolbar, popups and code editor are styled in `public/css/editor.css`.
- `private/gadgets/writer.php` – the `run` action.

Code mode languages (`HB.editor.LANGS`): Plain text, HTML, CSS, JavaScript (default), Python, PHP, SQL, Shell, JSON, Markdown.
The highlighter is a small regex tokenizer per language: comments, strings, numbers, keywords (SQL case-insensitive), HTML tags and attributes, CSS selectors and properties. It builds `<span class="wr-c|s|n|k|t|a">` elements with text only (no innerHTML).
Tab inserts two spaces. Key presses stay inside the editor, so digits and Ctrl+Z do not reach the board (Esc still restores an enlarged tile).

## Data
- **Tile settings** (`this.settings`, saved with `this.save(patch)`):
  `mode` – `rich`, `web` or `code` (`rich`); `lang` – code language key (unset = `js`); `autorun` – HTML + JS runs after every save (on unless `false`).
- **Rows**: entries of kind `doc` on `ctx.id`, one per mode per tile (a mirror tile shows and edits the original's text and settings). `data.mode` says which mode the row belongs to. `a` holds the text: cleaned HTML (rich), the page source (web) or the code (code).
- **Rich text format**: plain HTML from a whitelist (below). To-do lists are `<ul class="todo">` with `<li data-done="1">` for ticked items; picture size and alignment are `width="50%"` and `data-align="left|center|right"`. Older documents open unchanged.
- **Files**: pictures in rich text are `files` rows of the tile, shown as `<img src="file.php?id=N">`.
- **Saving**: `saveSoon()` waits 700 ms after the last change, then `flush()` writes (status "Typing…" → "Saved").
  Leaving the tile, switching mode or language, Run and `destroy()` flush at once. Saves use `{ record: false }`, so typing does not fill the board's undo history (the editor has its own).
- **No lost keystrokes**: `sig()` only covers mode, language, auto-run and the shown row's id and text. `keep()` returns true while a save is pending or the focus is in the editor (text, source view, find box), so a sync never redraws under your caret. `HB.board.markRendered()` stops the tile redrawing after its own save.

## Server actions
`g/writer/run?id=<doc id>` – GET. Serves the `a` of a `doc` row whose `data.mode` is `web`, on a live `writer` tile in a live scenario (404 "Nothing to run" otherwise).
The page is sent as raw HTML and the action exits. Not cached (`Cache-Control: no-store`); the preview adds `t=<time>` to force a fresh load.
A share visitor may run it only if the row's tile is part of that share (403 otherwise).

## Safety
- **Rich text sanitizer** (`HB.editor.sanitize`, and `HB.sanitizeHtml(html)` → string). The HTML is parsed with `DOMParser` (an inert document: nothing runs, nothing loads) and rebuilt from a whitelist into new elements.
  It runs on load (before the text touches the page), on paste, when leaving the HTML source view and on every save. The server stores `a` as sent; safety comes from cleaning at load, so even a row written some other way cannot run script here.
  - Kept tags: P, DIV, BR, SPAN, B, STRONG, I, EM, U, S, STRIKE, DEL, SUB, SUP, MARK, H1–H6, UL, OL, LI, BLOCKQUOTE, PRE, CODE, A, IMG, HR, TABLE, THEAD, TBODY, TR, TH, TD. FONT becomes a SPAN with its colour and face as style.
  - Dropped with their content: SCRIPT, STYLE, IFRAME, FRAME(SET), OBJECT, EMBED, TEMPLATE, NOSCRIPT, SVG, MATH, HEAD, TITLE, META, LINK, BASE, FORM, INPUT, BUTTON, SELECT, TEXTAREA, AUDIO, VIDEO, CANVAS, DIALOG. Any other tag is unwrapped (its text stays). Comments go.
  - Attributes: all removed except link `href` (http/https, `mailto:`, `tel:`, `#`; gets `target="_blank" rel="noopener noreferrer"`), image `src` (http/https, `file.php?id=N`, base64 PNG/JPEG/GIF/WebP data URLs; an image with any other source is removed), `alt`, `width` (digits, optionally `%` or `px`), `data-align`, `colspan` / `rowspan` (1–2 digits), `class="todo"` on UL and `data-done` on LI.
  - `style` keeps only `color`, `background-color`, `text-align`, `font-weight`, `font-style`, `text-decoration(-line)`, `font-size`, `font-family`, `line-height` and `margin-left`, each checked against its own pattern (a colour, a length, a few font names…). Anything with `url(`, `expression`, `javascript:`, `<`, `>` or `\` is dropped.
- **Picture uploads** go through `HB.upload.one()` into this tile. The manifest rule `image` makes the server accept only PNG, JPEG, GIF, WebP and AVIF here (`private/src/files.php`); anything else gets 400. A drop on the editor calls `preventDefault()`, so the page-wide drop handler leaves it alone.
- **HTML + JS run page**: `g/writer/run` is sent with `Content-Security-Policy: sandbox allow-scripts allow-modals allow-popups allow-forms allow-downloads` and **no** `allow-same-origin`.
  The browser then gives the page an opaque origin, even though it comes from Home Base's address. Its scripts cannot read Home Base's cookies, storage or pages, have no CSRF token, and their requests to `api.php` count as cross-origin, so they cannot read your data or change it.
  Why it matters: the page is your own arbitrary code served from the app's domain. Without the sandbox, a pasted snippet (or a library it loads) would run as you, with full access to every tile.
  The sandbox comes from the response header, so it also holds in "Open in new tab" and in pop-ups the page opens. The preview iframe repeats it (`sandbox="allow-scripts allow-modals allow-popups allow-forms allow-downloads"`, `referrerpolicy="no-referrer"`).
  Other headers: `X-Frame-Options: SAMEORIGIN` (only Home Base may frame it), `Referrer-Policy: no-referrer`. The rest of the CSP (`default-src * data: blob: 'unsafe-inline' 'unsafe-eval'`) lets the page load libraries from any website.

## On a share page
- Only the current mode is shown: the other mode tabs are disabled, and the ⋯ menu has only Enlarge / Restore (no Mode, Download or Move).
- Rich text is read-only: no toolbar, paste and drop ignored, to-do boxes cannot be ticked. Pictures still load: `hb_share_allows_file()` always hands out pictures of tiles whose manifest says `uploads: image`, even when the share does not include files.
- HTML + JS: no code pane, no Auto-run, no Starter page. The preview runs (same sandbox), with ▶ Run, Open in new tab ↗ and ⬇ download.
- Code: the editor is read-only and the language list disabled; Copy and ⬇ download still work.
- Double-click on empty space does nothing (`quickWriter()` returns when `HB.readOnly`).

## Ideas for upgrades
- Clean up unused pictures: deleting an image from the text leaves its `files` row on the tile. Add a `menu()` item that compares `this.items('files')` with the `file.php?id=` references in all `doc` rows and trashes the rest.
- Merge table cells (`colspan` / `rowspan` are already allowed by the sanitizer), cell colours, column widths.
- More languages: add a key to `HB.editor.LANGS` (`name`, `ext`, `kw`, plus the `hash` / `dash` / `ci` flags); `tokenRe()` and the language list pick it up.
- Markdown preview: in `renderCode()`, when `lang` is `markdown`, add a pane rendered with `HB.md.render`.
- Line numbers: add a gutter next to the `<pre>` in `HB.editor.code()` and move it in the existing `scroll` handler.
- Rich text as Markdown: add a choice to the Download item in `menu()`.
