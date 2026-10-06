(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;
  const AUDIO_RE = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba)$/i;
  const isAudioFile = (f) => /^audio\//.test(f.type) || AUDIO_RE.test(f.name);

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

  async function uploadOne(file, tileId, onProgress) {
    const lim = S.data.limits;
    if (file.size > lim.max_file) throw new Error('is larger than the allowed ' + HB.size(lim.max_file));
    if (file.size <= lim.single_max) {
      const f = new FormData();
      f.append('tile_id', tileId);
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
          f.append('name', file.name); f.append('tile_id', tileId); f.append('file', blob, 'chunk');
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

  const upload = (HB.upload = {
    queue: [], running: 0,
    /** Upload browser File objects into a Files/Music tile (content tile id). */
    files(list, tileId) {
      const tile = S.get('tiles', tileId);
      if (!tile) { HB.ui.toast('That tile is gone', { type: 'error' }); return; }
      list.forEach((file) => {
        if (tile.type === 'music' && !isAudioFile(file)) { HB.ui.toast('"' + file.name + '" is not an audio file', { type: 'error' }); return; }
        this.queue.push({ file, tileId });
      });
      this.pump();
    },
    pump() {
      while (this.running < 2 && this.queue.length) {
        const job = this.queue.shift();
        this.running++;
        const toast = HB.ui.toast('Uploading ' + job.file.name + '…', { timeout: 0, progress: true });
        uploadOne(job.file, job.tileId, (loaded) => toast.progress(loaded / Math.max(1, job.file.size)))
          .then((row) => { S.addFileRows([row]); toast.done('Uploaded ' + job.file.name, 2200); })
          .catch((e) => { toast.close(); HB.ui.toast('"' + job.file.name + '" ' + (e.message || 'failed'), { type: 'error' }); })
          .finally(() => { this.running--; this.pump(); });
      }
    },
  });

  // ---- drop files anywhere on the page ----------------------------------------------------
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');

  /** Which Files/Music tile (content tile) should receive a drop at this point? */
  function targetFor(x, y) {
    const under = HB.board.tileAt(x, y);
    if (under && (under.type === 'files' || under.type === 'music')) {
      const src = S.contentTile(under);
      if (src) return { id: src.id, display: under };
    }
    const first = S.tilesOf(HB.board.scenarioId).find((t) => t.type === 'files' && S.contentTile(t));
    return first ? { id: S.contentTile(first).id, display: first } : null;
  }

  async function walk(entry, out) {
    if (entry.isFile) { await new Promise((res) => entry.file((f) => { out.push(f); res(); }, res)); return; }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      for (;;) {
        const batch = await new Promise((res) => reader.readEntries(res, () => res([])));
        if (!batch.length) break;
        for (const e of batch) await walk(e, out);
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
      e.preventDefault();
      const target = targetFor(e.clientX, e.clientY);
      const dt = e.dataTransfer;
      const filesPromise = collect(dt); // must start synchronously
      clear();
      const list = await filesPromise;
      if (!list.length) return;
      let id = target && target.id;
      if (!id) {
        const row = await HB.board.addTile('files');
        if (!row) return;
        id = row.id;
      }
      upload.files(list, id);
    });
  };
})();
