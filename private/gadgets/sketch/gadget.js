(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  const W = 1600, H = 1000;
  const COLORS = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#9333ea', '#6b7280'];
  const SIZES = [['Thin', 3], ['Medium', 8], ['Thick', 20]];

  const dirty = new Set();    // tiles with strokes not yet saved
  const saving = new Set();
  const again = new Set();
  const versions = {};        // tile id -> stroke counter

  const fileOf = (ctx) => S.itemsOf('files', ctx.id)[0] || null;
  const url = (f) => 'file.php?id=' + f.id + '&v=' + encodeURIComponent(f.updated_at || f.size);

  async function save(ctx, canvas, setStatus) {
    if (saving.has(ctx.id)) { again.add(ctx.id); return; }
    saving.add(ctx.id);
    const ver = versions[ctx.id];
    setStatus('Saving…');
    try {
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      const fd = new FormData();
      fd.append('tile_id', String(ctx.id));
      const f = fileOf(ctx);
      if (f) fd.append('replace_id', String(f.id));
      fd.append('file', blob, 'sketch.png');
      const res = await HB.api.call('upload', { method: 'POST', form: fd });
      const row = res.files[0];
      const have = S.get('files', row.id);
      if (have) Object.assign(have, row); else S.addFileRows([row]);
      if (versions[ctx.id] === ver) dirty.delete(ctx.id);
      HB.board.markRendered(ctx.tile.id);
      setStatus(dirty.has(ctx.id) ? 'Unsaved…' : 'Saved');
    } catch (e) {
      setStatus('Not saved: ' + e.message);
      HB.ui.toast('Could not save the sketch: ' + e.message, { type: 'error' });
    } finally {
      saving.delete(ctx.id);
      if (again.delete(ctx.id)) save(ctx, canvas, setStatus);
    }
  }

  HB.gadgets.define('sketch', class extends HB.Gadget {
    sig(ctx) { const f = fileOf(ctx); return f ? [f.id, f.updated_at] : null; }
    keep(ctx) { return dirty.has(ctx.id); }
    render(body, ctx) {
      const canvas = h('canvas', { class: 'sk-canvas', width: W, height: H });
      const g = canvas.getContext('2d');
      const paper = () => { g.globalCompositeOperation = 'source-over'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); };
      paper();
      const base = document.createElement('canvas'); base.width = W; base.height = H; // the loaded picture, for undo
      const bg = base.getContext('2d'); bg.fillStyle = '#fff'; bg.fillRect(0, 0, W, H);
      let strokes = [], tool = { color: COLORS[0], size: 8, eraser: false }, cur = null;
      const status = h('span', { class: 'muted small', text: '' });
      const setStatus = (t) => { status.textContent = t; };
      versions[ctx.id] = versions[ctx.id] || 0;

      const f = fileOf(ctx);
      if (f) {
        const img = new Image();
        img.onload = () => { if (!strokes.length) { bg.drawImage(img, 0, 0, W, H); g.drawImage(img, 0, 0, W, H); } };
        img.src = url(f);
      }

      const drawStroke = (s, from) => {
        g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = s.color; g.lineWidth = s.size;
        const p = s.pts;
        if (p.length === 1) { g.beginPath(); g.fillStyle = s.color; g.arc(p[0][0], p[0][1], s.size / 2, 0, Math.PI * 2); g.fill(); return; }
        g.beginPath();
        let i = Math.max(1, from || 1);
        g.moveTo(p[i - 1][0], p[i - 1][1]);
        for (; i < p.length; i++) {
          const mx = (p[i - 1][0] + p[i][0]) / 2, my = (p[i - 1][1] + p[i][1]) / 2;
          g.quadraticCurveTo(p[i - 1][0], p[i - 1][1], mx, my);
        }
        g.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
        g.stroke();
      };
      const redraw = () => { g.drawImage(base, 0, 0); strokes.forEach((s) => (s.clear ? (g.fillStyle = '#fff', g.fillRect(0, 0, W, H)) : drawStroke(s))); };
      const pt = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)]; };

      let timer = null;
      const touched = () => { versions[ctx.id]++; dirty.add(ctx.id); setStatus('Unsaved…'); clearTimeout(timer); timer = setTimeout(() => save(ctx, canvas, setStatus), 1500); };

      canvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        canvas.setPointerCapture(e.pointerId);
        cur = { color: tool.eraser ? '#ffffff' : tool.color, size: tool.eraser ? tool.size * 2 : tool.size, pts: [pt(e)] };
        drawStroke(cur);
        e.preventDefault();
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!cur) return;
        (e.getCoalescedEvents ? e.getCoalescedEvents() : [e]).forEach((ev) => cur.pts.push(pt(ev)));
        if (cur.pts.length > 1) drawStroke(cur, Math.max(1, cur.pts.length - 4));
      });
      const end = () => { if (!cur) return; strokes.push(cur); cur = null; touched(); };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);

      const swatches = COLORS.map((c) => h('button', { type: 'button', class: 'sk-color', style: { background: c }, dataset: { c }, title: c, 'aria-label': 'Pen colour ' + c,
        onclick: () => { tool.color = c; tool.eraser = false; mark(); } }));
      const sizes = SIZES.map(([n, s]) => h('button', { type: 'button', class: 'btn small sk-size', text: n, dataset: { s }, onclick: () => { tool.size = s; mark(); } }));
      const eraser = h('button', { type: 'button', class: 'btn small sk-eraser', text: 'Eraser', onclick: () => { tool.eraser = !tool.eraser; mark(); } });
      const mark = () => {
        swatches.forEach((b) => b.classList.toggle('on', !tool.eraser && b.dataset.c === tool.color));
        sizes.forEach((b) => b.classList.toggle('on', Number(b.dataset.s) === tool.size));
        eraser.classList.toggle('on', tool.eraser);
      };
      mark();
      const undo = () => { if (!strokes.length) return; strokes.pop(); redraw(); touched(); };
      const clear = async () => {
        if (!(await HB.ui.confirm({ title: 'Clear the board?', message: 'The drawing is wiped (you can still undo this clear until you leave the page).', confirm: 'Clear', danger: true }))) return;
        strokes.push({ clear: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); touched();
      };
      const download = () => canvas.toBlob((b) => { const a = h('a', { href: URL.createObjectURL(b), download: (ctx.tile.title || 'sketch') + '.png' }); document.body.append(a); a.click(); a.remove(); }, 'image/png');

      body.append(h('div', { class: 'sk' },
        h('div', { class: 'sk-bar' }, swatches, h('span', { class: 'sk-sep' }), sizes, eraser, h('span', { class: 'sk-sep' }),
          h('button', { class: 'btn small', text: '↶ Undo', onclick: undo }), h('button', { class: 'btn small', text: 'Clear', onclick: clear }),
          h('button', { class: 'btn small', text: '⬇ PNG', onclick: download }), status),
        h('div', { class: 'sk-wrap' }, canvas)));
      setStatus(f ? 'Saved' : 'Blank');

      const leave = () => { if (dirty.has(ctx.id)) { clearTimeout(timer); save(ctx, canvas, () => {}); } };
      const vis = () => { if (document.visibilityState === 'hidden') leave(); };
      document.addEventListener('visibilitychange', vis);
      HB.onCleanup(body, () => { document.removeEventListener('visibilitychange', vis); leave(); });
    }
  });
})();
