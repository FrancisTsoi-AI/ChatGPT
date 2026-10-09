(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  /** POST multipart with upload progress (fetch cannot report it). */
  function xhrPost(route, form, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', 'api.php?r=' + route);
      x.setRequestHeader('X-CSRF-Token', HB.api.csrf());
      x.responseType = 'json';
      x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded); };
      x.onload = () => {
        const j = x.response || {};
        if (x.status >= 200 && x.status < 300) resolve(j);
        else { if (x.status === 401) location.reload(); const err = new Error(j.error || 'Upload failed (' + x.status + ')'); err.status = x.status; reject(err); }
      };
      x.onerror = () => { const err = new Error('Network error'); err.status = 0; reject(err); };
      x.send(form);
    });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

  async function uploadOne(file, tileId, onProgress, folderId) {
    const lim = S.data.limits;
    if (file.size > lim.max_file) throw new Error('is larger than the allowed ' + HB.size(lim.max_file));
    if (file.size <= lim.single_max) {
      const f = new FormData();
      f.append('tile_id', tileId);
      if (folderId) f.append('folder_id', folderId);
      f.append('file', file, file.name);
      const res = await xhrPost('upload', f, onProgress);
      return res.files[0];
    }
    // large file: send in chunks, each retried a few times
    const id = randomId();
    let offset = 0;
    while (offset < file.size) {
      const blob = file.slice(offset, offset + lim.chunk);
      let res = null, lastErr = null;
      for (let attempt = 0; attempt < 4 && !res; attempt++) {
        try {
          const f = new FormData();
          f.append('upload_id', id); f.append('offset', offset); f.append('total', file.size);
          f.append('name', file.name); f.append('tile_id', tileId); if (folderId) f.append('folder_id', folderId); f.append('file', blob, 'chunk');
          res = await xhrPost('upload-chunk', f, (loaded) => onProgress(offset + loaded));
        } catch (e) {
          lastErr = e;
          if (e.status && e.status < 500 && e.status !== 408) throw e;
          await sleep(1000 * Math.pow(2, attempt));
        }
      }
      if (!res) throw lastErr || new Error('Upload failed');
      offset += blob.size;
      onProgress(offset);
      if (res.done) return res.file;
    }
    throw new Error('Upload ended early');
  }

  /** Find or create the nested folders `names` under folder `parent`; returns the innermost folder's id. */
  async function ensureFolders(tileId, parent, names, made) {
    for (const name of names) {
      const key = parent + '/' + name.toLowerCase();
      let id = made.get(key);
      if (!id) {
        const have = S.entriesOf(tileId, 'folder').find((e) => e.num === parent && e.a.toLowerCase() === name.toLowerCase());
        id = have ? have.id : (await S.create('entries', { tile_id: tileId, kind: 'folder', a: name.slice(0, 255), num: parent }, { label: 'new folder' })).id;
        made.set(key, id);
      }
      parent = id;
    }
    return parent;
  }

  const upload = (HB.upload = {
    /** Upload one File into a tile and resolve with its file row (used by gadgets that place the file themselves). */
    one: (file, tileId, onProgress) => uploadOne(file, tileId, onProgress || (() => {})),
    queue: [], running: 0,
    /**
     * Upload browser File objects into a Files/Music tile (content tile id). A Files tile puts them in the folder
     * that is open (or `folderId`); files dropped from a folder on the desktop carry `_dir` and rebuild that tree.
     */
    async files(list, tileId, folderId) {
      const tile = S.get('tiles', tileId);
      if (!tile) { HB.ui.toast('That tile is gone', { type: 'error' }); return; }
      const meta = HB.gadgets.meta(tile.type);
      const folders = (meta.entryKinds || []).includes('folder');
      let base = folders ? (folderId !== undefined ? folderId : HB.folderCur[tileId] || 0) : 0;
      if (base && !S.entriesOf(tileId, 'folder').some((e) => e.id === base)) base = 0;
      const made = new Map();
      for (const file of list) {
        if (meta.uploads === 'audio' && !isAudioFile(file)) { HB.ui.toast('"' + file.name + '" is not an audio file', { type: 'error' }); continue; }
        let into = base;
        if (folders && file._dir && file._dir.length) {
          try { into = await ensureFolders(tileId, base, file._dir, made); } catch (e) { HB.ui.toast('Could not make the folder: ' + e.message, { type: 'error' }); }
        }
        this.queue.push({ file, tileId, folderId: into });
      }
      this.pump();
    },
    pump() {
      while (this.running < 2 && this.queue.length) {
        const job = this.queue.shift();
        this.running++;
        const toast = HB.ui.toast('Uploading ' + job.file.name + '…', { timeout: 0, progress: true });
        uploadOne(job.file, job.tileId, (loaded) => toast.progress(loaded / Math.max(1, job.file.size)), job.folderId)
          .then((row) => { S.addFileRows([row]); toast.done('Uploaded ' + job.file.name, 2200); })
          .catch((e) => { toast.close(); HB.ui.toast('"' + job.file.name + '" ' + (e.message || 'failed'), { type: 'error' }); })
          .finally(() => { this.running--; this.pump(); });
      }
    },
  });

  // ---- drop files anywhere on the page ----------------------------------------------------
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');

  /** Which Files/Music tile (content tile) should receive a drop at this point? */
  const takes = (t, rule) => t && S.contentTile(t) && HB.gadgets.meta(t.type).uploads === rule;
  function targetFor(x, y) {
    const under = HB.board.tileAt(x, y);
    if (takes(under, 'any') || takes(under, 'audio')) return { id: S.contentTile(under).id, display: under, under: true };
    const first = S.tilesOf(HB.board.scenarioId).find((t) => takes(t, 'any'));
    return first ? { id: S.contentTile(first).id, display: first } : null;
  }
  const isAudioFile = (f) => /^audio\//.test(f.type) || /\.(mp3|mpga|m4a|aac|wav|ogg|oga|opus|flac|weba)$/i.test(f.name);

  async function walk(entry, out, dir) {
    dir = dir || [];
    if (entry.isFile) { await new Promise((res) => entry.file((f) => { f._dir = dir; out.push(f); res(); }, res)); return; }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      for (;;) {
        const batch = await new Promise((res) => reader.readEntries(res, () => res([])));
        if (!batch.length) break;
        for (const e of batch) await walk(e, out, dir.concat(entry.name));
      }
    }
  }

  async function collect(dt) {
    const out = [];
    const entries = Array.from(dt.items || []).map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
    if (entries.length && entries.every(Boolean)) { for (const e of entries) await walk(e, out); return out; }
    return Array.from(dt.files || []);
  }

  upload.initDrop = function () {
    const overlay = document.getElementById('drop-overlay');
    const label = document.getElementById('drop-target');
    let depth = 0, hot = null;
    const clear = () => { overlay.hidden = true; depth = 0; if (hot) { hot.classList.remove('drop-target'); hot = null; } };
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; overlay.hidden = false; });
    window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth--; if (depth <= 0) clear(); });
    window.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const t = targetFor(e.clientX, e.clientY);
      const el = t ? document.querySelector('.tile[data-tile="' + t.display.id + '"]') : null;
      if (el !== hot) { if (hot) hot.classList.remove('drop-target'); hot = el; if (hot) hot.classList.add('drop-target'); }
      label.textContent = t ? ' → ' + (t.display.title || HB.typeInfo[t.display.type].label) : ' → a new Files tile';
    });
    window.addEventListener('drop', async (e) => {
      if (!hasFiles(e)) return;
      if (e.defaultPrevented) { clear(); return; } // a gadget (e.g. the Writer) took this drop itself
      e.preventDefault();
      const target = targetFor(e.clientX, e.clientY);
      const dt = e.dataTransfer;
      const filesPromise = collect(dt); // must start synchronously
      clear();
      const list = await filesPromise;
      if (!list.length) return;
      let id = target && target.id;
      // audio dropped on empty space goes to the Music player, not the Files tile
      const music = S.tilesOf(HB.board.scenarioId).find((t) => takes(t, 'audio'));
      if (!(target && target.under) && music && list.every(isAudioFile)) id = S.contentTile(music).id;
      if (!id) {
        const row = await HB.board.addTile('files');
        if (!row) return;
        id = row.id;
      }
      upload.files(list, id);
    });
  };
})();
