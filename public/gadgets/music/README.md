# 🎵 Music player (`music`)

A playlist of your audio files with play / pause, previous, next, a seek bar, shuffle and repeat. Click a track to play it.
Music keeps playing when you switch scenarios, and the browser's media keys (e.g. the phone lock screen) can go to the previous or next track.
The list works like the Files tile (upload, drag to reorder or move, right-click menu) but shows audio files only.

## Files
- `manifest.json` – size 4×6, group "Files & media", order 190, `uploads: "audio"`.
- `gadget.js` – two parts:
  - `HB.player` (local name `P`) – one page-wide player on the `<audio id="audio">` element of `index.php` / `share.php`.
    `play(tileId, fileId)`, `toggle(tileId)`, `step(dir, auto)`, `stop()`, `queue(tileId)` (the tile's audio files in order),
    `syncUI()` (updates every `.music` tile on screen; also runs on the `data` and `rendered` bus events), `tick()` (seek bar and time),
    `init()` (audio events, error toasts for "format not playable" and "could not load", Media Session prev / next).
  - The class – `render(body, ctx)` builds the player panel, then reuses `HB.fileTileRender(inner, ctx, {audioOnly: true})`, marks the list `data-accept="audio"`, sets the file input's `accept` to `HB.AUDIO_ACCEPT`, and makes a click on a track's icon or name play it.
    Prev / Next on a tile that is not playing start its first track.
  - `menu(tile, ctx)` – **Add audio from Files tiles (n)** (moves every audio file of every Files tile, in any scenario, into this tile as one undo step), **Shuffle**, **Repeat playlist**.
  - No `sig`, `keep`, `destroy` or `static defaults` override. The player is not stopped when a tile is redrawn or leaves the screen.
- `gadget.css` – the player panel: `.mp`, `.mp-title`, `.mp-controls`, `.mp-seekrow`, `.mp-seek`, `.mp-time` (prefix `mp-`), and `.music .file-bar`.

## Data
- **Tile settings** (`this.settings`; written with `HB.setTileSettings(ctx.id, …)`, like `this.save(patch)`). `ctx.id` is the content owner; the player keys its state by it, so a mirror tile shows the same playback.
  - `shuffle` – when a track ends, play a random other track; it never stops. Prev / Next still go in list order. (false)
  - `loop` – after the last track, start again at the first; without it playback stops. (false)
- **Rows**: `files` with `tile_id` = `ctx.id`. `position` is the playlist order (drag to reorder). The track title is `original_name` (the Media Session title drops the extension).
- **What counts as audio**: `HB.isAudio(f)` in `js/filekit.js` – MIME `audio/*`, **or** a name ending in .mp3, .mpga, .m4a, .aac, .wav, .ogg, .oga, .opus, .flac or .weba.
  The name test matters because some phones send an .mp3 as `application/octet-stream`. `HB.AUDIO_ACCEPT` gives the file picker the same list.
  `js/upload.js` refuses non-audio files for this tile by the same name test, and the server (`uploads: "audio"`) types files by extension first and refuses anything that is not `audio/*`.
- Drag: only audio rows may be dropped into this list. Audio dropped on empty page space goes to the scenario's first Music tile when every dropped file is audio.

## Server actions
None. Tracks are played from `file.php?id=` (it supports Range requests, so seeking works).

## On a share page
- Tracks are listed only if the share link allows file downloads (`include_files`).
- Play, pause, previous, next and seeking work; nothing is saved. The owner's shuffle / repeat settings apply, but the 🔀 / 🔁 buttons are hidden.
- Upload, delete, drag and the right-click menu are off. The ⋯ menu only offers Enlarge / Restore.

## Ideas for upgrades
- A volume slider in `render()` that sets `P.audio.volume`, remembered per browser in `localStorage`.
- Resume where you left off: save `{tileId, id, currentTime}` from `P.tick()` (throttled) in `localStorage` and use it in `P.toggle()`.
- More lock-screen controls: add `play`, `pause` and `seekto` handlers next to the prev / next ones in `P.init()`.
- Shuffle history: remember played ids in `P.step()` so Previous goes back to the last random track.
