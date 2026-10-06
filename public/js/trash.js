(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  const pointer = { x: -1, y: -1 };
  const track = (e) => {
    const t = e.touches && e.touches[0] ? e.touches[0] : e;
    if (t.clientX !== undefined) { pointer.x = t.clientX; pointer.y = t.clientY; }
  };
  ['pointermove', 'mousemove', 'touchmove'].forEach((n) => document.addEventListener(n, (e) => { track(e); if (HB.drag.active) T.hover(); }, { passive: true, capture: true }));

  const T = (HB.trash = {
    zone: null,
    init() {
      this.zone = document.getElementById('trash-zone');
      this.count = document.getElementById('trash-count');
      this.zone.addEventListener('click', () => this.open());
      HB.bus.on('saved', (ops) => { if (ops.some((o) => o.op !== 'update' && o.op !== 'setting')) this.refreshCount(); });
      HB.bus.on('data', (d) => { if (d.kind === 'sync') this.refreshCount(); });
      this.refreshCount();
    },
    dragging(on) { document.body.classList.toggle('is-dragging', !!on); if (this.zone) { this.zone.classList.toggle('armed', on); if (!on) this.zone.classList.remove('hot'); } },
    inside(x, y) {
      if (!this.zone || x < 0) return false;
      const r = this.zone.getBoundingClientRect();
      return x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12;
    },
    hover() { this.zone.classList.toggle('hot', this.inside(pointer.x, pointer.y)); },
    /** Was this drop released over the trash? */
    hit(ev) {
      let x = pointer.x, y = pointer.y;
      const t = ev && (ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0] : ev);
      if (t && t.clientX) { x = t.clientX; y = t.clientY; }
      return this.inside(x, y);
    },
    refreshCount: HB.debounce(async function () {
      try { const r = await HB.api.trash(); T.count.textContent = r.items.length ? r.items.length : ''; } catch (e) { /* offline */ }
    }, 700),

    async open() {
      await S.flush();
      let items = [];
      try { items = (await HB.api.trash()).items; } catch (e) { HB.ui.toast('Could not load the trash', { type: 'error' }); return; }
      const list = h('div', { class: 'trash-list' });
      const days = (S.data.limits && S.data.limits.trash_days) || 30;
      let modal;
      const draw = () => {
        list.replaceChildren();
        if (!items.length) list.append(h('p', { class: 'muted', text: 'The trash is empty.' }));
        items.forEach((it) => {
          const left = Math.max(0, days - Math.floor((Date.now() - new Date(it.deleted_at)) / 86400000));
          const row = h('div', { class: 'trash-row' },
            h('div', { class: 'trash-info' }, h('div', { class: 'trash-label', text: it.label }),
              h('div', { class: 'muted small', text: it.where + ' · deleted ' + HB.fmtDateTime(it.deleted_at) + ' · ' + left + ' d left' })),
            h('button', { class: 'btn small', text: 'Restore', onclick: async () => {
              try { await S.restoreRemote(it.type, it.id); items = items.filter((x) => x !== it); draw(); T.refreshCount(); HB.ui.toast('Restored'); } catch (e) { HB.ui.toast(e.message, { type: 'error' }); }
            } }),
            h('button', { class: 'btn small danger', text: 'Delete forever', onclick: async () => {
              try { await S.purgeRemote([it]); items = items.filter((x) => x !== it); draw(); T.refreshCount(); } catch (e) { HB.ui.toast(e.message, { type: 'error' }); }
            } }));
          list.append(row);
        });
        if (modal) HB.$('.empty-trash', modal.foot).disabled = !items.length;
      };
      modal = HB.ui.modal({
        title: 'Trash', wide: true,
        content: h('div', {}, h('p', { class: 'muted small', text: 'Deleted items stay here for ' + days + ' days, then are removed for good.' }), list),
        actions: [
          { label: 'Empty trash', danger: true, onClick: async () => {
            if (!items.length || !(await HB.ui.confirm({ title: 'Empty the trash?', message: 'This permanently deletes ' + items.length + ' item(s) and their files.', confirm: 'Delete forever', danger: true }))) return;
            try { await S.purgeRemote(items); items = []; draw(); T.refreshCount(); } catch (e) { HB.ui.toast(e.message, { type: 'error' }); }
          } },
          { label: 'Close', primary: true },
        ],
      });
      HB.$$('.modal-foot .btn', modal.el)[0].classList.add('empty-trash');
      draw();
    },
  });
})();
