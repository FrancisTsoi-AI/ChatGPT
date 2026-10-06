(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  const fmt = (s) => (isFinite(s) ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00');

  /** One audio element for the whole page, so music keeps playing when you switch scenarios. */
  const P = (HB.player = {
    audio: null, tileId: null, id: null,
    queue(tileId) { return S.itemsOf('files', tileId).filter((f) => HB.isAudio(f)); },
    tileSettings(tileId) { const t = S.get('tiles', tileId); return t ? t.settings || {} : {}; },
    current() { return this.id ? S.get('files', this.id) : null; },
    play(tileId, fileId) {
      const f = S.get('files', fileId);
      if (!f) return;
      this.tileId = tileId; this.id = fileId;
      this.audio.src = HB.fileUrl(f);
      this.audio.play().catch(() => {});
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: f.original_name.replace(/\.[^.]+$/, ''), artist: 'Home Base' });
      }
      this.syncUI();
    },
    toggle(tileId) {
      if (this.tileId === tileId && this.id && this.audio.src) { this.audio.paused ? this.audio.play().catch(() => {}) : this.audio.pause(); return; }
      const q = this.queue(tileId);
      if (q.length) this.play(tileId, q[0].id);
    },
    step(dir, auto) {
      const q = this.queue(this.tileId);
      if (!q.length) return;
      const st = this.tileSettings(this.tileId);
      let i = q.findIndex((f) => f.id === this.id);
      if (st.shuffle && auto !== false && q.length > 1) {
        let n; do { n = Math.floor(Math.random() * q.length); } while (n === i);
        i = n;
      } else {
        i += dir;
        if (i >= q.length) { if (st.loop || !auto) i = 0; else { this.stop(); return; } }
        if (i < 0) i = q.length - 1;
      }
      this.play(this.tileId, q[i].id);
    },
    stop() { this.audio.pause(); this.syncUI(); },
    /** Reflect the player state in every music tile on screen. */
    syncUI() {
      if (!this.audio) return;
      if (this.id && !S.get('files', this.id)) { this.audio.pause(); this.audio.removeAttribute('src'); this.id = null; }
      const playing = !!this.id && !this.audio.paused;
      HB.$$('.music').forEach((m) => {
        const mine = Number(m.dataset.tile) === this.tileId;
        m.classList.toggle('active', mine && !!this.id);
        const btn = HB.$('.mp-play', m);
        if (btn) btn.textContent = mine && playing ? '⏸' : '▶';
        HB.$$('.file', m).forEach((r) => r.classList.toggle('playing', mine && Number(r.dataset.id) === this.id));
        const title = HB.$('.mp-title', m);
        const f = this.current();
        if (title) title.textContent = mine && f ? f.original_name : 'Nothing playing';
        const seek = HB.$('.mp-seek', m);
        if (seek && !(mine && this.id)) { seek.value = 0; HB.$('.mp-time', m).textContent = '0:00'; }
      });
    },
    tick() {
      const a = this.audio;
      const m = document.querySelector('.music[data-tile="' + this.tileId + '"]');
      if (!m) return;
      const seek = HB.$('.mp-seek', m);
      if (seek && !seek.dragging) { seek.max = a.duration || 0; seek.value = a.currentTime || 0; }
      HB.$('.mp-time', m).textContent = fmt(a.currentTime) + ' / ' + fmt(a.duration);
    },
    init() {
      this.audio = document.getElementById('audio');
      if (!this.audio) return;
      this.audio.addEventListener('timeupdate', () => this.tick());
      this.audio.addEventListener('play', () => this.syncUI());
      this.audio.addEventListener('pause', () => this.syncUI());
      this.audio.addEventListener('ended', () => this.step(1, true));
      this.audio.addEventListener('error', () => { if (this.id) HB.ui.toast('Could not play that file', { type: 'error' }); });
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('previoustrack', () => this.step(-1, false));
        navigator.mediaSession.setActionHandler('nexttrack', () => this.step(1, false));
      }
    },
  });
  HB.bus.on('data', () => { if (HB.player.audio) HB.player.syncUI(); });

  HB.registerTile('music', {
    w: 4, h: 6,
    render(body, ctx) {
      const st = ctx.settings;
      const seek = h('input', { type: 'range', class: 'mp-seek', min: 0, max: 0, step: 0.1, value: 0, 'aria-label': 'Seek',
        oninput: (e) => { seek.dragging = true; P.audio.currentTime = Number(e.target.value); },
        onchange: () => { seek.dragging = false; } });
      const btn = (cls, text, title, fn) => h('button', { class: 'btn icon ghost ' + cls, text, title, 'aria-label': title, onclick: fn });
      const panel = h('div', { class: 'mp' },
        h('div', { class: 'mp-title', text: 'Nothing playing' }),
        h('div', { class: 'mp-controls' },
          btn('', '⏮', 'Previous', () => { if (P.tileId !== ctx.id) P.toggle(ctx.id); else P.step(-1, false); }),
          btn('mp-play primary', '▶', 'Play / pause', () => P.toggle(ctx.id)),
          btn('', '⏭', 'Next', () => { if (P.tileId !== ctx.id) P.toggle(ctx.id); else P.step(1, false); }),
          btn('toggle' + (st.shuffle ? ' on' : ''), '🔀', 'Shuffle', () => HB.setTileSettings(ctx.id, { shuffle: !st.shuffle })),
          btn('toggle' + (st.loop ? ' on' : ''), '🔁', 'Repeat the playlist', () => HB.setTileSettings(ctx.id, { loop: !st.loop }))),
        h('div', { class: 'mp-seekrow' }, seek, h('span', { class: 'mp-time', text: '0:00' })));
      const wrap = h('div', { class: 'music', dataset: { tile: ctx.id } }, panel);
      body.append(wrap);
      const inner = h('div', {});
      wrap.append(inner);
      HB.fileTileRender(inner, ctx, { audioOnly: true });
      HB.$('.files', inner).dataset.accept = 'audio';
      const fileInput = HB.$('input[type=file]', inner);
      fileInput.accept = 'audio/*';
      // click a track to play it
      HB.$$('.file', inner).forEach((row) => {
        const id = Number(row.dataset.id);
        const open = HB.$('.file-open', row);
        open.onclick = (e) => { e.preventDefault(); if (!HB.justDragged()) P.play(ctx.id, id); };
        const nm = HB.$('.file-name', row);
        nm.addEventListener('click', (e) => { e.stopImmediatePropagation(); if (!HB.justDragged()) P.play(ctx.id, id); }, true);
      });
      HB.onCleanup(body, () => HB.runCleanups(inner));
    },
    menu(tile, ctx) {
      return [
        { label: 'Shuffle', checked: !!ctx.settings.shuffle, onClick: () => HB.setTileSettings(ctx.id, { shuffle: !ctx.settings.shuffle }) },
        { label: 'Repeat playlist', checked: !!ctx.settings.loop, onClick: () => HB.setTileSettings(ctx.id, { loop: !ctx.settings.loop }) },
      ];
    },
  });
})();
