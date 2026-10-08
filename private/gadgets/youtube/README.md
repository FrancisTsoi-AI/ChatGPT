# ▶️ YouTube playlist (`youtube`)

Your own list of YouTube videos and YouTube playlists, played in order inside the tile.
Paste a link in the box under the list, or use ⋯ → Add videos… for many links (one per line). Click a row to play from there; ⏮ ⏭ step through the list, 🔀 shuffles the videos after the current one and 🔁 repeats the list.
Drag rows to reorder them, drop one on the trash or press × to remove it. Right-click a row for Play from here, Open on YouTube, Rename… and Remove.

## Files
- `manifest.json` – size 5×7, group Files & media, order 25, entryKinds `["video"]`, searchKinds `["video"]` (Ctrl+K finds them). No uploads.
- `gadget.js` – `parseYouTube()` (exported as `HB.parseYouTube`), `src()` (builds the player address), `thumb()`, and the class:
  `sig()`, `setPlayer()` (saves player choices), `play()`, `add()` (parse, create the row, fetch the title), `render()`, `menu()` (Add videos…, Repeat the list, Shuffle).
  - `parseYouTube(text)` adds `https://` when missing, strips `www.` / `m.` / `music.` and accepts only `youtube.com`, `youtu.be` and `youtube-nocookie.com`.
    It finds a video in `youtu.be/<id>`, `?v=<id>`, `/embed/<id>`, `/shorts/<id>`, `/live/<id>` and `/v/<id>`, else a playlist in `?list=<id>` (a link with both counts as the video).
    Ids must match `[\w-]{6,64}`. It returns `{ vid, url }`, `{ list, url }` or `{ error }` (shown as a toast).
  - `src(items, i, st, autoplay)` always points at `https://www.youtube-nocookie.com/embed/…` with `rel=0`, `modestbranding=1` and `autoplay=1` only after you pressed play.
    A video row gets `playlist=<ids of the following video rows>`, so YouTube plays on through your list by itself. Repeat appends the rows before it and adds `loop=1` (a lone video gets `playlist=<its own id>`, which YouTube needs to loop one video).
    Shuffle mixes the following ids (anew on every redraw). Playlist rows are skipped in that chain, which holds at most 150 ids. A playlist row plays `/embed/videoseries?list=<id>` (+ `loop=1`).
- `gadget.css` – the 16:9 player box (at most 55 % of the tile), controls, list rows with thumbnails, the highlighted row. Class prefix `yt-`.
- `server.php` – the `info` action.

## Data
- **Tile settings** (`this.settings`, saved through `setPlayer()` / `HB.setTileSettings`):
  `current` – entry id of the row being played (unset = first row); `loop` – repeat the list (`false`); `shuffle` – shuffle what follows (`false`); `nonce` – time stamp set on every play, so clicking the playing row again restarts it.
- **Rows**: entries of kind `video` on `ctx.id` (a mirror tile shares the original's list and settings), ordered by `position` (new rows go last).
  `a` = title ("YouTube video" / "YouTube playlist" until the real title arrives), `b` = clean link (`https://www.youtube.com/watch?v=…` or `…/playlist?list=…`), `data` = `{ vid, list, author }` (one of `vid` / `list` is set), `colour` as usual.
- `sig()` only covers the rows (id, title, position, colour) and the player settings, so a playing video does not restart when anything else on the board changes.
- Thumbnails come from `https://i.ytimg.com/vi/<id>/mqdefault.jpg` (allowed in the app's CSP `img-src`). Playlists show ☰ instead.

## Server actions
`g/youtube/info?url=…` – GET. Accepts only `https://` addresses on `youtube.com` / `youtu.be` (optionally `www.`, `m.`, `music.`), else 400.
It asks YouTube's oEmbed (`https://www.youtube.com/oembed?format=json&url=…`) through `hb_fetch` (public addresses only, at most 256 KB, needs cURL) and returns `{ title, author }`, cleaned with `hb_clean_text` (no tags, 200 / 100 characters).
Answers are cached for 24 h in `storage/cache` (key `yt:` + url). `add()` calls it in the background and writes `a` and `data.author` with `{ record: false }`; any failure is ignored and the placeholder title stays.
A share visitor gets 403 "Read-only".

## Safety
- Only YouTube hosts get into the list. Ids are checked against `[\w-]{6,64}` before they go into any address, and the player address is always built by `src()` from those ids, never from the pasted text.
- The player is the privacy-enhanced `youtube-nocookie.com` embed in a sandboxed iframe (`allow-scripts allow-same-origin allow-popups allow-presentation allow-popups-to-escape-sandbox`; `allow` = autoplay, encrypted-media, fullscreen, picture-in-picture). It runs on YouTube's own origin, so it cannot reach Home Base.
- `referrerpolicy="strict-origin-when-cross-origin"` on the iframe matters: Home Base sends `Referrer-Policy: same-origin` on its pages, which would give YouTube no referrer at all, and the embedded player then refuses to play ("Error 153", player configuration error). This sends only the site's origin, never the path.
- Titles from oEmbed are cleaned on the server and shown with `textContent` only.
- The `info` action is refused for share visitors, so a share link cannot make the server fetch anything.

## On a share page
- The visitor sees the player and the list, and can play rows and use ⏮ ⏭ 🔀 🔁.
- Those choices stay local: `setPlayer()` puts them in `this.local` (in memory, merged over the tile settings in `render()`) and redraws only this tile. Nothing is sent to the server, and they are gone after a reload.
- Hidden or off: the paste box, the × buttons, drag to reorder or trash, the row right-click menu (the browser's own menu shows) and the ⋯ items (only Enlarge / Restore).
- No title lookups (`info` answers 403).

## Ideas for upgrades
- Follow YouTube's auto-advance: add `enablejsapi=1` in `src()` and listen for the player's `postMessage` events to update `current`. Today the highlighted row stays on the one you picked while YouTube plays the next ones.
- Keep the start time: read `t=` / `start=` in `parseYouTube()`, store it in `data.start`, and pass `start=` in `src()`.
- Stable shuffle: `src()` reshuffles on every redraw. Save a seed in the settings when 🔀 is pressed and use a seeded sort.
- Remember a visitor's choices across reloads: in `setPlayer()`, also write `this.local` to `localStorage` (inside try/catch) and read it back in `render()`.
- Retry titles: add a `menu()` item that calls `this.call('info', { url: it.b })` again for rows still named "YouTube video".
