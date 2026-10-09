(function () {
  const HB = window.HB;

  HB.gadgets.define('files', class extends HB.Gadget {
    render(body, ctx) { HB.fileTileRender(body, ctx, { folders: true }); }
    menu(tile, ctx) {
      const grid = ctx.settings.view === 'grid';
      return [
        { label: 'Upload files…', onClick: () => { const i = document.querySelector('.tile[data-tile="' + tile.id + '"] input[type=file]'); if (i) i.click(); } },
        { label: 'Thumbnail view', checked: grid, onClick: () => HB.setTileSettings(ctx.id, { view: grid ? 'list' : 'grid' }) },
      ];
    }
  });
})();
