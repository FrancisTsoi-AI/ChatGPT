(function () {
  const HB = window.HB;

  HB.gadgets.define('files', class extends HB.Gadget {
    render(body, ctx) { HB.fileTileRender(body, ctx, { folders: true }); }
    menu(tile, ctx) {
      const grid = ctx.settings.view === 'grid' && !ctx.settings.tree;
      const tree = !!ctx.settings.tree;
      return [
        { label: 'Upload files…', onClick: () => { const i = document.querySelector('.tile[data-tile="' + tile.id + '"] input[type=file]'); if (i) i.click(); } },
        { label: 'Thumbnail view', checked: grid, onClick: () => HB.setTileSettings(ctx.id, { view: grid ? 'list' : 'grid', tree: false }) },
        { label: 'Tree view (open several folders)', checked: tree, onClick: () => HB.setTileSettings(ctx.id, { tree: !tree }) },
        ...(tree ? [
          { label: 'Expand all folders', onClick: () => HB.fileTree.expandAll(ctx.id, tile.id) },
          { label: 'Collapse all folders', onClick: () => HB.fileTree.collapseAll(ctx.id, tile.id) },
        ] : []),
      ];
    }
  });
})();
