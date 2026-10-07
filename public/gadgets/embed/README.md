# 🌐 Embed (web, video, playlist) (`embed`)

Shows another web page, a YouTube video or playlist, a Spotify item or a Vimeo video inside the tile.
Paste an address or a whole `<iframe>` snippet, then press Enter or **Embed**.
A footer under the frame has "Open in new tab ↗" and a button to switch to a simplified copy (or back to the live page).
The ⋯ menu has **Change address…**, **Show ▸** (Automatic / Live page / Simplified copy) and **Reload**.

## Files
- `manifest.json` – size 6×6, group "Web", order 140. No entryKinds, no uploads.
- `gadget.js` – the class. It overrides no `sig`, `keep`, `destroy` or `static defaults`.
  - `parse(input)` (module function, also exported as `HB.embedParse`) – takes the `src` out of an `<iframe>` snippet, adds `https://` to a bare domain, refuses `http:`, and returns `{kind, src, url}` or `{error}`.
    YouTube (`youtube.com`, `youtu.be`, `/shorts/`, `/live/`, `/embed/`, `?list=`) becomes `https://www.youtube-nocookie.com/embed/<id>` or `…/embed/videoseries?list=<id>`.
    Spotify (`playlist|album|track|episode|show|artist`) becomes `open.spotify.com/embed/…`. `vimeo.com/<n>` becomes `player.vimeo.com/video/<n>`. Anything else is kind `web`.
  - `render(body, ctx)` – the setup form when there is no valid `url`; otherwise the live frame or the copy frame, plus the footer.
  - `check(url)` – asks the server once per address whether the site may be framed. The answer goes into the page-wide `checks` object (shared by all embed tiles). If framing is refused it calls `this.redraw()`. A failed request counts as "allowed".
  - `menu(tile, ctx)` – the menu items above. **Reload** forgets the check result and redraws.
  - Live frame: `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-popups-to-escape-sandbox"`, `allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"`, `loading="lazy"`.
  - It also sets `referrerpolicy="strict-origin-when-cross-origin"`. Home Base sends `Referrer-Policy: same-origin`, so without this attribute YouTube gets no referrer, cannot tell which site embeds it, and refuses to play ("Error 153"). The attribute sends only our origin, never the path.
- `gadget.css` – frame layout and footer: `.embed-wrap`, `.embed-frame` (white background), `.embed-foot`, `.embed-setup`. Prefix `embed-`.
- `private/gadgets/embed.php` – server actions `check` and `snapshot`.

## Data
- **Tile settings** (`this.settings`; the code calls `HB.setTileSettings(ctx.id, patch)`, which is what `this.save(patch)` does). `ctx.id` is the content owner, so a mirror tile changes the original.
  - `url` – the parsed address (`parse().url`). Empty or invalid shows the setup form. (none)
  - `mode` – how a `web` page is shown (`auto`; set back to `auto` whenever the address changes). YouTube, Spotify and Vimeo are always live.
    - `auto` – draw the live frame first; if `check` says the site refuses framing, show the simplified copy instead.
    - `live` – always the real page.
    - `copy` – always the simplified copy: an iframe on `g/embed/snapshot` with `sandbox="allow-popups allow-popups-to-escape-sandbox"` (no scripts, opaque origin) and `referrerpolicy="no-referrer"`.
- **Rows**: none.

## Server actions
- `g/embed/check?url=` – loads only the first 64 KB through `hb_fetch` (public addresses only, redirects re-checked) and reads the headers.
  Blocked when `X-Frame-Options` is DENY or SAMEORIGIN, or when CSP `frame-ancestors` lists none of `*`, `https:` or Home Base's own host.
  Returns `{ok, reason, final}`. Cached 6 h in `storage/cache` (key `framecheck:<url>`).
- `g/embed/snapshot?url=` – fetches the page (max 3 MB; not HTML → 415), strips `<script>` blocks and `<meta http-equiv=refresh>`, and adds `<base href="<final url>" target="_blank">` so relative images work and links open in a new tab.
  It sends its own response: `Content-Security-Policy: sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'` (images, styles and fonts from http(s), media from https), `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Cache-Control: private, max-age=600`.
  On failure the frame gets a short HTML note with an "Open it in a new tab" link instead of a broken page.
- Share visitors: both actions work only for an address that one of the shared scenario's embed tiles holds (exact match on `settings.url`, via `hb_share_allows_setting`). Anything else is 403.

## On a share page
- A tile with no address shows "Nothing embedded." instead of the setup form.
- The page is shown in the owner's mode. In `auto` the `check` still runs (it is allowed for the shared address).
- The "Try live page" and "Show a simplified copy" buttons are hidden. The ⋯ menu only offers Enlarge / Restore. "Open in new tab ↗" stays.

## Ideas for upgrades
- Say why a page became a copy: `check` already returns `reason`; add `chk.reason` to the footer note in `render()`.
- More providers in `parse()`, e.g. SoundCloud (`w.soundcloud.com/player/?url=`) or Google Maps embed links, each with its own `kind`.
- Auto-reload for dashboards: a `settings.refresh` (minutes) read in `render()`, with a `setInterval` that resets `frame.src`, stopped via `HB.onCleanup`.
- A `settings.zoom` (e.g. 0.75) that scales `.embed-frame` with a CSS transform, for dense pages in small tiles.
