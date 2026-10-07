(function () {
  const HB = window.HB;
  const S = HB.store;

  /**
   * HB.Gadget: the base class every gadget extends. One instance per tile on screen.
   * Full contract: docs/GADGET_API.md. In short —
   *   override  render(body, ctx)   draw the tile body (required)
   *             menu(tile, ctx)     extra items for the tile's ⋯ menu (array, optional)
   *             sig(ctx)            what should trigger a redraw (undefined = everything the tile owns)
   *             keep(ctx)           return true to skip a redraw (user is typing / drawing)
   *             destroy()           the tile left the screen: stop timers, players, listeners
   *             static defaults()   settings for a brand-new tile of this type
   *   use       this.tile, this.ctx, this.id (content-owner id), this.settings, this.meta,
   *             this.save(patch, label), this.items(type), this.entries(kind), this.addEntry(kind, data),
   *             this.call(action, query, opts) (the gadget's own server actions), this.redraw()
   */
  class Gadget {
    constructor(tileId, type) { this.tileId = tileId; this.type = type; }
    get meta() { return HB.gadgets.meta(this.type); }
    get tile() { return S.get('tiles', this.tileId); }
    get ctx() { const t = this.tile; return t ? HB.tileCtx(t) : null; }
    get id() { const c = this.ctx; return c ? c.id : null; }
    get settings() { const c = this.ctx; return c ? c.settings : {}; }
    get readOnly() { return !!HB.readOnly; }
    save(patch, label) { HB.setTileSettings(this.id, patch, label); }
    items(type) { return this.id ? S.itemsOf(type, this.id) : []; }
    entries(kind) { return this.id ? S.entriesOf(this.id, kind) : []; }
    addEntry(kind, data) { return HB.safeCreate('entries', Object.assign({ tile_id: this.id, kind }, data), 'add'); }
    call(action, query, opts) { return HB.api.gadget(this.type, action, query, opts); }
    redraw() { HB.board.redrawTile(this.tileId); }
    render(body) { body.textContent = ''; }
    menu() { return []; }
    sig() { return undefined; }
    keep() { return false; }
    destroy() {}
    static defaults() { return {}; }
  }
  HB.Gadget = Gadget;

  const GROUPS = ['Everyday', 'Writing', 'Study', 'Focus', 'Web', 'Files & media'];
  const classes = {}, metas = {}, live = new Map();
  HB.typeInfo = {}; // label / icon / hint / group per type, filled from the manifests

  HB.gadgets = {
    groups: GROUPS,
    /** Called by the asset bundle with each gadget folder's manifest.json, before its code. */
    addManifest(m) {
      metas[m.type] = m;
      HB.typeInfo[m.type] = { label: m.label, icon: m.icon, hint: m.hint || '', group: m.group || 'Other', order: m.order || 999 };
    },
    define(type, Cls) {
      if (!(Cls.prototype instanceof Gadget)) throw new Error('Gadget "' + type + '" must extend HB.Gadget');
      classes[type] = Cls;
    },
    has: (type) => !!classes[type],
    meta: (type) => metas[type] || { type, label: type, icon: '▫', size: { w: 4, h: 4 } },
    size: (type) => (metas[type] && metas[type].size) || { w: 4, h: 4 },
    defaults: (type) => (classes[type] ? classes[type].defaults() : {}),
    /** Types in "+ Tile" menu order: by group, then the manifest's `order`. */
    types() {
      const g = (t) => { const i = GROUPS.indexOf(HB.typeInfo[t].group); return i < 0 ? GROUPS.length : i; };
      return Object.keys(HB.typeInfo).filter((t) => classes[t])
        .sort((a, b) => g(a) - g(b) || HB.typeInfo[a].order - HB.typeInfo[b].order);
    },
    /** The live instance for a tile (created on first use, replaced if the tile's type changed). */
    instance(tile) {
      let g = live.get(tile.id);
      if (g && g.type === tile.type) return g;
      if (g) this.drop(tile.id);
      const C = classes[tile.type];
      if (!C) return null;
      g = new C(tile.id, tile.type);
      live.set(tile.id, g);
      return g;
    },
    drop(tileId) {
      const g = live.get(tileId);
      if (!g) return;
      live.delete(tileId);
      try { g.destroy(); } catch (e) { console.error(e); }
    },
    dropAll() { Array.from(live.keys()).forEach((id) => this.drop(id)); },
  };

  /** Older object-style gadgets keep working: HB.registerTile(type, { render, menu, sig, keep, destroy }). */
  HB.registerTile = (type, def) => {
    const C = class extends Gadget {};
    ['render', 'menu', 'sig', 'keep', 'destroy'].forEach((k) => { if (typeof def[k] === 'function') C.prototype[k] = def[k]; });
    HB.gadgets.define(type, C);
  };
})();
