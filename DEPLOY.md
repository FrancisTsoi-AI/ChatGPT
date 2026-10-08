# Installing and updating Home Base (task.francistsoi.com)

Home Base works like WordPress: **one file** puts it on your site, and from then on everything is done in the
browser. On the **Gadgets & updates** page you add, update, switch off and delete gadgets (plug-ins), and Home Base
updates itself when you drop its newer file there. No FTP, no editing settings files, no phpMyAdmin.

You need a shared host with **PHP 8.0 or later** (with the `zip` and `pdo_mysql` extensions, normally on),
**MySQL or MariaDB**, and the hosting panel's **file manager** (to upload the one file, once).

The release files (in `dist/`):

| File | What it is for |
|---|---|
| **`homebase-setup.php`** | **The one file.** Upload it once and open it: it installs Home Base (or updates an older one). Later, drop the newer one on *Gadgets & updates*. |
| `homebase.zip` | The same thing as a plain zip, for updates if your host refuses `.php` uploads through a web form. |
| `gadgets/<name>-<version>.zip` | Each built-in gadget on its own. Rarely needed: built-in gadgets are offered on the Gadgets page with one click. |

---

## Install (about 5 minutes)

### 1 · Create the subdomain and the database (hosting panel)

1. **Domains → Subdomains** (cPanel: *Subdomains*): create **`task`** under `francistsoi.com`. Note its **document root**
   (for example `/home/USER/task.francistsoi.com` or `/home/USER/public_html/task`).
2. Turn on **HTTPS** for it (cPanel: *SSL/TLS Status → Run AutoSSL*, or *Let's Encrypt*).
3. **MySQL Databases** (cPanel): create a database (e.g. `USER_homebase`) and a user with a long password (e.g. `USER_hb`),
   and **add the user to the database with ALL PRIVILEGES**. Keep the names and the password at hand.

### 2 · Upload the one file and open it

1. **File Manager** → open the subdomain's document root → **Upload** → `homebase-setup.php`.
2. Open **https://task.francistsoi.com/homebase-setup.php** in your browser.
3. The page checks your host (everything should be ✓), then asks for the database (host, usually `localhost`; name; user;
   password) and the **passphrase** you will sign in with (10+ characters; a few random words is best). Press **Install Home Base**.

That's it. The installer:
- puts the web files in the web folder;
- creates the **private folder** `homebase-private` *next to* it, outside the web, where your settings, uploaded files
  and gadgets live;
- writes the settings file and creates the tables;
- adds every built-in gadget;
- **deletes itself**.

Press *Open Home Base* and sign in.

> For safety, the installer works only for **2 hours** after you upload it, then removes itself. On a site that is
> already installed it only offers an update, which needs your passphrase. So upload it and open it right away.

If the host check shows a ✗, it says what to do. Usually that's switching on a PHP extension or choosing PHP 8 in the
panel's *Select PHP Version*. On a few hosts you need to create an empty folder named `homebase-private` next to the web
folder in the file manager. Fix it and reload the page.

### 3 · Check it works

- [ ] Three tabs **Work · Idea · PhD** with starter tiles (keys `1` `2` `3` switch)
- [ ] Add a link in the Toolbox, add a task, drag it to **Later**, reload: it is still there
- [ ] Drag a tile by its title, pull its corner to resize, reload: the layout survived
- [ ] Double-click empty space: a **Writer** appears; type, make a word bold, reload: still there
- [ ] Add a **Files** tile, drop a PDF onto the page: it appears and downloads intact
- [ ] `⋯ → Gadgets & updates…` shows Home Base's version and 24 installed gadgets
- [ ] Sign in on your phone: it stays signed in for 90 days

### 4 · Make it your start page

- **Chrome / Edge:** Settings → *On startup* → *Open a specific page* → `https://task.francistsoi.com`.
- **Firefox:** Settings → *Home* → *Custom URLs*. **Safari:** Settings → *General* → *Homepage*.

---

## Gadgets & updates (like WordPress's Plugins and Updates)

Open **`⋯ → Gadgets & updates…`** (also at the bottom of **+ Tile**). Every tile type is a **gadget**, a self-contained plug-in.

- **Add a gadget:** drag its `.zip` onto the box (or click the box to choose the file). Home Base checks it and shows its
  name, version, author, size and whether it has server code. Confirm with your passphrase.
- **Built-in gadgets you can add:** gadgets that come with Home Base but are not installed are listed with an **Add** button,
  plus *Add all*. That covers ones you deleted and new ones a Home Base update brought. No file needed.
- **Update a gadget:** drop its newer `.zip`. When a Home Base update brings a newer built-in gadget, it shows
  **update: x.y.z** with an **Update** button.
- **Switch off / on**, **⬇ .zip** and **Delete…**. The download is a copy you can keep, or change with an AI and
  `GADGET_API.md`. Deleting asks whether its tiles go to the Trash or stay until you add it again. Nothing else is affected.

**Update Home Base itself:** drop the newer **`homebase-setup.php`** (or `homebase.zip`) on the same box. You see the version
change and which gadgets will be updated; confirm with your passphrase.
- Home Base replaces its program files and keeps everything of yours: tiles, files, settings, share links and the gadgets
  you added.
- If anything goes wrong part-way, every replaced file is put back.
- Built-in gadgets you have are updated. New built-in ones wait under *Built-in gadgets you can add*.

**Updating from Home Base before 5.0** (no Gadgets & updates page yet): upload `homebase-setup.php` into the web folder with
the file manager and open it, as for an install. It recognises the old site, asks for your passphrase and updates it. It
also cleans up the old layout: it removes `web/gadgets/`, `web/js/tiles/` and the loose `homebase-private/gadgets/*.php`
files, then adds all built-in gadgets. Your data stays. From then on, update in the app.

Only install gadgets from people you trust: a gadget runs inside your Home Base, and one with server code runs on your web
server. Installing from files needs PHP's `zip` extension, and PHP must be allowed to write to the Home Base folders (normal
on shared hosting). `HB_GADGET_INSTALL=0` in `.env` switches installing from files off; built-in gadgets can still be added.

