# 🗣️ Pronounce names (`pronounce`)

> **Status: structure only (v0.1.0).** This file and `manifest.json` describe the gadget. `gadget.js`, `gadget.css`
> and `private/gadgets/pronounce.php` are not written yet. Until `gadget.js` exists the server skips this folder
> (and logs one line about it), so don't upload the folder to the host before then.

Type or paste a person's name or a brand ("Ulyssa", "Siobhan", "Hermès", "Hyundai", "Nguyen"). The tile shows:
- the **IPA** (`/juːˈlɪsə/`), with **UK** and **US** forms when they differ;
- **▶ UK** and **▶ US** buttons that play a real recording when one is found, else the device's British / American voice;
- a **"say it like"** respelling (`yoo-LISS-uh`) that you can edit; the computer voice reads this, not the spelling;
- links to **howtopronounce.com** (e.g. `https://www.howtopronounce.com/ulyssa`), plus Forvo, YouGlish (UK / US) and Google;
- **Save** keeps the name in the tile's list, so you can play it again later and Ctrl+K finds it.

Names are said the way their owner says them, so every result shows **where it came from** (Wiktionary, Wikipedia,
dictionary, you) and "No IPA found" is a normal answer, not an error. You can always type or correct the IPA yourself.

```
┌ 🗣️ Pronounce names ─────────────────────── ⋯ ┐
│ [ Type or paste a name…              ] [ Go ] │
│                                               │
│  Ulyssa                         person ▾      │
│  /juːˈlɪsə/                  from Wiktionary  │
│  🇬🇧 UK  /juːˈlɪsə/   ▶ recording   ▶ voice   │
│  🇺🇸 US  /juˈlɪsə/    ▶ voice                 │
│  say it like: yoo-LISS-uh                 ✎   │
│  howtopronounce ↗  Forvo ↗  YouGlish UK ↗ US ↗│
│                         [ ✎ Edit ]  [ Save ]  │
│ ── Saved ──────────────────────────────────── │
│  Hermès   /ɛəˈmɛz/        ▶UK ▶US          ×  │
│  Siobhan  /ʃɪˈvɔːn/       ▶UK ▶US          ×  │
└───────────────────────────────────────────────┘
```

