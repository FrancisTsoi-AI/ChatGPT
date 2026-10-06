(function () {
  const HB = window.HB;
  const h = HB.h;

  HB.registerTile('clock', {
    w: 3, h: 2,
    render(body, ctx) {
      const s = ctx.settings;
      const time = h('div', { class: 'clock-time' });
      const date = h('div', { class: 'clock-date' });
      body.append(h('div', { class: 'clock' }, time, date));
      const tick = () => {
        const d = new Date();
        const o = { hour: '2-digit', minute: '2-digit', hour12: !!s.h12 };
        if (s.seconds) o.second = '2-digit';
        time.textContent = d.toLocaleTimeString([], o);
        date.textContent = d.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      };
      tick();
      const iv = setInterval(tick, 1000);
      HB.onCleanup(body, () => clearInterval(iv));
    },
    menu(tile, ctx) {
      return [
        { label: '12-hour clock', checked: !!ctx.settings.h12, onClick: () => HB.setTileSettings(ctx.id, { h12: !ctx.settings.h12 }) },
        { label: 'Show seconds', checked: !!ctx.settings.seconds, onClick: () => HB.setTileSettings(ctx.id, { seconds: !ctx.settings.seconds }) },
      ];
    },
  });
})();