## Backups

- **In the app:** `⋯` → *Backup* → *Download data (JSON)* or *data + files (zip)*.
- **Belt and braces (monthly):** phpMyAdmin → your database → *Export* → *Quick* → *Go*. Then, in the file manager,
  compress `homebase-private/storage/files/` and download it. Those two things are everything.

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
| `HB_GADGET_INSTALL` | 1 | `0` switches off installing gadgets and updating Home Base from files (built-in gadgets can still be added) |

The settings file is `homebase-private/.env` (the installer wrote it; edit it in the file manager only for these).

To **change your passphrase**: empty `HB_PASSPHRASE_HASH=''` in `.env`, open `https://task.francistsoi.com/setup.php`, generate a
new hash, paste it in. Existing devices stay signed in until you also choose `⋯ → Sign out on all devices…` in the app.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| The installer says *Could not connect to the database* | Check the database name, user and password (hosts usually prefix them with your account name), and that the user was added to the database with all privileges. |
| The installer has *expired* | It works 2 hours after upload. Upload `homebase-setup.php` again and open it right away. |
| "The private folder was not found" | `homebase-private` was moved away from the web folder. Put it back next to it, or add a one-line file `.private-path` in the web folder with its full path. |
| "500 Internal Server Error" the moment you open the site | Your host does not allow an `.htaccess` directive. Open `.htaccess` in the web folder and delete the line `Options -Indexes` (then, if needed, the `<FilesMatch>` / `<Files>` blocks); the app still works, because the real protection is the private folder. |
| White page / "Server error" | Set `HB_DEBUG=1` in `.env`, reload, read the message, then set it back to `0`. Also check the host's PHP error log. |
| Sign-in works, then you are sent back to the login | Cookies blocked, or `storage/sessions` is not writable, or the site is opened over HTTP. Use `https://`. |
| Sign-in says "Locked" | 5 wrong tries. Wait 15 min, or delete the files in `homebase-private/storage/ratelimit/`. |
| Uploads stop at a certain size | The progress toast shows the reason. Home Base uses chunks; if your host caps request bodies below ~256 KB, ask the host to raise `post_max_size`. |
| *Feeds* / *Weather* say "no cURL" or "Could not load that address" | Your host has no `curl` extension, or blocks outgoing connections. Ask the host to enable PHP `curl` (and `simplexml`), or skip those two tiles. Private/LAN addresses are always refused on purpose. |
| An *Embed* tile is blank or says the site refuses | Many sites (Google, GitHub, banks, most news sites) forbid being shown inside other pages. Home Base checks this (needs cURL) and shows a simplified copy instead; `⋯ → Show` switches between *Automatic*, *Live page* and *Simplified copy*. *Open in new tab* always works. YouTube/Spotify/Vimeo links are converted to their embeddable form automatically. |
| YouTube says **"Error 153"** | Fixed in this version: the player now tells YouTube the site's address (only the address, never the page). Update the Embed and YouTube playlist gadgets. If it persists, a browser extension may be stripping referrers. |
| *Open all* opens only one link | The browser's pop-up blocker. Click the blocked-pop-up icon in the address bar and choose *Always allow pop-ups from task.francistsoi.com*, then press *Open all* again. |
| *Gadgets & updates* says dropping files is *not available*, or an update cannot run | It says why: no PHP `zip` extension (ask the host), PHP may not write to the Home Base folders (permissions 755), or `HB_GADGET_INSTALL=0`. |
| A tile says its gadget *did not load* | That gadget's code has an error. Drop a good copy of its zip on *Gadgets & updates* (built-in: Delete it, then Add it again), or delete it. The rest keeps working. |
| A tile says its gadget is *switched off or not installed* | Switch it on, or add it again under *Built-in gadgets you can add* (or drop its zip). Its content was kept. |
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
- **The installer** (`homebase-setup.php`) only installs on a site that has no Home Base yet, only within 2 hours of being
  uploaded, and deletes itself when done or expired; on an installed site it only updates, after your passphrase (5 tries,
  then 15 minutes). **Updates** need your session, the CSRF token and your passphrase; the package is checked first (only
  the expected folders, no `../` paths, links or settings files), files are swapped in one by one with a journal and put back
  if anything fails, and `.env`, your data and your gadgets are never touched.
- **Gadgets** live outside the web folder: the browser only ever receives a gadget's script, styles and asset files, never
  its `server.php` or notes. Installing one needs your session, the CSRF token and your passphrase again; the zip is checked
  before anything is written (no `../` paths, links, hidden or unknown file types, size limits, PHP must parse) and swapped
  in with a single rename. Share-link visitors can only call the server actions a gadget lists in `shareActions`.
- **Sign out on all devices** changes a key stored in the database that every session must match, so every other device is signed
  out on its next request (share-link visitors are not affected).
- Markdown notes, quotes and feed text are rendered as plain DOM text, never as HTML.
