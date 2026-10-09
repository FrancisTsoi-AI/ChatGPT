# Deploying Home Base to task.francistsoi.com

This is the whole procedure, start to finish. It takes about 20 minutes. You need a shared host with
**PHP 8.0 or later**, **MySQL or MariaDB**, **phpMyAdmin**, and a file manager or FTP. Nothing has to be
installed or built on your computer.

The upload zip (`homebase-task.francistsoi.com.zip`) contains:

```
homebase-upload/
├─ DEPLOY.md              this guide
├─ README.md              what Home Base is and how to use it
├─ GADGET_API.md          how a gadget (tile type) is built: hand it to an AI with one gadget's folder to change just that
├─ schema.sql             the database tables (you run it in phpMyAdmin the first time)
├─ web/                   → goes into the web folder of task.francistsoi.com
└─ homebase-private/      → goes NEXT TO that web folder, never inside it
```

> **Why two folders?** `web/` is public: the page, styles and scripts. `homebase-private/` holds the
> gateway code, your database password (`.env`) and every file you upload. It must sit outside the
> web folder so the browser can never reach it. Rule of thumb: **never put `homebase-private` inside
> the web folder.**

---

## Step 1 · Create the subdomain (hosting panel)

1. In your hosting panel open **Domains → Subdomains** (cPanel: *Subdomains*; others: *Domains*).
2. Create **`task`** under `francistsoi.com`.
3. Note the **document root** the panel shows. Common values:
   - `/home/USER/task.francistsoi.com` (newer cPanel — ideal)
   - `/home/USER/public_html/task` (older cPanel)
