(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  function bucketsOf(settings) {
    const b = Array.isArray(settings.buckets) && settings.buckets.length ? settings.buckets.slice() : HB.defaultBuckets();
    if (!b.some((x) => x.id === 'none')) b.push({ id: 'none', name: 'No category' });
    return b;
  }

  function taskEl(t, ctx, buckets) {
    const text = h('span', { class: 'task-text', text: t.text, title: 'Click to edit' });
    const el = h('div', {
      class: 'task' + (t.done_at ? ' done' : ''), dataset: { id: t.id, color: t.colour || '' },
      oncontextmenu: (e) => { e.preventDefault(); HB.ui.menu(e.clientX, e.clientY, menu(t, ctx, buckets)); },
    },
    h('input', { type: 'checkbox', class: 'task-check', checked: !!t.done_at, 'aria-label': 'Done',
      onchange: (e) => S.update('tasks', t.id, { done_at: e.target.checked ? new Date().toISOString() : null }, { label: e.target.checked ? 'tick task' : 'untick task' }) }),
    text, HB.tagChips(t),
    h('button', { class: 'x', title: 'Delete', 'aria-label': 'Delete task', text: '×', onclick: () => S.remove('tasks', t.id, { label: 'delete task' }) }));
    text.addEventListener('click', () => {
      if (HB.justDragged()) return;
      HB.ui.inlineEdit(text, { value: t.text, max: 1000, multiline: false, onSave: (v) => saveText(t, v), onCancel: () => HB.board.reconcile(true) });
    });
    return el;
  }

  function saveText(t, v) {
    const tags = HB.tagsToString([...HB.parseTags(t.tags), ...HB.hashtags(v)]);
    S.update('tasks', t.id, { text: v, tags }, { label: 'edit task' });
  }

  function menu(t, ctx, buckets) {
    const items = [
      { label: 'Edit text', onClick: () => { const el = document.querySelector('.task[data-id="' + t.id + '"] .task-text'); if (el) el.click(); } },
      { label: 'Colour & tags…', onClick: () => HB.editMeta('tasks', t, { title: 'Task colour and tags' }) },
      { label: 'Move to bucket', children: buckets.filter((b) => b.id !== t.bucket).map((b) => ({
        label: b.name, onClick: () => S.update('tasks', t.id, { bucket: b.id, position: 9999 }, { label: 'move task' }),
      })) },
    ];
    const to = HB.moveTargets('tasks', t, ['todo'], () => ({ bucket: 'none' }));
    if (to.length) items.push({ label: 'Move to tile', children: to });
    items.push({ sep: true }, { label: 'Delete', danger: true, onClick: () => S.remove('tasks', t.id, { label: 'delete task' }) });
    return items;
  }

  function saveBuckets(ctx, buckets, label) {
    HB.setTileSettings(ctx.id, { buckets }, label);
  }

  async function renameBucket(ctx, buckets, b) {
    const v = await HB.ui.form({ title: 'Rename bucket', fields: [{ name: 'name', label: 'Name', value: b.name, required: true, max: 40 }] });
    if (v) saveBuckets(ctx, buckets.map((x) => (x.id === b.id ? { id: x.id, name: v.name } : x)), 'rename bucket');
  }

  function deleteBucket(ctx, buckets, b) {
    HB.history.run('delete bucket', () => {
      S.itemsOf('tasks', ctx.id).filter((t) => t.bucket === b.id).forEach((t) => S.update('tasks', t.id, { bucket: 'none' }));
      saveBuckets(ctx, buckets.filter((x) => x.id !== b.id), 'delete bucket');
    });
  }

  async function addBucket(ctx, buckets) {
    const v = await HB.ui.form({ title: 'New bucket', fields: [{ name: 'name', label: 'Name', required: true, max: 40 }] });
    if (!v) return;
    const id = 'b' + Math.random().toString(36).slice(2, 8);
    const arr = buckets.slice();
    const noneAt = arr.findIndex((x) => x.id === 'none');
    arr.splice(noneAt < 0 ? arr.length : noneAt, 0, { id, name: v.name });
    saveBuckets(ctx, arr, 'add bucket');
  }

  HB.registerTile('todo', {
    w: 6, h: 6,
    render(body, ctx) {
      const buckets = bucketsOf(ctx.settings);
      const known = new Set(buckets.map((b) => b.id));
      const tasks = ctx.items('tasks');
      const wrap = h('div', { class: 'buckets' });
      buckets.forEach((b) => {
        const mine = tasks.filter((t) => t.bucket === b.id || (b.id === 'none' && !known.has(t.bucket)));
        const open = mine.filter((t) => !t.done_at).length;
        const list = h('div', { class: 'tasks', dataset: { tile: ctx.id, bucket: b.id } });
        mine.forEach((t) => list.append(taskEl(t, ctx, buckets)));
        const bmenu = h('button', { class: 'tile-btn small', text: '⋯', title: 'Bucket menu', 'aria-label': 'Bucket menu',
          onclick: () => HB.ui.menuAt(bmenu, [
            { label: 'Rename bucket…', onClick: () => renameBucket(ctx, buckets, b) },
            { label: 'Delete bucket', danger: true, disabled: b.id === 'none', onClick: () => deleteBucket(ctx, buckets, b) },
          ]) });
        const col = h('section', { class: 'bucket', dataset: { bucket: b.id } },
          h('header', { class: 'bucket-head' }, h('span', { class: 'bucket-name', text: b.name }), h('span', { class: 'count', text: open || '' }), bmenu),
          list,
          HB.addRow({ placeholder: 'Add task…', key: 'task-' + b.id, onAdd: (text) =>
            HB.safeCreate('tasks', { tile_id: ctx.id, bucket: b.id, text, tags: HB.tagsToString(HB.hashtags(text)) }, 'add task') }));
        wrap.append(col);
        HB.sortable(body, list, {
          group: 'tasks',
          onDrop: (evt) => HB.listDrop('tasks', evt, (c) => ({ tile_id: Number(c.dataset.tile), bucket: c.dataset.bucket })),
          onTrash: (item) => S.remove('tasks', Number(item.dataset.id), { label: 'delete task' }),
        });
      });
      body.append(wrap);
    },
    menu(tile, ctx) {
      const buckets = bucketsOf(ctx.settings);
      const done = S.itemsOf('tasks', ctx.id).filter((t) => t.done_at);
      return [
        { label: 'Add bucket…', onClick: () => addBucket(ctx, buckets) },
        { label: 'Clear completed (' + done.length + ')', disabled: !done.length, onClick: () =>
          HB.history.run('clear completed', () => done.forEach((t) => S.remove('tasks', t.id))) },
      ];
    },
  });
})();
