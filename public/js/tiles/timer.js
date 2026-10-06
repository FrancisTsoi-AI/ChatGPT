(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  let audio = null;
  /** Three soft beeps; the AudioContext is created from a click so the browser allows it. */
  function prime() { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) { /* no audio */ } }
  function chime() {
    if (!audio) return;
    [0, 0.45, 0.9].forEach((t) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audio.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.35);
      o.connect(g); g.connect(audio.destination);
      o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.4);
    });
  }
  HB.chime = chime;

  const pad = (n) => String(n).padStart(2, '0');
  function clock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return (hh ? hh + ':' + pad(mm) : pad(mm)) + ':' + pad(ss);
  }
  const elapsed = (st) => (st.el || 0) + (st.since ? Date.now() - st.since : 0);

  HB.registerTile('timer', {
    w: 3, h: 4,
    render(body, ctx) {
      const st = ctx.settings;
      const mode = st.mode === 'up' ? 'up' : 'down';
      const dur = (st.dur || 1500) * 1000;
      const set = (patch) => S.update('tiles', ctx.id, { settings: Object.assign({}, st, patch) }, { record: false });
      const running = !!st.since;

      const time = h('div', { class: 'timer-time' });
      const label = h('div', { class: 'timer-label muted' });
      const paint = () => {
        const e = elapsed(st);
        if (mode === 'down') {
          const left = dur - e;
          time.textContent = clock(left);
          label.textContent = st.done ? 'Time is up' : running ? 'Counting down' : e > 0 ? 'Paused' : 'Ready · ' + clock(dur);
          time.classList.toggle('over', !!st.done);
          return left;
        }
        time.textContent = clock(e).replace(/^(\d\d):(\d\d)$/, '$1:$2');
        label.textContent = running ? 'Counting up' : e > 0 ? 'Paused' : 'Stopwatch';
        return Infinity;
      };
      const finish = (silent) => {
        set({ since: null, el: dur, done: true });
        if (!silent) {
          chime();
          HB.ui.toast('⏰ Timer finished' + (ctx.tile.title ? ': ' + ctx.tile.title : ''), { timeout: 8000 });
          const old = document.title; document.title = '⏰ Time is up';
          setTimeout(() => { document.title = old; }, 8000);
        }
      };

      const start = () => {
        prime();
        const fresh = mode === 'down' && (st.done || (st.el || 0) >= dur) ? { el: 0, done: false } : {};
        set(Object.assign({ since: Date.now(), done: false }, fresh));
      };
      const pause = () => set({ el: elapsed(st), since: null });
      const reset = () => set({ el: 0, since: null, done: false });

      const modes = h('div', { class: 'seg' },
        ['down', 'up'].map((m) => h('button', { type: 'button', class: 'seg-btn' + (m === mode ? ' on' : ''), disabled: running,
          text: m === 'down' ? 'Count down' : 'Count up', onclick: () => set({ mode: m, el: 0, since: null, done: false }) })));
      const presets = mode === 'down' && !running ? h('div', { class: 'chips presets' }, [1, 5, 10, 25, 45, 60].map((m) => h('button', {
        type: 'button', class: 'chip' + (dur === m * 60000 ? ' on' : ''), text: m + 'm', onclick: () => set({ dur: m * 60, el: 0, since: null, done: false }),
      })).concat(h('button', { type: 'button', class: 'chip', text: 'Custom…', onclick: async () => {
        const v = await HB.ui.form({ title: 'Countdown length', fields: [
          { name: 'h', label: 'Hours', value: String(Math.floor(dur / 3600000)) }, { name: 'm', label: 'Minutes', value: String(Math.floor((dur % 3600000) / 60000)) }, { name: 's', label: 'Seconds', value: String(Math.floor((dur % 60000) / 1000)) }] });
        if (!v) return;
        const total = (parseInt(v.h, 10) || 0) * 3600 + (parseInt(v.m, 10) || 0) * 60 + (parseInt(v.s, 10) || 0);
        if (total > 0) set({ dur: Math.min(total, 99 * 3600), el: 0, since: null, done: false });
      } }))) : null;
      body.append(h('div', { class: 'timer' }, modes, time, label,
        h('div', { class: 'timer-btns' },
          h('button', { class: 'btn primary', text: running ? 'Pause' : 'Start', onclick: running ? pause : start }),
          h('button', { class: 'btn', text: 'Reset', onclick: reset })),
        presets));

      const left = paint();
      if (running && mode === 'down' && left <= 0) { finish(true); return; } // it ended while this page was closed
      const iv = setInterval(() => { const l = paint(); if (running && mode === 'down' && l <= 0) { clearInterval(iv); finish(false); } }, 250);
      HB.onCleanup(body, () => clearInterval(iv));
    },
  });
})();
