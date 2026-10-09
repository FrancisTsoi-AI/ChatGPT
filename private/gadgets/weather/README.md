# ⛅ Weather (`weather`)

Shows the current weather and a 5-day forecast for one city, from Open-Meteo (free, no API key).
A new tile asks for a city: type a name, press Enter or **Search**, then click one of the matches.
The ⋯ menu has **Change city…**, **Use Fahrenheit** (a toggle) and **Refresh**.

## Files
- `manifest.json` – size 3×4, group "Web", order 170, shareActions `["weather"]` (visitors may not geocode).
- `gadget.js` – the class plus module helpers. It overrides no `sig`, `keep`, `destroy` or `static defaults`.
  - `wmo(code, day)` – WMO weather code → `[emoji, text]` (a moon for a clear night).
  - `load(place, units)` – calls `g/weather/weather`. Page-wide `cache` Map: 5 min per lat / lon / units.
  - `chooser(ctx, body)` – the city search (`g/weather/geocode`) and its result buttons. A click saves `place`.
  - `render(body, ctx)` – the chooser if there is no `place`. Otherwise: place name, icon, temperature, condition, "Feels · Humidity · Wind km/h", and 5 day cards (weekday, icon, max / min, 💧 rain chance).
    On error it shows the message and **Retry**. It clears the cache and repaints every 30 min while the page is visible (`setInterval`, stopped via `HB.onCleanup`).
  - `menu(tile, ctx)` – Change city… (sets `place` to null, so the chooser shows), Use Fahrenheit, Refresh (clears the cache and redraws).
- `gadget.css` – `.weather` and the `.wx-*` parts (place, now, icon, temp, text, days), plus `.places` / `.place` for search results.
- `server.php` – server actions `geocode` and `weather`.

## Data
- **Tile settings** (`this.settings`; written with `HB.setTileSettings(ctx.id, …)`, like `this.save(patch)`). `ctx.id` is the content owner, so a mirror tile shows the original's city.
  - `place` – `{name, region, country, lat, lon}` from the geocoder; lat / lon rounded to 3 decimals (none → chooser).
  - `units` – `c` or `f` (`c`). Only temperatures change; wind is always shown in km/h.
- **Rows**: none.

## Server actions
- `g/weather/geocode?q=` – Open-Meteo geocoding (`HB_OPENMETEO_GEOCODE` in `.env` overrides the address). The query is cut to 80 chars; up to 6 results, in English. Not cached. Refused (403) for share visitors.
- `g/weather/weather?lat=&lon=&units=` – Open-Meteo forecast (`HB_OPENMETEO_FORECAST` overrides the address) with `timezone=auto` and 6 days.
  Asks for `current` (temperature, feels-like, humidity, weather code, wind, is_day) and `daily` (weather code, max, min, rain probability). Returns `{current, daily, units, fetched}`.
  Cached 10 min in `storage/cache` per lat / lon (2 decimals) and unit. Bad coordinates → 400.
- Both go out through `hb_fetch` (public addresses only).
- A share visitor may only ask for coordinates within 0.001° of a shared weather tile's `place` (`hb_share_allows_setting`). Anything else is 403.

## On a share page
- The forecast shows as for the owner (same city and units).
- A tile with no city shows only "Choose your city.": the search row is hidden (`.readonly .add-row`), and `geocode` is refused anyway.
- The ⋯ menu only offers Enlarge / Restore, so city and units cannot be changed.

## Ideas for upgrades
- Wind in mph with Fahrenheit: send `wind_speed_unit=mph` in `hb_weather()` when `units` is `f`, and change the "km/h" label in `render()`.
- Show when the data was fetched: the server already returns `fetched`; add "updated HH:MM" to `.wx-meta`.
- Show `place.region` next to the name in `.wx-place` (it is saved but not shown).
- An hourly strip: add `hourly=temperature_2m,weather_code` to the query in `hb_weather()` and draw the next 12 hours in `render()`.