## Files (planned)
- `manifest.json` – size 4×6, group Study, order 95 (after Reading list), entryKinds `["pron"]`, searchKinds `["pron"]`. No uploads.
- `gadget.js` – helpers and the class, registered with `HB.gadgets.define('pronounce', …)`:
  - `cleanName(text)` – trims, folds runs of spaces, strips quotes / trailing punctuation, max 120 characters. Empty → nothing happens.
  - `links(name)` – builds the outside links (see **Links**). Pure function, no network.
  - `voices()` – Promise of the device's speech voices (waits for `speechSynthesis`'s `voiceschanged` once; some browsers fill the list late).
  - `pickVoice(lang, wantedURI)` – the saved voice if it still exists, else the first voice whose `lang` is `en-GB` / `en-US`, else `null`.
  - `speak(text, lang, settings)` – `speechSynthesis.cancel()`, then one `SpeechSynthesisUtterance` with `lang`, voice and `rate`.
  - `play(url)` – one shared `<audio>` element for recordings; stops the previous one. Plays `api.php?r=g/pronounce/audio&…` only (CSP `media-src 'self'`).
  - class methods:
    `static defaults()`, `sig()` (rows + settings only, so a playing sound isn't cut by a board redraw),
    `keep()` (true while the search box has focus and text, so typing isn't wiped),
    `render(body, ctx)` (search box, result card, saved list),
    `lookup(q)` (calls `this.call('lookup', { q })`, keeps the answer in `this.result`, redraws only this tile),
    `saveResult()` (creates a `pron` row from `this.result`), `editRow(row | result)` (`HB.ui.form`, see **Data**),
    `menu()` (Voices…, Speed, Links shown, Add by hand…), `destroy()` (cancel speech, stop audio).
- `gadget.css` – result card, UK / US rows, small play buttons, saved list rows. Class prefix `pr-`. Colours from the app's CSS variables only.
- `private/gadgets/pronounce.php` – the `lookup` and `audio` actions (see **Server actions**).

## Data
- **Rows**: entries of kind `pron` on `ctx.id` (a mirror tile shares the original's list), ordered by `position` (new rows go first, `position` = smallest − 1).
  | column | holds |
  |---|---|
  | `a` | the name as typed (`cleanName`) |
  | `b` | the main IPA shown in the list, with slashes (`/juːˈlɪsə/`); empty if none |
  | `data` | `{ kind, uk, us, say, lang, audio: { uk, us }, source, url, note }` |
  | `tags`, `colour` | as usual (Ctrl+K searches `a`, `b` and tags) |
  - `kind` – `person` \| `brand` \| `place` \| `other` (default `person`; a dropdown on the card).
  - `uk`, `us` – IPA per accent; empty when the source gave only one (then `b` is used for both).
  - `say` – respelling for the computer voice (`yoo-LISS-uh`). Empty → the voice reads `a`.
  - `lang` – origin language if a source said so (`fr`, `ga`, `vi`…), shown as a hint ("French name").
  - `audio.uk`, `audio.us` – the **original** address of a recording (Wikimedia Commons / dictionary), never a proxy URL.
  - `source` – `wiktionary` \| `wikipedia` \| `dictionary` \| `manual`; `url` – the page it came from; `note` – your own text.
  - Editing (`editRow`): fields Name, IPA, UK IPA, US IPA, Say it like, Kind (select), Note. Saving a looked-up result first lets you edit before it's stored.
- **Tile settings** (`this.save`, read as `s.key ?? fallback`):
  `rate` (0.9), `voiceUK` / `voiceUS` (a `voiceURI`, or `''` = automatic), `links` (`{ htp: true, forvo: true, youglish: true, google: true }`), `showSaved` (`true`).
- **Not saved**: the current lookup result (`this.result`) and the search text (`this.query`). They live on the instance until you press Save.

## Lookup (where the IPA comes from)
The server tries the sources in this order and merges what it finds. The first source with IPA wins `b`;
UK / US forms and recordings are filled from whichever source has them.

1. **Your saved rows** – checked in the browser first. If the name is already saved (case-insensitive), show that row; no network.
2. **Wiktionary** – `https://en.wiktionary.org/w/api.php?action=parse&page=<Name>&prop=text&format=json`.
   Read the *English* section's Pronunciation: `<span class="IPA">` values with their accent label (UK, US, RP, GA…), and audio file names (`.ogg`).
   Wiktionary pages are case-sensitive: try the name as typed, then Capitalised, then lowercase. Good for given names and many brands.
3. **Wikipedia** – `action=query&list=search&srsearch=<name>&srlimit=1`, then `action=parse&prop=text&section=0` of the hit.
   Take the first `<span class="IPA">` in the lead (that's the `{{IPAc-en}}` / `{{IPA}}` template rendered) and the `{{respell}}` text if present.
   Good for famous people and companies ("Hyundai", "Porsche"). Only accept it when the hit's title contains the typed name, so "Ulyssa" doesn't return a random article.
4. **Free Dictionary API** – `https://api.dictionaryapi.dev/api/v2/entries/en/<word>` (single words only). Gives IPA and `…-uk.mp3` / `…-us.mp3` recordings for brands that are also words ("Apple", "Shell").
5. **Nothing found** – answer `found: false`. The card still offers the computer voice, the respelling box and all the links.

Rendered HTML (`span.IPA`) is used instead of parsing wikitext templates, so template changes on Wikipedia don't break it.
Everything remote goes through `hb_fetch` with a descriptive `User-Agent` (Wikimedia asks for one) and is cleaned with `hb_clean_text`.

## Server actions (`private/gadgets/pronounce.php`)
- `g/pronounce/lookup?q=<name>` – GET. `q` is cleaned and capped at 120 characters; empty → 400.
  Returns `{ q, found, ipa, uk, us, say, lang, audio: { uk, us }, source, url, tried: [ 'wiktionary', … ] }`.
  Cached in `storage/cache` with key `pr:` + lowercase `q`: 30 days for a hit, 1 day for a miss.
  Share visitors: 403 "Read-only" (a share link must not make the server look things up).
- `g/pronounce/audio?u=<recording url>` – GET. Streams one recording so the page can play it under `media-src 'self'`.
  - Allowed only for `https://upload.wikimedia.org/wikipedia/commons/…` and `https://api.dictionaryapi.dev/media/…` (exact hosts, path regex), else 400.
  - Commons `.ogg` files are swapped for their `.mp3` transcode (`/transcoded/…/<file>.ogg.mp3`), because Safari / iPhone can't play Ogg.
  - At most 2 MB, cached 30 days (key `pra:` + url), sent with the real `audio/mpeg` / `audio/ogg` type, `X-Content-Type-Options: nosniff`, then `exit`.
  - Share visitors: allowed only with `&tile=<id>` when `hb_share_has_tile($share, $tile)` and a non-deleted `pron` row of that tile has `u` in `data.audio`.

## Links
Built in the browser by `links(name)`, each `target:'_blank', rel:'noopener'`, `draggable:false`, shown when switched on in `settings.links`:
- **howtopronounce** – `https://www.howtopronounce.com/<slug>` (slug = lowercase, spaces → `-`, then `encodeURIComponent`). *Check the slug rule for names with spaces / accents when coding.*
- **Forvo** – `https://forvo.com/search/<name>/` (real people saying it, often native speakers).
- **YouGlish UK / US** – `https://youglish.com/pronounce/<name>/english/uk` and `…/english/us` (clips from videos; best for brands and famous people).
- **Google** – `https://www.google.com/search?q=how+to+pronounce+<name>` (Google's pronunciation card has its own UK / US switch).

## UK / US playback
- **▶ recording** appears only when `audio.uk` / `audio.us` exists; it plays through the `audio` action.
- **▶ voice** is always there: `speechSynthesis` with `lang` `en-GB` / `en-US` reading `say` (or the name). It works offline and on phones, but the result depends on the device's voices.
- Browsers can't speak IPA (SSML phonemes are ignored), which is why the "say it like" respelling exists: fix the respelling until the voice sounds right, then Save.
- If the device has no British or American voice, the button says "no UK voice on this device" and the menu's **Voices…** lists what is installed.

## On a share page
- Visitors see the saved list and can press ▶ UK / ▶ US (voice and saved recordings) and open the links.
- Hidden: the search box, Save, Edit, ×, drag to reorder / trash, the ⋯ items (only Enlarge / Restore).
- Voice and speed choices a visitor makes stay in `this.local`. No lookups (`lookup` answers 403).

## Safety
- All remote text (IPA, respelling, titles) is cleaned on the server and shown with `textContent` only. Never `innerHTML`.
- The browser never talks to outside sites directly (CSP `connect-src 'self'`); lookups and recordings go through the two actions above.
- `audio` is an allow-list proxy, not an open one: two hosts, a path pattern, a size cap, audio content types only.
- The typed name only ever goes into URL query strings / paths through `encodeURIComponent` (browser) or `rawurlencode` (server).

## Build stages
1. **Offline core** – `gadget.js` + `gadget.css`: search box, links, ▶ UK / ▶ US computer voice, respelling, manual IPA, Save / Edit / remove, saved list, share-page rules. No PHP yet.
2. **Lookup** – `pronounce.php` `lookup` with Wiktionary + Wikipedia, caching, `tried` list shown as "Looked in: …".
3. **Recordings** – the `audio` action, Free Dictionary API, Commons mp3 transcodes, ▶ recording buttons.
4. **Polish** – a test section (copy one from `tests/v3.cjs`; fake Wiktionary / Wikipedia answers from the second test server), rebuild the zip, update CLAUDE.md (kind `pron` in the data model).

## Decisions (agreed with the owner)
- Group / size: **Study, 4×6**.
- A lookup is kept **only when Save is pressed**; nothing is stored automatically.
- **No AI fallback / no API key.** Names no source knows get the computer voice, the respelling box and the links.

## Ideas for upgrades
- **Bulk paste**: ⋯ → Add names… (one per line), looked up one after another.
- **To flashcards**: ⋯ → Send to a Flashcards tile (front = name, back = IPA + respelling).
- **Other accents**: Australian (`en-AU`) and Indian English (`en-IN`) voices are often installed too; add them as optional rows.
- **Record yourself**: hold to record your own attempt (MediaRecorder) and play it next to the recording. Needs `uploads: "audio"`.
