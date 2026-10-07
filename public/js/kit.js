(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  // Core helpers every gadget can use. The gadget registry and base class live in js/gadget.js.

  /** Everything a renderer needs: `tile` is the displayed tile, `src` the tile that owns the content. */
  HB.tileCtx = function (tile) {
    const src = S.contentTile(tile);
    return {
      tile, src, id: src ? src.id : null, settings: src ? src.settings || {} : {},
      shared: !!(tile.settings && tile.settings.shared_from),
      items: (type) => (src ? S.itemsOf(type, src.id) : []),
    };
  };

  /** Fingerprint of what a tile body shows; the body is rebuilt only when this changes. */
  HB.tileSig = function (tile) {
    const src = S.contentTile(tile);
    if (!src) return 'missing';
    const g = HB.gadgets.instance(tile);
    const own = g ? g.sig(HB.tileCtx(tile)) : undefined; // a gadget may narrow what triggers a redraw
    if (own !== undefined) return JSON.stringify([tile.type, own]);
    return JSON.stringify([tile.type, src.settings, tile.settings && tile.settings.shared_from,
      S.itemsOf('links', src.id), S.itemsOf('tasks', src.id), S.itemsOf('files', src.id), S.itemsOf('thoughts', src.id), S.itemsOf('entries', src.id)]);
  };

  /** Create an entry row in the tile that owns the content. */
  HB.createEntry = (ctx, kind, data) => HB.safeCreate('entries', Object.assign({ tile_id: ctx.id, kind }, data), 'add');

  /** Register timers/cleanups on a tile body; they run when the body is rebuilt or the tile removed. */
  HB.onCleanup = (body, fn) => { (body._cleanups = body._cleanups || []).push(fn); };
  HB.runCleanups = (body) => {
    (body._cleanups || []).forEach((f) => { try { f(); } catch (e) { console.error(e); } });
    body._cleanups = [];
  };

  /**
   * Sortable list wired for drag between lists, trash drop and touch.
   * o = { group, handle, draggable, filter, onDrop(evt), onTrash(item), put(to, from, item) }
   */
  HB.sortable = function (body, el, o) {
    if (HB.readOnly) return null; // nothing moves on a share page
    const s = Sortable.create(el, {
      group: { name: o.group, pull: true, put: o.put || true },
      animation: 150,
      sort: o.sort !== false,
      dragoverBubble: true, // lists nest inside the phone tile list; let drag-over reach the outer one
      draggable: o.draggable || '[data-id]',
      handle: o.handle || null,
      filter: o.filter || 'input,textarea,button,select,.no-drag',
      preventOnFilter: false,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 4,
      delay: 120,
      delayOnTouchOnly: true,
      touchStartThreshold: 6,
      ghostClass: 'drag-ghost',
      chosenClass: 'drag-chosen',
      onStart() { HB.drag.active++; HB.trash.dragging(true); },
      onEnd(evt) {
        HB.drag.active = Math.max(0, HB.drag.active - 1);
        HB.drag.endedAt = Date.now();
        HB.trash.dragging(false);
        if (HB.trash.hit(evt.originalEvent)) { o.onTrash(evt.item); HB.board.reconcile(true); return; }
        o.onDrop(evt);
        HB.board.reconcile(true);
      },
    });
    (body._cleanups = body._cleanups || []).push(() => s.destroy());
    return s;
  };

  /**
   * Standard drop handler for item lists: re-numbers positions in the target (and source) list
   * and re-parents the item when it moved to another tile/bucket. `parentOf(container)` returns
   * the fields to set on a moved item, e.g. {tile_id, bucket}.
   */
  HB.listDrop = function (type, evt, parentOf, accept) {
    const id = Number(evt.item.dataset.id);
    const idsOf = (c) => Array.from(c.children).filter((n) => n.dataset && n.dataset.id).map((n) => Number(n.dataset.id));
    const moved = evt.from !== evt.to;
    if (moved && accept && !accept(evt)) { return; }
    HB.history.run('move', () => {
      S.reorder(type, idsOf(evt.to), moved ? { [id]: parentOf(evt.to) } : null);
      if (moved) S.reorder(type, idsOf(evt.from));
    });
  };

  /** Swallow the click that Sortable's drag would otherwise leave on a link. */
  HB.justDragged = () => Date.now() - HB.drag.endedAt < 250;

  /** Colour + tags dialog for any item row (opts.noColour for tables without a colour column). */
  HB.editMeta = async function (type, row, opts) {
    opts = opts || {};
    const fields = [];
    if (opts.fields) fields.push(...opts.fields);
    if (!opts.noColour) fields.push({ name: 'colour', label: 'Colour label', type: 'color', value: row.colour || '' });
    fields.push({ name: 'tags', label: 'Tags', value: row.tags || '', placeholder: 'comma, separated', hint: 'Searchable with Ctrl+K' });
    const v = await HB.ui.form({ title: opts.title || 'Edit', fields });
    if (!v) return;
    const patch = Object.assign({}, v, { tags: HB.tagsToString(HB.parseTags(v.tags)) });
    S.update(type, row.id, patch, { label: 'edit' });
  };

  HB.tagChips = function (row) {
    const tags = HB.parseTags(row.tags);
    if (!tags.length) return null;
    return h('span', { class: 'chips' }, tags.map((t) => h('button', {
      type: 'button', class: 'chip', text: '#' + t, title: 'Search #' + t,
      onclick: (e) => { e.stopPropagation(); HB.search.open('#' + t); },
    })));
  };

  /** Shown inside a mirror tile whose original was deleted. */
  HB.missingSource = function (body, tile) {
    body.append(h('div', { class: 'empty' }, h('p', { text: 'The original tile was deleted.' }),
      h('button', { class: 'btn', text: 'Remove this tile', onclick: () => S.remove('tiles', tile.id) })));
  };

  /** Small "+ Add" inline form used by tiles: returns an element. */
  HB.addRow = function (opt) {
    if (HB.readOnly) return h('span', { hidden: true });
    const input = h('input', { type: 'text', placeholder: opt.placeholder, maxlength: opt.max || 1000, autocomplete: 'off', dataset: { key: opt.key || 'add' } });
    const row = h('form', { class: 'add-row', onsubmit: (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      input.value = '';
      opt.onAdd(v);
    } }, input, h('button', { class: 'btn small', type: 'submit', text: opt.button || 'Add' }));
    return row;
  };

  /** "Move to tile ▸" menu children: other non-shared tiles of the given types in this scenario. */
  HB.moveTargets = function (type, row, tileTypes, extraFor) {
    return S.tilesOf(HB.board.scenarioId)
      .filter((t) => tileTypes.includes(t.type) && !(t.settings && t.settings.shared_from) && t.id !== row.tile_id)
      .map((t) => ({
        label: t.title || HB.typeInfo[t.type].label,
        onClick: () => S.update(type, row.id, Object.assign({ tile_id: t.id }, extraFor ? extraFor(t) : {}), { label: 'move' }),
      }));
  };

  /** Update one tile's settings object (merge) with undo. */
  HB.setTileSettings = function (tileId, patch, label) {
    const t = S.get('tiles', tileId);
    if (t) S.update('tiles', tileId, { settings: Object.assign({}, t.settings, patch) }, { label: label || 'tile settings' });
  };

  HB.safeCreate = async function (type, data, label) {
    try { return await S.create(type, data, { label }); } catch (e) {
      if (HB.readOnly) return null;
      HB.ui.toast(e.status === 0 ? 'Offline: could not add. Try again when you are back online.' : 'Could not add: ' + e.message, { type: 'error' });
      return null;
    }
  };
})();