4. Turn on **HTTPS** for it (cPanel: *SSL/TLS Status → Run AutoSSL*; or *Let's Encrypt*). Home Base
   refuses to run over plain HTTP in production (`.htaccess` redirects to HTTPS).
5. If your DNS is not at the same host, add an `A` (or `CNAME`) record for `task` pointing to the host.
   DNS can take a few minutes to an hour.

## Step 2 · Create the database (hosting panel)

1. Open **MySQL Databases** (cPanel) and create a database, e.g. `USER_homebase`.
2. Create a database **user** with a long random password, e.g. `USER_hb`.
3. **Add the user to the database with ALL PRIVILEGES — for this one database only.**
4. Write down: database name, user, password. (Hosts usually prefix the names with your account name.)

## Step 3 · Check the host (S0 checklist)

Note these in the panel (**Select PHP Version / MultiPHP** and the file manager) — the setup page in
Step 6 also checks most of them for you:

- [ ] PHP is 8.0 or newer (8.2+ recommended) with extensions `pdo_mysql`, `mbstring`, `json`
      (and `fileinfo`; `zip` for the "data + files" backup; `curl` + `simplexml` for the **News feeds**, **Weather**
      and reading-list **title** features — everything else works without them)
- [ ] MySQL 5.7+ / MariaDB 10.3+
- [ ] You can create folders in your home directory, outside the web folder

You do **not** need to raise `upload_max_filesize`: big files are sent in chunks automatically.

## Step 4 · Upload the files

1. Upload `homebase-task.francistsoi.com.zip` to your home directory (File Manager → *Upload*, or FTP)
   and **Extract** it. You get a `homebase-upload` folder.
2. **Move the contents of `homebase-upload/web/` into the subdomain's document root** (Step 1.3).
   Include the hidden file **`.htaccess`** — in File Manager tick *Settings → Show Hidden Files*.
3. **Move the folder `homebase-upload/homebase-private/` to your home directory**, next to the
   document-root folder. The result must look like one of these:

   ```
   /home/USER/
   ├─ homebase-private/          ← private (outside the web)
   │  ├─ .env.example  schema.sql
   │  ├─ src/  bin/  gadgets/  storage/
   └─ task.francistsoi.com/      ← the subdomain's document root
      ├─ index.php  api.php  assets.php  file.php  share.php  export.php  setup.php  _boot.php
      ├─ .htaccess
      ├─ css/  js/  gadgets/  vendor/
   ```

   For the older layout (`/home/USER/public_html/task`) keep `homebase-private` in `/home/USER/`
   — the gateway looks up to three levels above the web folder, so both layouts work.

   *If you put it somewhere unusual*, create a file named `.private-path` inside the web folder
   containing one line: the full path of `homebase-private` (e.g. `/home/USER/homebase-private`).

4. Make sure these folders are writable by PHP (normally the default; use permissions `755`, or `700`
   if your host runs PHP as your own user): `homebase-private/storage/files`, `…/sessions`,
   `…/ratelimit`, `…/tmp`, `…/cache`.

## Step 5 · Create the tables

1. Open **phpMyAdmin** from the panel and click your database in the left list (it is empty).
2. **Import** tab → *Choose file* → `homebase-upload/schema.sql` (download it from the file manager
   to your computer first, or paste its text into the **SQL** tab) → **Go**.
3. You should now see **9 tables**: `scenarios`, `tiles`, `links`, `tasks`, `files`, `thoughts`, `entries`, `settings`, `shares`.

The script only creates what is missing, so running it again later is safe.

## Step 6 · Write the `.env` (secrets) and choose your passphrase

1. In `homebase-private/`, **copy `.env.example` to `.env`** and open `.env` in the file manager's
   editor. Fill in `DB_HOST` (usually `localhost`), `DB_NAME`, `DB_USER`, `DB_PASS`.
   Type them yourself; don't paste them into a chat.
2. Open **https://task.francistsoi.com/setup.php**.
   - The **host check** lists what is fine and what to fix. Everything marked *FIX* must be green.
   - Under **Passphrase hash**, type the passphrase you will use to sign in (long: 14+ characters or
     a few random words) twice, press **Generate hash**.
3. Copy the line it shows, `HB_PASSPHRASE_HASH='$2y$…'`, into `.env` (replace the empty
   `HB_PASSPHRASE_HASH=''` line) and save.
4. Reload `setup.php`: it now answers *Not found* — it switches itself off once a passphrase is set.
   (You may also delete `setup.php` from the web folder.)

   *With a terminal instead:* `php homebase-private/bin/check-host.php` and
   `php homebase-private/bin/hash-passphrase.php` do the same.

## Step 7 · Sign in and check it works

Open **https://task.francistsoi.com** and sign in. Then walk through this "done when" list:

- [ ] Three tabs **Work · Idea · PhD**, each with starter tiles (keys `1` `2` `3` switch)
- [ ] Add a link in the Toolbox, add a task, drag it to **Later**, reload — it is still there
- [ ] Drag a tile by its title, pull its corner to resize, reload — the layout survived
- [ ] Drag a tile onto **🗑 Trash**, open Trash, **Restore** it
- [ ] Add a **Files** tile, drop a PDF onto the page, it appears and downloads intact
- [ ] Sign in on your phone: it stays signed in for 90 days
- [ ] 5 wrong passphrases pause sign-in for 15 minutes (try it from a private window if you like)
- [ ] **+ Tile** shows the extra tiles; add a *Flashcards* tile, import two cards, press *Study*; add a *Note* and a *Timer*
- [ ] (needs cURL) add a *Weather* tile and pick your city; add *News feeds* with e.g. `BBC | https://feeds.bbci.co.uk/news/rss.xml`
- [ ] Double-click empty space: a **Writer** appears; type, make a word bold, reload: it is still there
- [ ] Add a *YouTube playlist* tile, paste two video links, press ⏭: the second video plays (no "Error 153")
- [ ] `⋯ → Share this scenario…` → *New share link* named `test`, open `https://task.francistsoi.com/test` in a private
      window, type the password: you see the scenario read-only. Then *Switch off* the link

## Step 8 · Make it your start page

- **Chrome / Edge:** Settings → *On startup* → *Open a specific page* → `https://task.francistsoi.com`;
  and *Appearance → Show Home button* for the Home key.
- **Firefox:** Settings → *Home* → *Custom URLs* → `https://task.francistsoi.com`.
- **Safari:** Settings → *General* → *Homepage*.

The page draws from a local cache first, so it appears immediately and syncs in the background.

---

## Backups

- **In the app:** `⋯` menu → *Backup* → *Download data (JSON)* or *data + files (zip)*.
- **Belt and braces (recommended monthly):** phpMyAdmin → your database → *Export* → *Quick* → *Go*,
  and copy `homebase-private/storage/files/` with FTP/File Manager. Those two things are everything.
- Many hosts also run their own daily account backups; check that yours includes databases.

## Updating to a new version

1. Upload the new `web/` files over the old ones, **including the `gadgets/` folder** and the hidden `.htaccess`.
   Browsers pick up the change by themselves: the scripts come from `assets.php`, whose address changes whenever a file changes.
2. Upload the new `homebase-private/src/`, `bin/`, `gadgets/` and `schema.sql` over the old ones.
3. **Do not overwrite** `homebase-private/.env` or anything in `homebase-private/storage/`.
4. **Nothing to do for the database:** when a new version needs a new table (this one adds `shares`), the gateway creates it by
   itself on first load (it reads `homebase-private/schema.sql`). If your database user lacks CREATE rights you will see a
   message asking you to import `schema.sql` in phpMyAdmin instead. The same goes for the Files folders: the column
   `files.folder_id` is added automatically (needs ALTER rights). If it cannot be, run in phpMyAdmin:
   `ALTER TABLE files ADD COLUMN folder_id INT UNSIGNED NOT NULL DEFAULT 0 AFTER tile_id;`
5. *Coming from the previous version:* delete the old folder `web/js/tiles/`. Its files moved to `web/gadgets/` and are no
   longer used.

### Upgrading one gadget

Each tile type lives in its own folder (see `GADGET_API.md`, next to this guide; `docs/GADGET_API.md` in the repository). To update only, say,
the YouTube playlist, upload `web/gadgets/youtube/` (and `homebase-private/gadgets/youtube.php` if it changed) and reload. A new
gadget is the same: upload its folder and it shows up in **+ Tile**. Removing a folder removes the tile type. Its tiles stay in
the database and come back when the folder does.

## Share links

`⋯ → Share this scenario…` creates a link such as `https://task.francistsoi.com/home`, with a password and an expiry. How it
works on the host:

- The short address needs Apache's `mod_rewrite` (normal on shared hosting). The rule is in `web/.htaccess`, and only names
  that are not real files or folders are rewritten. If the short link shows *Not Found*, the long form always works:
  `https://task.francistsoi.com/share.php?s=home`. The dialog shows both.
- Names are 3–40 lowercase letters, digits or dashes. Names of the app's own files and folders (`api`, `setup`, `gadgets`…) are refused.
- Unlocking a link never signs anyone in to Home Base itself. Visitors can only read that scenario, and only while the link is
  on, not expired, and the password unchanged. Five wrong passwords pause the link for 15 minutes (per visitor address).
- *nginx* hosting: add `location ~ "^/([a-z0-9][a-z0-9-]{2,39})$" { try_files $uri $uri/ /share.php?s=$1; }`.

## Settings you can change in `.env`

| Key | Default | Meaning |
|---|---|---|
| `HB_MAX_FILE_MB` | 2048 | Largest single upload (chunked automatically) |
| `HB_SESSION_DAYS` | 90 | How long a signed-in device stays signed in |
| `HB_LOGIN_MAX_TRIES` / `HB_LOGIN_PAUSE_MIN` | 5 / 15 | Wrong tries, then pause in minutes |
| `HB_TRASH_DAYS` | 30 | Days before trashed items are purged for good |
| `HB_DEBUG` | 0 | `1` shows error details in API replies while you set things up |

To **change your passphrase**: empty `HB_PASSPHRASE_HASH=''` in `.env`, open `setup.php` again, generate a
new hash, paste it in. Existing devices stay signed in until you also choose `⋯ → Sign out on all devices…` in the app
(or delete the files in `homebase-private/storage/sessions/`).

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| "The private folder was not found" | `homebase-private` is not beside the web folder. Move it, or add `.private-path` (Step 4.3). |
| "500 Internal Server Error" the moment you open the site | Your host does not allow an `.htaccess` directive. Open `.htaccess` in the web folder and delete the line `Options -Indexes` (then, if needed, the `<FilesMatch>` / `<Files>` blocks); the app still works, because the real protection is the private folder. |
| White page / "Server error" | Set `HB_DEBUG=1` in `.env`, reload, read the message, then set it back to `0`. Also check the host's PHP error log. |
| `setup.php` host check says *Database connection* failed | Wrong `DB_HOST/NAME/USER/PASS`, or the user was not added to the database (Step 2.3). |
| Setup says tables missing | Run `schema.sql` (Step 5) in the *right* database. |
| Sign-in works, then you are sent back to the login | Cookies blocked, or `storage/sessions` is not writable, or the site is opened over HTTP. Use `https://`. |
| Sign-in says "Locked" | 5 wrong tries. Wait 15 min, or delete the files in `homebase-private/storage/ratelimit/`. |
| Uploads stop at a certain size | The progress toast shows the reason. Home Base uses chunks; if your host caps request bodies below ~256 KB, ask the host to raise `post_max_size`. |
| *Feeds* / *Weather* say "no cURL" or "Could not load that address" | Your host has no `curl` extension, or blocks outgoing connections. Ask the host to enable PHP `curl` (and `simplexml`), or skip those two tiles. Private/LAN addresses are always refused on purpose. |
| An *Embed* tile is blank or says the site refuses | Many sites (Google, GitHub, banks, most news sites) forbid being shown inside other pages. Home Base checks this (needs cURL) and shows a simplified copy instead; `⋯ → Show` switches between *Automatic*, *Live page* and *Simplified copy*. *Open in new tab* always works. YouTube/Spotify/Vimeo links are converted to their embeddable form automatically. |
| YouTube says **"Error 153"** | Fixed in this version: the player now tells YouTube the site's address (only the address, never the page). Upload the new `web/gadgets/` folder. If it persists, a browser extension may be stripping referrers. |
| *Open all* opens only one link | The browser's pop-up blocker. Click the blocked-pop-up icon in the address bar and choose *Always allow pop-ups from task.francistsoi.com*, then press *Open all* again. |
| A share link says *Not Found* | `mod_rewrite` is off. Use the long form `…/share.php?s=<name>` (see *Share links*). |
| A share link says *not available* | It was switched off, it expired, or its scenario was deleted. Make a new one in `⋯ → Share this scenario…`. |
| YouTube playlist shows ads | YouTube decides this; it cannot be changed from Home Base. YouTube Premium (signed in, same browser) removes ads. For an ad-free playlist use the *Music player* tile with your own audio files. |
| Library search says "Set up" | Normal the first time. Search a word on the library's own site, copy the results-page address, paste it into the dialog; Home Base learns the pattern (right-click a site chip to redo it). |
| Music will not seek / skip | Your host or a proxy strips `Range` requests. Playback still works, seeking does not. |
| Files tile says "File is missing on disk" | `storage/files/` was moved or restored without its contents. Copy the files back. |
| Hosting runs **nginx** (no `.htaccess`) | The `.htaccess` rules are ignored. Add equivalents in the site's nginx config: redirect to HTTPS and `deny all` for dotfiles and `_boot.php`. Privacy of your files and secrets does not depend on it, because they live outside the web folder. |
| You sit behind Cloudflare or a proxy | The 5-tries pause is per visitor IP as the server sees it, so everyone behind the same proxy shares it. Fine for one person. |

## Security notes (what protects what)

- **Login on every request**: the API, file downloads and exports all check your session. No cookie, no data.
- **Secrets never reach the browser**: the database password lives in `homebase-private/.env`, outside the web.
- **Files are private**: stored under random names outside the web and served only after login, through
  the gateway, never as direct links. Downloads cannot run scripts (`nosniff`, sandboxed CSP, attachment
  for unknown types).
- **Writes need a CSRF token** and the session cookie is `HttpOnly`, `SameSite=Lax` (and `Secure` on HTTPS).
- **Passphrase** is stored only as a bcrypt-style hash; guessing is slowed and paused after 5 tries.
- **Database user** has rights on this one database only.
- Link cards accept only `http(s)`, `mailto` and `tel` addresses.
- **Outside fetches** (feeds, weather, page and video titles, the embed check and copy) run on the server with guards: only http(s) on ports 80/443, every address the
  name resolves to must be public (no localhost, LAN or cloud-metadata ranges), the connection is pinned to the checked address,
  redirects are re-checked, size and time are capped, and XML with entity tricks is refused. You must be signed in to use them
  (a share-link visitor only for what the shared tiles hold).
- **Embedded pages** run in a sandboxed `<iframe>` from the other website's own origin, so they cannot read Home Base. They are told only
  the site address (`https://task.francistsoi.com/`), which YouTube requires, never the page or anything after it. The *simplified copy*
  of a site that refuses frames is fetched by the server, stripped of scripts and served with a sandbox policy (no scripts, no forms).
- **Writer "HTML + JS"** pages run from `api.php?r=g/writer/run` under `Content-Security-Policy: sandbox allow-scripts` without
  `allow-same-origin`: their scripts get an anonymous origin with no cookies, cannot call the API and cannot touch the Home Base page,
  even when the run page is opened in its own tab. Rich text is cleaned by a whitelist (no scripts, event handlers, frames or
  `javascript:` links) when it is saved and when it is shown.
- **Share links** are read-only by design: a visitor's requests only reach the shared scenario's data and the gadget actions its tiles
  need (a feed listed in a shared News tile, the weather for the shared place). Writes, your other scenarios, settings, trash, search,
  backup and the share list all answer *401/403*. Passwords are stored hashed; changing it or switching the link off ends every
  visitor's access at once.
- **Sign out on all devices** changes a key stored in the database that every session must match, so every other device is signed
  out on its next request (share-link visitors are not affected).
- Markdown notes, quotes and feed text are rendered as plain DOM text, never as HTML.
