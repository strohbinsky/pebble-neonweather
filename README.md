# Neonweather — watchface for Pebble Time 2

Today's weather without a single word: rain and air pressure as a neon graphic behind big, chunky digits.
One glance tells you whether to grab an umbrella — and when.

Made by **Seb & Claude** (Anthropic): ideas, design and testing by Seb, code and docs by Claude.

> **Status: beta, version 0.27.0.** Tested in the emery emulator, with a pixel-exact preview on the Mac and Node tests —
> not yet proven in daily use. Version numbers start with 0 until it has.

<p>
  <img src="docs/images/preset-retro.png" width="200" alt="Retro, April showers">
  <img src="docs/images/retro-autumn.png" width="200" alt="Retro after a rainy morning">
  <img src="docs/images/retro-thunder.png" width="200" alt="Retro on a thundery afternoon">
  <img src="docs/images/retro-frost.png" width="200" alt="Retro on a frosty day">
</p>

*Meet **Retro**, Seb's own look and the newest stock preset: April showers at noon · after a rainy morning ·
33 °C and a thunderstorm at four · a frosty −6 to 1 °C. All pictures: real watch code, made-up weather.*

## Contents

- [How to read it](#how-to-read-it)
- [Any weather](#any-weather)
- [Stock presets](#stock-presets)
- [Make it yours](#make-it-yours)
- [Settings](#settings)
- [Install](#install)
- [Under the hood](#under-the-hood)
- [Building](#building)

## How to read it

<img src="docs/images/weather-april.png" width="200" align="right" alt="April showers">

- **Digits:** date (day, month), the time in its bar, today's low and high. Below zero gets a minus: `-6`
- **Columns:** one per hour, 04:00 on the left, 20:00 on the right
- **Blue:** rain in that hour. Reaches the time bar? That's 1 mm/h — umbrella time
- **Pink dashes:** air pressure, one per hour, 985 hPa at the bottom, 1040 hPa at the top. Dashes going down, weather going down
- **Dotted line:** now. It walks through the day from left to right

Everything is optional, every color is yours (all 64 the Pebble has), and there's a separate look for the night.

<br clear="right">

## Any weather

The default look on six different days:

<p>
  <img src="docs/images/weather-autumn.png" width="200" alt="Autumn front">
  <img src="docs/images/weather-frost.png" width="200" alt="Frosty high">
  <img src="docs/images/weather-thunder.png" width="200" alt="Summer thunderstorm">
</p>
<p>
  <img src="docs/images/weather-gale.png" width="200" alt="Gale">
  <img src="docs/images/weather-april.png" width="200" alt="April showers">
  <img src="docs/images/weather-night.png" width="200" alt="Drizzly evening">
</p>

*Autumn front, pressure climbing · frosty high, −6 to 1 °C · 33 °C and a thunderstorm at four ·
a gale with pressure in free fall · April showers · a drizzly winter evening.*

## Stock presets

Nine looks built in. Load one for the day, for the night, or both.

<p>
  <img src="docs/images/preset-neon.png" width="200" alt="Neon">
  <img src="docs/images/preset-neon-night.png" width="200" alt="Neon Night">
  <img src="docs/images/preset-paper.png" width="200" alt="Paper">
  <img src="docs/images/preset-paper-night.png" width="200" alt="Paper Night">
</p>
<p>
  <img src="docs/images/preset-sundial.png" width="200" alt="Sundial">
  <img src="docs/images/preset-terminal.png" width="200" alt="Terminal">
  <img src="docs/images/preset-minimal.png" width="200" alt="Minimal">
</p>
<p>
  <img src="docs/images/preset-retro.png" width="200" alt="Retro">
  <img src="docs/images/preset-retro-night.png" width="200" alt="Retro Night">
</p>

| Preset | The idea |
| --- | --- |
| **Neon** | The default, turned up: sunrise on top, sunset at the bottom, a smooth pressure line. Dims to purple at night |
| **Paper** | Black on white like a printout, blue low, red high. Turns itself inside out at night |
| **Sundial** | The sky as background — night, a twilight gradient, day — with the time lines as a framed cross |
| **Terminal** | Green phosphor, all the way. Rows rearranged: high and low on top, sunrise and sunset below |
| **Minimal** | As little as it gets: no columns, no pressure, rain as a thin strip at the bottom |
| **Retro** | Seb's own: red and blue digits on a sunny orange sky, a fat 10 px cross for *now*, rain in bright full columns. At night it calms down — white digits, no sky, no rain |

*Neon Night, Paper Night and Retro Night are the night looks on their own, to put on any day you like.*

## Make it yours

### Five rows, eight blocks

The time sits in the middle. Rows 2 and 4 are always there, rows 1 and 5 are optional. Each row has two blocks,
and each block shows what you pick: day, month, low, high, sunrise or sunset (hour, minute), temperature now,
a temperature curve, a pressure curve, the pressure trend — or two symbols. Bars and colors belong to the position,
so swapping contents never messes up the look.

<p>
  <img src="docs/images/feature-rows.png" width="200" alt="Rows 1 and 5">
  <img src="docs/images/feature-curves.png" width="200" alt="Curves">
  <img src="docs/images/feature-symbols.png" width="200" alt="Symbols">
</p>

*Sunrise and sunset in rows 1 and 5 · temperature now, the day's temperature curve, pressure curve and a falling
arrow with −5 hPa · thunder warning, umbrella, clouds right now, half moon, pressure falling by 3 hPa.*

### Smart symbols

They only turn up when there's a reason — and leave the cell empty when there isn't.

| Symbol | Shows up when |
| --- | --- |
| Umbrella | rain or thunder this hour or in the next two |
| Warning | thunder or gusts from 65 km/h in the next 3 hours, frost in the next 12 (lightning, windsock, snowflake) |
| Weather now | sun or moon, clouds, fog, rain, snow, lightning — for the current hour |
| Moon phase | always; eight phases, worked out on the watch |
| Pressure trend | always; flat, slanted or steep, from the last 3 hours (optionally with the hPa) |
| Stale data | the last update is more than 3 hours old |

Or pick any of the 24 symbols to stay put:

<p>
  <img src="docs/images/symbols-1.png" width="200" alt="Symbols 1">
  <img src="docs/images/symbols-2.png" width="200" alt="Symbols 2">
  <img src="docs/images/feature-stale.png" width="200" alt="Stale data">
</p>

*All 24 symbols, four per row · no fresh data for a while: the crossed-out cloud.*

### Rain

<p>
  <img src="docs/images/rain-fixed.png" width="200" alt="Fixed scale">
  <img src="docs/images/rain-relative.png" width="200" alt="Daily max">
  <img src="docs/images/rain-bottom.png" width="200" alt="Bottom strip">
  <img src="docs/images/rain-full-columns.png" width="200" alt="Full columns">
</p>

*Fixed scale (1 mm/h reaches the time bar) · daily max = full height · a slim strip at the bottom · full columns,
whatever the amount. A threshold keeps a few drops from filling a column.*

### Pressure, time lines, sun

<p>
  <img src="docs/images/pressure-bottom-line.png" width="200" alt="Pressure line at the bottom">
  <img src="docs/images/lines-cross.png" width="200" alt="Time lines">
  <img src="docs/images/sun-position.png" width="200" alt="Sun position">
  <img src="docs/images/sun-stripes.png" width="200" alt="Sun stripes">
</p>

*Pressure as a thick line at the bottom · two time lines, up to 20 px, with a shared frame · the sun position as background ·
just two stripes at sunrise and sunset.*

The horizontal lines read the day **top to bottom**: midnight at the top, sunrise above sunset — right where the
sunrise digits in row 1 and the sunset digits in row 5 sit.

### Night mode

From sunset to sunrise a night theme takes over. It starts as a copy of the day and only keeps what you change —
dim the digits, swap the colors, show the moon instead of the date.

## Settings

Pebble app → Neonweather → settings. A live preview on top, then English or German, day and night, eight sections.

<p>
  <img src="docs/images/settings-top.png" width="260" alt="Settings">
  <img src="docs/images/settings-rows.png" width="260" alt="Rows and content">
  <img src="docs/images/settings-sun.png" width="260" alt="Sun position">
</p>
<p>
  <img src="docs/images/settings-presets.png" width="260" alt="Presets">
  <img src="docs/images/settings-german.png" width="260" alt="German">
</p>

### Share a preset

Found a look you love? Presets → **Share** → **Copy**, and send the code to a friend. They paste it under **Import** —
done. Up to 20 presets of your own, each with its day and night.

## Install

1. Download `neonweather.pbw` from the [releases](../../releases)
2. Open it on your phone with the Pebble app — it installs on the watch
3. Allow location when asked: the weather is for where you are

Pebble Time 2 (emery) only.

## Under the hood

- Weather from [Open-Meteo](https://open-meteo.com), no account, no key: hourly rain, pressure, temperature, weather code
  and gusts, plus the day's low, high, sunrise and sunset. Twilight (sun at −6°) is worked out on the phone
- The watch asks at most once an hour. No network: again in 15 minutes. No phone: not at all — reconnecting asks right away
- Today and tomorrow go to the watch in one 184-byte packet and stay there, so the night after midnight still has its weather
- No text on the watch, so no language either. The settings page speaks English and German

## Building

Pebble SDK 4.x (`pebble` tool), Node.js for the tests. The comments are English; names in the code are German —
it started out as a private project.

```bash
tools/bauen.sh                      # build outside the source folder → dist/neonweather.pbw
tools/bauen.sh emu                  # build + emery emulator
node tools/test/logik_test.js       # weather packet, sun and twilight, colors, presets
node tools/test/seite_test.js       # settings page: sections, night, presets, sharing, German
tools/vorschau/rendern.sh out.png   # render main.c on the Mac, no SDK needed
python3 tools/screenshots.py docs/images   # every picture in this README
```

## Data and credits

- Weather: [Open-Meteo](https://open-meteo.com), CC BY 4.0. The test uses one saved response
- The weather in the screenshots is made up

## License

MIT, see [LICENSE](LICENSE).
