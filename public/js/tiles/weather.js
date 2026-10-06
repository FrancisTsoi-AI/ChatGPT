(function () {
  const HB = window.HB;
  const h = HB.h;

  const cache = new Map();
  // WMO weather codes (Open-Meteo): [emoji, text]
  function wmo(code, day) {
    if (code === 0) return day === 0 ? ['🌙', 'Clear'] : ['☀️', 'Clear'];
    if (code === 1 || code === 2) return [day === 0 ? '☁️' : '🌤', 'Partly cloudy'];
    if (code === 3) return ['☁️', 'Overcast'];
    if (code === 45 || code === 48) return ['🌫', 'Fog'];
    if (code >= 51 && code <= 57) return ['🌦', 'Drizzle'];
    if (code >= 61 && code <= 67) return ['🌧', 'Rain'];
    if (code >= 71 && code <= 77) return ['❄️', 'Snow'];
    if (code >= 80 && code <= 82) return ['🌦', 'Showers'];
    if (code === 85 || code === 86) return ['🌨', 'Snow showers'];
    if (code >= 95) return ['⛈', 'Thunderstorm'];
    return ['🌡', '—'];
  }

  async function load(place, units) {
    const key = [place.lat, place.lon, units].join();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < 300000) return hit.d;
    const d = await HB.api.call('weather', { query: { lat: place.lat, lon: place.lon, units } });
    cache.set(key, { t: Date.now(), d });
    return d;
  }

  function chooser(ctx, body) {
    const input = h('input', { type: 'text', placeholder: 'Search a city, e.g. Hong Kong', dataset: { key: 'city' }, autocomplete: 'off' });
    const results = h('div', { class: 'places' });
    const search = async () => {
      const q = input.value.trim();
      if (!q) return;
      results.replaceChildren(h('div', { class: 'muted small', text: 'Searching…' }));
      try {
        const r = await HB.api.call('geocode', { query: { q } });
        results.replaceChildren(...(r.results.length ? r.results.map((p) => h('button', { type: 'button', class: 'place',
          text: [p.name, p.region, p.country].filter(Boolean).join(', '),
          onclick: () => HB.setTileSettings(ctx.id, { place: p }, 'weather city') })) : [h('div', { class: 'muted small', text: 'No place found.' })]));
      } catch (e) { results.replaceChildren(h('div', { class: 'form-err', text: e.message })); }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
    body.append(h('div', { class: 'weather-setup' }, h('p', { class: 'muted', text: 'Choose your city.' }),
      h('div', { class: 'add-row' }, input, h('button', { class: 'btn small primary', text: 'Search', onclick: search })), results));
  }

  HB.registerTile('weather', {
    w: 3, h: 4,
    render(body, ctx) {
      const place = ctx.settings.place;
      if (!place) { chooser(ctx, body); return; }
      const units = ctx.settings.units === 'f' ? 'f' : 'c';
      const box = h('div', { class: 'weather' }, h('div', { class: 'muted small', text: 'Loading ' + place.name + '…' }));
      body.append(box);
      const paint = async () => {
        try {
          const d = await load(place, units);
          if (!box.isConnected) return;
          const c = d.current;
          const [icon, text] = wmo(c.weather_code, c.is_day);
          const deg = (n) => Math.round(n) + '°';
          const days = d.daily && d.daily.time ? d.daily.time.slice(1, 6) : [];
          box.replaceChildren(
            h('div', { class: 'wx-place', text: place.name + (place.country ? ', ' + place.country : '') }),
            h('div', { class: 'wx-now' }, h('span', { class: 'wx-icon', text: icon }), h('span', { class: 'wx-temp', text: deg(c.temperature_2m) + (units === 'f' ? 'F' : 'C') })),
            h('div', { class: 'wx-text', text: text }),
            h('div', { class: 'wx-meta muted small', text: 'Feels ' + deg(c.apparent_temperature) + ' · Humidity ' + Math.round(c.relative_humidity_2m) + '% · Wind ' + Math.round(c.wind_speed_10m) + ' km/h' }),
            h('div', { class: 'wx-days' }, days.map((day, i) => {
              const k = i + 1;
              const [ic] = wmo(d.daily.weather_code[k], 1);
              return h('div', { class: 'wx-day', title: wmo(d.daily.weather_code[k], 1)[1] },
                h('div', { class: 'muted small', text: new Date(day + 'T12:00:00').toLocaleDateString([], { weekday: 'short' }) }),
                h('div', { class: 'wx-dicon', text: ic }),
                h('div', { class: 'small', text: deg(d.daily.temperature_2m_max[k]) + ' / ' + deg(d.daily.temperature_2m_min[k]) }),
                h('div', { class: 'muted small', text: d.daily.precipitation_probability_max && d.daily.precipitation_probability_max[k] != null ? '💧' + d.daily.precipitation_probability_max[k] + '%' : '' }));
            })));
        } catch (e) {
          if (box.isConnected) box.replaceChildren(h('div', { class: 'form-err', text: 'Weather unavailable: ' + e.message }), h('button', { class: 'btn small', text: 'Retry', onclick: () => { cache.clear(); HB.board.reconcile(true); } }));
        }
      };
      paint();
      const iv = setInterval(() => { if (document.visibilityState === 'visible') { cache.clear(); paint(); } }, 1800000);
      HB.onCleanup(body, () => clearInterval(iv));
    },
    menu(tile, ctx) {
      return [
        { label: 'Change city…', onClick: () => HB.setTileSettings(ctx.id, { place: null }, 'weather city') },
        { label: 'Use Fahrenheit', checked: ctx.settings.units === 'f', onClick: () => HB.setTileSettings(ctx.id, { units: ctx.settings.units === 'f' ? 'c' : 'f' }, 'weather units') },
        { label: 'Refresh', onClick: () => { cache.clear(); HB.board.reconcile(true); } },
      ];
    },
  });
})();
