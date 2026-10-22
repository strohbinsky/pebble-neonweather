// Neonweather — the computing part of the phone script, no Pebble dependencies (testable in Node: tools/test/logik_test.js).
// Packet for the watch, 88 bytes: per day (today, tomorrow) 17 × rain of the hours 04–05 … 20–21 h (0.1 mm),
// 17 × pressure at 04 … 20 h (hPa*2-1900),
// low, high (whole degrees, int8), sunrise, sunset, dawn, dusk (local minutes, 2 bytes each). 255, -128, 0xFFFF = missing.
// Since 0.22.0 followed per day by 24 × temperature 00–23 h (int8) and 24 × weather (bits 0–2 kind from wmoArt(), 3–7 gusts / 5 km/h,
// 255 = missing): 184 bytes.
var STUNDEN = 17, ERSTE = 4;

function wetterUrl(lat, lon) {
  return 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(2) + '&longitude=' + lon.toFixed(2) +
    '&hourly=precipitation,pressure_msl,temperature_2m,weather_code,wind_gusts_10m&daily=temperature_2m_min,temperature_2m_max,sunrise,sunset&timezone=auto&forecast_days=3';
}

// date at the weather's location (YYYY-MM-DD), from the response: phone time plus the location's offset
function ortsDatum(j, jetztMs) {
  return new Date(jetztMs + (j.utc_offset_seconds || 0) * 1000).toISOString().substring(0, 10);
}

// sun elevation in degrees (NOAA, simplified) for a local minute; offH = offset to UTC in hours
function sonnenhoehe(lat, lon, offH, y, mo, t, minute) {
  var n = Math.round((Date.UTC(y, mo - 1, t) - Date.UTC(y, 0, 0)) / 86400000);
  var g = 2 * Math.PI / 365 * (n - 1 + (minute / 60 - 12) / 24);
  var eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  var de = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) -
           0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  var ha = ((minute + eq + 4 * lon - 60 * offH) / 4 - 180) * Math.PI / 180, la = lat * Math.PI / 180;
  var cz = Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(ha);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cz))) * 180 / Math.PI;
}
// Civil twilight: first minute with the sun above −6° and the first minute after that below it again; never above = 0xFFFF
function daemmerung(lat, lon, offH, datum) {
  var t = datum.split('-').map(Number), erste = -1, letzte = -1;
  if (typeof lat !== 'number' || typeof lon !== 'number') return [0xFFFF, 0xFFFF];
  for (var m = 0; m < 1440; m++) if (sonnenhoehe(lat, lon, offH, t[0], t[1], t[2], m) >= -6) { if (erste < 0) erste = m; letzte = m; }
  return erste < 0 ? [0xFFFF, 0xFFFF] : [erste, letzte + 1];
}

function ortsMinuten(iso) {                      // "2026-10-21T08:05" → 485
  var m = /T(\d\d):(\d\d)/.exec(iso || '');
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0xFFFF;
}

function zahl(v, f, lo, hi, leer) {
  return (v === null || v === undefined || isNaN(v)) ? leer : Math.max(lo, Math.min(hi, Math.round(f(v))));
}

function wetterPaket(j, jetztMs) {
  var heute = ortsDatum(j, jetztMs), t0 = j.daily.time.indexOf(heute), b = [], d, h, i, datum;
  if (t0 < 0) throw new Error('Tag ' + heute + ' fehlt in der Antwort');
  for (d = 0; d < 2; d++) {
    datum = j.daily.time[t0 + d];
    var regen = [], druck = [];
    for (h = ERSTE; h < ERSTE + STUNDEN; h++) {
      i = datum ? j.hourly.time.indexOf(datum + 'T' + (h < 10 ? '0' : '') + h + ':00') : -1;   // look up each hour: DST change days
      // Open-Meteo rain is the sum of the PREVIOUS hour: column h (h to h+1) = value at h+1
      var ir = datum ? j.hourly.time.indexOf(datum + 'T' + (h + 1 < 10 ? '0' : '') + (h + 1) + ':00') : -1;
      regen.push(ir < 0 ? 255 : zahl(j.hourly.precipitation[ir], function (v) { return v * 10; }, 0, 254, 255));
      druck.push(i < 0 ? 255 : zahl(j.hourly.pressure_msl[i], function (v) { return v * 2 - 1900; }, 0, 254, 255));
    }
    var tmin = datum ? zahl(j.daily.temperature_2m_min[t0 + d], Number, -127, 127, -128) : -128;
    var tmax = datum ? zahl(j.daily.temperature_2m_max[t0 + d], Number, -127, 127, -128) : -128;
    // sun as local minutes (2 bytes each): sunrise, sunset (Open-Meteo), dawn, dusk (computed), 0xFFFF = missing
    var dm = datum ? daemmerung(j.latitude, j.longitude, (j.utc_offset_seconds || 0) / 3600, datum) : [0xFFFF, 0xFFFF], sonne = [];
    [datum && j.daily.sunrise ? ortsMinuten(j.daily.sunrise[t0 + d]) : 0xFFFF, datum && j.daily.sunset ? ortsMinuten(j.daily.sunset[t0 + d]) : 0xFFFF,
     dm[0], dm[1]].forEach(function (v) { sonne.push(v & 255, v >> 8); });
    b = b.concat(regen, druck, [tmin & 255, tmax & 255], sonne);
  }
  for (d = 0; d < 2; d++) {                        // hourly values 00–23 h (since 0.22.0)
    datum = j.daily.time[t0 + d];
    var temp = [], wetter = [], hh = j.hourly;
    for (h = 0; h < 24; h++) {
      i = datum ? hh.time.indexOf(datum + 'T' + (h < 10 ? '0' : '') + h + ':00') : -1;
      temp.push(i < 0 || !hh.temperature_2m ? 128 : zahl(hh.temperature_2m[i], Number, -127, 127, -128) & 255);
      var code = i < 0 || !hh.weather_code ? null : hh.weather_code[i];
      // gust: maximum of the previous hour — so for the hour h to h+1 the value at h+1
      var boe = i < 0 || !hh.wind_gusts_10m ? null : hh.wind_gusts_10m[i + 1 < hh.time.length ? i + 1 : i];
      wetter.push(code === null || code === undefined ? 255 : wmoArt(code) | zahl(boe, function (v) { return v / 5; }, 0, 30, 0) << 3);
    }
    b = b.concat(temp, wetter);
  }
  return { bytes: b, tag: parseInt(heute.replace(/-/g, ''), 10) };
}
// WMO weather code → kind on the watch (enum ART_… in main.c): 0 clear, 1 fair, 2 partly cloudy, 3 overcast, 4 fog, 5 rain, 6 snow, 7 thunderstorm
function wmoArt(c) {
  if (c === 0 || c === 1 || c === 2) return c;
  if (c === 45 || c === 48) return 4;
  if (c >= 95) return 7;
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 6;
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 5;
  return 3;
}

// Colours (all selectable since 0.5.0). Order = bytes of the FARBEN message = enum F_… in main.c
// Order = bytes sent to the watch = enum F_… in main.c — only append new colours at the end.
// Rows: 1 top, 2 (date by default), 3 time, 4 (temperature by default), 5 bottom; block colours belong to the position, not the content
var FARBEN = [['grund', 'Background', '000000'], ['saeule', 'Columns', '550055'], ['regen', 'Rain', '55AAFF'],
              ['druck', 'Pressure (baro)', 'FF55FF'], ['jetzt', 'Vertical time line', 'FFFFFF'], ['ziffer', 'Time digits', 'FFFFFF'],
              ['rand', 'Digit outline', '000000'], ['kante', '3D edge', 'AA00AA'], ['balken', 'Time bar', '5500AA'],
              ['tag_b', 'Bar row 2 left', '000055'], ['monat_b', 'Bar row 2 right', '000055'],
              ['min_b', 'Bar row 4 left', '000055'], ['max_b', 'Bar row 4 right', '000055'],
              ['z_tag', 'Digits row 2 left', 'FFFFFF'], ['z_monat', 'Digits row 2 right', 'FFFFFF'],
              ['z_min', 'Digits row 4 left', 'FFFFFF'], ['z_max', 'Digits row 4 right', 'FFFFFF'],
              ['s_nacht', 'Night', '000000'], ['s_d1', 'Twilight 1', 'AA0055'], ['s_d2', 'Twilight 2', 'FF5500'],
              ['s_tag', 'Day', 'AA5500'], ['tlinie', 'Horizontal time line', 'FFFFFF'],
              ['z_auf', 'Digits row 1 left', 'FFFFFF'], ['z_unter', 'Digits row 5 left', 'FFFFFF'],
              ['auf_b', 'Bar row 1 left', '000055'], ['unter_b', 'Bar row 5 left', '000055'],
              ['z_auf2', 'Digits row 1 right', 'FFFFFF'], ['z_unter2', 'Digits row 5 right', 'FFFFFF'],
              ['auf_b2', 'Bar row 1 right', '000055'], ['unter_b2', 'Bar row 5 right', '000055'],
              ['rahmen_z', 'Time line frame', '000000'],    // 0.19.0
              ['kurve', 'Line', 'FFFFFF'], ['k_kante', 'Edge', 'AA00AA'], ['k_punkt', 'Dot “now”', 'FF55FF'],   // temperature curve, 0.22.0
              ['k_rand', 'Outline', '000000'], ['k_pkante', 'Dot edge', 'AA00AA'],                                // 0.23.0
              ['b_kurve', 'Line', 'FF55FF'], ['b_kante', 'Edge', '5500AA'], ['b_rand', 'Outline', '000000'],            // pressure curve, 0.23.0
              ['b_punkt', 'Dot “now”', 'FFFFFF'], ['b_pkante', 'Dot edge', 'AA00AA'],
              ['s_auf', 'Sunrise', 'FFAA00'], ['s_unter', 'Sunset', 'FF5500']];                                    // sun stripes, 0.26.0
function farbeGueltig(hex) { return typeof hex === 'string' && /^(00|55|AA|FF){3}$/i.test(hex); }   // only the 64 Pebble colours
// Check stored colours or colours from the page; missing or invalid = default
function farbenPruefen(f) {
  var aus = {};
  if (f && f.datum_b && !f.tag_b) { f.tag_b = f.datum_b; f.monat_b = f.datum_b; }   // colours from 0.8.0
  if (f && f.temp_b && !f.min_b) { f.min_b = f.temp_b; f.max_b = f.temp_b; }
  FARBEN.forEach(function (e) { aus[e[0]] = f && farbeGueltig(f[e[0]]) ? f[e[0]].toUpperCase() : e[2]; });
  return aus;
}
// Display options. Index into DRUCKLAGEN = DRUCKLAGE on the watch
var DRUCKLAGEN = [['Top', 'the whole upper half, behind the date too'], ['Top, narrow', 'between the edge and the date'],
                  ['Bottom, narrow', 'between the temperature and the edge'], ['Bottom', 'the whole lower half, above the rain']];
// Bars (one by one since 0.9.0): name, bit on the watch, default. Stored values from 0.8.0 (datumbalken, tempbalken) are taken over
// Blocks (0.14.0): position → [content key, bar key, digit colour, bar colour, default content, key of the second symbol].
// Order = block 0–7 on the watch. Second symbol (0.22.0): right cell when the block shows a symbol or nothing
var BLOECKE = [['inhalt_1l', 'balken_1l', 'z_auf', 'auf_b', 5, 'zweit_1l'], ['inhalt_1r', 'balken_1r', 'z_auf2', 'auf_b2', 6, 'zweit_1r'],
               ['inhalt_2l', 'balken_2l', 'z_tag', 'tag_b', 1, 'zweit_2l'], ['inhalt_2r', 'balken_2r', 'z_monat', 'monat_b', 2, 'zweit_2r'],
               ['inhalt_4l', 'balken_4l', 'z_min', 'min_b', 3, 'zweit_4l'], ['inhalt_4r', 'balken_4r', 'z_max', 'max_b', 4, 'zweit_4r'],
               ['inhalt_5l', 'balken_5l', 'z_unter', 'unter_b', 7, 'zweit_5l'], ['inhalt_5r', 'balken_5r', 'z_unter2', 'unter_b2', 8, 'zweit_5r']];
var INHALTE = ['empty', 'Day', 'Month', 'Low', 'High', 'Sunrise hour', 'Sunrise minute', 'Sunset hour', 'Sunset minute',
               // since 0.22.0 (order = enum W_… in main.c): smart symbols only show up when there is a reason
               'Temperature now', 'Temperature curve', 'Baro trend', 'Baro trend with hPa', 'Umbrella (rain within 3 h)',
               'Warning (thunder, gusts, frost)', 'Weather now', 'Moon phase', 'Stale data',
               'Pressure curve'];   // 0.23.0 (18); append new contents here, up to 63
var W_FEST = 64;                          // fixed symbols from 64 since 0.23.0 (0.22.0: from 18), free in between
while (INHALTE.length < W_FEST) INHALTE.push(null);
// from W_FEST: every symbol, fixed; order = enum SYM_… (names as in tools/symbole.py, checked by logik_test.js)
INHALTE = INHALTE.concat(['Arrow up', 'Arrow up-right', 'Arrow right', 'Arrow down-right', 'Arrow down', 'Umbrella', 'Snowflake', 'Lightning', 'Windsock', 'Cloud crossed out', 'Sun', 'Cloud', 'Sun and cloud', 'Rain cloud', 'Snow cloud', 'Fog', 'New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent']);
// Contents that use one cell only (0.22.0): empty, smart symbols, fixed symbols — like ist_zelle() in main.c
function inhaltGueltig(w) { return typeof w === 'number' && w % 1 === 0 && w >= 0 && INHALTE[w] !== null && INHALTE[w] !== undefined; }
function istZelle(w) { return typeof w === 'number' && w % 1 === 0 && (w === 0 || w === 11 || (w >= 13 && w <= 17) || (w >= W_FEST && w < INHALTE.length)); }
// Bars: key, bit on the watch, default, older keys (taken over)
var BALKEN = [['balken_1l', 1, false], ['balken_1r', 2, false], ['balken_2l', 4, false, 'tagbalken', 'datumbalken'],
              ['balken_2r', 8, false, 'monatbalken', 'datumbalken'], ['balken_4l', 16, false, 'minbalken', 'tempbalken'],
              ['balken_4r', 32, false, 'maxbalken', 'tempbalken'], ['balken_5l', 64, false], ['balken_5r', 128, false], ['zeitbalken', 256, true]];
var REGENLAGEN = [['Full height', 'columns up to the time bar, 1 mm/h there (umbrella time)'],
                  ['Bottom', 'below the bars: the wettest hour = full height, the rest scales along'], ['Off', 'no rain columns']];
var OPTIONEN = ['saeulen', 'regen_hinter', 'sonne_tag', 'sonne_daemmerung', 'sonne_nacht', 'sonne_streifen', 'streifen_voll', 'staerke_s', 'drucklage', 'regenlage', 'zeitmarke', 'luftdruck', 'regenvoll', 'sonne', 'tageslinie', 'verlauf', 'schwelle',
                'zeile1', 'zeile5', 'druckvoll', 'staerke_v', 'staerke_h', 'dicke_d', 'voll_v', 'voll_h', 'regen_vorn', 'regen_rel', 'rahmen_z']
  .concat(BALKEN.map(function (b) { return b[0]; }), BLOECKE.map(function (b) { return b[0]; }), BLOECKE.map(function (b) { return b[5]; }));
function optionenPruefen(o) {
  function an(k, std) { return o && typeof o[k] === 'boolean' ? o[k] : std; }
  var aus = { drucklage: o && typeof o.drucklage === 'number' && o.drucklage >= 0 && o.drucklage < DRUCKLAGEN.length ? Math.floor(o.drucklage) : 0,
              regenlage: o && typeof o.regenlage === 'number' && o.regenlage >= 0 && o.regenlage < 3 ? Math.floor(o.regenlage)
                         : an('regenunten', false) ? 1 : 0,   // regenunten until 0.10.0
              zeitmarke: an('zeitmarke', true), luftdruck: an('luftdruck', true),
              regenvoll: an('regenvoll', false), sonne: an('sonne', false), tageslinie: an('tageslinie', false),
              verlauf: an('verlauf', true),
              schwelle: o && typeof o.schwelle === 'number' && o.schwelle >= 0 && o.schwelle < 5 ? Math.floor(o.schwelle) : 1 };
  function zahl(k, max, std) { return o && typeof o[k] === 'number' && o[k] >= 0 && o[k] <= max ? Math.floor(o[k]) : std; }
  BALKEN.forEach(function (b) { aus[b[0]] = an(b[0], b[3] ? an(b[3], b[4] ? an(b[4], b[2]) : b[2]) : b[2]); });
  BLOECKE.forEach(function (b) { aus[b[0]] = o && inhaltGueltig(o[b[0]]) ? o[b[0]] : b[4]; aus[b[5]] = o && istZelle(o[b[5]]) ? o[b[5]] : 0; });
  aus.zeile1 = an('zeile1', an('sonnenzeilen', false)); aus.zeile5 = an('zeile5', an('sonnenzeilen', false));
  aus.druckvoll = an('druckvoll', false);
  aus.voll_v = an('voll_v', false); aus.voll_h = an('voll_h', true); aus.regen_vorn = an('regen_vorn', true);   // 0.17.0
  aus.regen_rel = an('regen_rel', aus.regenlage === 1);   // 0.18.0; whoever had "bottom" was already relative
  aus.rahmen_z = an('rahmen_z', false);                   // 0.19.0: shared frame around the time lines
  aus.saeulen = an('saeulen', true);                      // 0.24.0: background columns can be switched off
  aus.regen_hinter = an('regen_hinter', false);           // 0.25.0: day (since 0.25.1 also twilight) of the sun position in front of the rain
  aus.sonne_tag = an('sonne_tag', true); aus.sonne_daemmerung = an('sonne_daemmerung', true); aus.sonne_nacht = an('sonne_nacht', true);   // 0.26.0
  aus.sonne_streifen = an('sonne_streifen', false); aus.streifen_voll = an('streifen_voll', true);
  aus.staerke_s = o && typeof o.staerke_s === 'number' && o.staerke_s >= 1 && o.staerke_s <= 20 ? Math.floor(o.staerke_s) : 2;
  aus.dicke_d = zahl('dicke_d', 3, 1);   // baro: index = width − 1
  // time lines in px (1–20) since 0.15.0; the index dicke_v/dicke_h from 0.14.0 is taken over
  function px(k, alt, std) { return o && typeof o[k] === 'number' && o[k] >= 1 && o[k] <= 20 ? Math.floor(o[k]) : zahl(alt, 3, std - 1) + 1; }
  aus.staerke_v = px('staerke_v', 'dicke_v', 2); aus.staerke_h = px('staerke_h', 'dicke_h', 1);
  return aus;
}
function linienBytes(o) { return [o.staerke_v, o.staerke_h, o.rahmen_z ? 1 : 0, o.staerke_s || 2]; }   // width vertical, horizontal (px), frame, sun stripes (0.26.0)
function bloeckeBytes(o) { return BLOECKE.map(function (b) { return o[b[0]]; }); }
// Message SCHALTER: bit 0 columns (0.24.0), 1 rain behind day and twilight (0.25.0), 2–4 areas day, twilight, night,
// 5 sun stripes, 6 stripes solid (0.26.0). Missing keys = default
function schalterZahl(o) {
  function an(k, std) { return typeof o[k] === 'boolean' ? o[k] : std; }
  return (an('saeulen', true) ? 1 : 0) | (an('regen_hinter', false) ? 2 : 0) | (an('sonne_tag', true) ? 4 : 0) | (an('sonne_daemmerung', true) ? 8 : 0) |
         (an('sonne_nacht', true) ? 16 : 0) | (an('sonne_streifen', false) ? 32 : 0) | (an('streifen_voll', true) ? 64 : 0);
}
function zellenBytes(o) { return BLOECKE.map(function (b) { return o[b[5]] || 0; }); }
function balkenBits(o) { var n = 0; BALKEN.forEach(function (b) { if (o[b[0]]) n += b[1]; }); return n; }
// Options as one number for the watch (0.14.0): bits 0–8 bars, 9–10 pressure position, 11–12 rain position, 13 time marker, 14 pressure,
// 15 rain full columns, 16 sun position, 17 time-of-day line, 18 gradient, 19–21 threshold, 22/23 vertical/horizontal solid, 24 rain in front of the vertical line, 25 rain relative to the daily maximum,
// 26 baro continuous, 27–28 baro width, 29 row 1, 30 row 5
function optionenZahl(o) {
  return balkenBits(o) | o.drucklage << 9 | o.regenlage << 11 | (o.zeitmarke ? 1 << 13 : 0) | (o.luftdruck ? 1 << 14 : 0) |
         (o.regenvoll ? 1 << 15 : 0) | (o.sonne ? 1 << 16 : 0) | (o.tageslinie ? 1 << 17 : 0) | (o.verlauf ? 1 << 18 : 0) |
         o.schwelle << 19 | (o.voll_v ? 1 << 22 : 0) | (o.voll_h ? 1 << 23 : 0) | (o.regen_vorn ? 1 << 24 : 0) | (o.regen_rel ? 1 << 25 : 0) |
         (o.druckvoll ? 1 << 26 : 0) | o.dicke_d << 27 |
         (o.zeile1 ? 1 << 29 : 0) | (o.zeile5 ? 1 << 30 : 0);
}

// Night (since 0.11.0): only changed values are stored, everything else comes from the day
function nachtPruefen(n) {
  var aus = { an: !!(n && n.an === true), farben: {}, optionen: {} }, k;
  var f = n && n.farben || {}, o = n && n.optionen || {}, test = optionenPruefen(o);
  FARBEN.forEach(function (e) { if (farbeGueltig(f[e[0]])) aus.farben[e[0]] = f[e[0]].toUpperCase(); });
  for (k in o) if (OPTIONEN.indexOf(k) >= 0 && o[k] === test[k]) aus.optionen[k] = o[k];
  return aus;
}
function nachtThema(tag, nacht) {
  var f = {}, o = {}, k;
  for (k in tag.farben) f[k] = k in nacht.farben ? nacht.farben[k] : tag.farben[k];
  for (k in tag.optionen) o[k] = k in nacht.optionen ? nacht.optionen[k] : tag.optionen[k];
  return { farben: f, optionen: o };
}
// Everything the watch gets as settings
function anUhr(tag, nacht) {
  var n = nachtThema(tag, nacht);
  return { FARBEN: farbenBytes(tag.farben), OPTIONEN: optionenZahl(tag.optionen), BLOECKE: bloeckeBytes(tag.optionen),
           LINIEN: linienBytes(tag.optionen), LINIEN_N: linienBytes(n.optionen),
           FARBEN_N: farbenBytes(n.farben), OPTIONEN_N: optionenZahl(n.optionen), BLOECKE_N: bloeckeBytes(n.optionen),
           ZELLEN: zellenBytes(tag.optionen), ZELLEN_N: zellenBytes(n.optionen),
           SCHALTER: schalterZahl(tag.optionen), SCHALTER_N: schalterZahl(n.optionen),
           NACHTMODUS: nacht.an ? 1 : 0 };
}
// Presets: a complete setting (day and night) under one name, at most 20
function presetsPruefen(liste) {
  var aus = [];
  (Array.isArray(liste) ? liste : []).forEach(function (p) {
    if (aus.length >= 20 || !p || typeof p.name !== 'string' || !p.name.trim() || !p.tag) return;
    aus.push({ name: p.name.trim().substring(0, 40), tag: { farben: farbenPruefen(p.tag.farben), optionen: optionenPruefen(p.tag.optionen) },
               nacht: nachtPruefen(p.nacht) });
  });
  return aus;
}

// Stock presets (since 0.20.0): six ready-made settings (Retro since 0.27.0), loadable on the page under "Presets". Only differences from the default,
// presetsPruefen() fills in the rest. Night: changed values only, as everywhere. Since 0.21.0 every stock preset with a
// night theme is followed by its night look as a preset of its own ("Neon Night"), so it can be loaded onto the night alone
var VORLAGEN = [
  { name: 'Neon', tag: {
      farben: { z_auf: 'FF55FF', z_auf2: 'FF55FF', z_unter: 'FF55FF', z_unter2: 'FF55FF' },
      optionen: { zeile1: true, zeile5: true, druckvoll: true, regen_rel: true, staerke_v: 4 } },
    nacht: { an: true, optionen: {}, farben: { ziffer: 'AA55AA', z_tag: 'AA55AA', z_monat: 'AA55AA', z_min: 'AA55AA', z_max: 'AA55AA',
      z_auf: 'AA00AA', z_auf2: 'AA00AA', z_unter: 'AA00AA', z_unter2: 'AA00AA', balken: '550055', regen: '0055AA', druck: 'AA00AA',
      jetzt: 'AA55AA', kante: '550055' } } },
  { name: 'Paper', tag: {
      farben: { grund: 'FFFFFF', saeule: 'AAAAAA', regen: '0055AA', druck: '000000', jetzt: '000000', ziffer: '000000', rand: 'FFFFFF',
        kante: 'AAAAAA', z_tag: '000000', z_monat: '000000', z_min: '0055AA', z_max: 'AA0000', tlinie: '000000' },
      optionen: { zeitbalken: false, voll_v: true, staerke_v: 1, druckvoll: true, dicke_d: 0, drucklage: 1 } },
    nacht: { an: true, optionen: {}, farben: { grund: '000000', saeule: '555555', regen: '55AAFF', druck: 'FFFFFF', jetzt: 'FFFFFF',
      ziffer: 'FFFFFF', rand: '000000', kante: '555555', z_tag: 'FFFFFF', z_monat: 'FFFFFF', z_min: '55AAFF', z_max: 'FF5555' } } },
  { name: 'Sundial', tag: {
      farben: { s_nacht: '000055', s_d1: 'AA0055', s_d2: 'FF5500', s_tag: 'FFAA00', saeule: '000000', regen: '55FFFF', druck: 'FFFFFF',
        tlinie: 'FFFFFF', jetzt: 'FFFFFF', rahmen_z: '000000', kante: 'AA5500', z_auf: 'FFFF55', z_auf2: 'FFFF55', z_unter: 'FF5500', z_unter2: 'FF5500' },
      optionen: { sonne: true, verlauf: true, tageslinie: true, staerke_h: 3, zeitmarke: true, voll_v: true, staerke_v: 3, rahmen_z: true,
        zeitbalken: false, zeile1: true, zeile5: true, druckvoll: true, dicke_d: 0 } },
    nacht: { an: false, farben: {}, optionen: {} } },
  { name: 'Terminal', tag: {
      farben: { saeule: '005500', regen: '55FF55', druck: 'AAFFAA', jetzt: '00FF00', ziffer: '00FF00', z_tag: '00FF00', z_monat: '00FF00',
        z_min: '00FF00', z_max: '00FF00', z_auf: '00AA00', z_auf2: '00AA00', z_unter: '00AA00', z_unter2: '00AA00', kante: '005500',
        rand: '000000', tlinie: '00FF00' },
      optionen: { zeitbalken: false, zeile1: true, zeile5: true, inhalt_1l: 4, inhalt_1r: 3, inhalt_2l: 1, inhalt_2r: 2,
        inhalt_4l: 5, inhalt_4r: 6, inhalt_5l: 7, inhalt_5r: 8, regenvoll: true, dicke_d: 0 } },
    nacht: { an: false, farben: {}, optionen: {} } },
  { name: 'Minimal', tag: {
      farben: { saeule: '000000', regen: '5555AA', kante: '000000', z_tag: 'AAAAAA', z_monat: 'AAAAAA', z_min: 'AAAAAA', z_max: 'AAAAAA',
        jetzt: '555555' },
      optionen: { zeitbalken: false, luftdruck: false, regenlage: 1, regen_rel: true, schwelle: 2, voll_v: true, staerke_v: 1 } },
    nacht: { an: false, farben: {}, optionen: {} } },
  { name: 'Retro', tag: {                                  // 0.27.0, made by Seb: red and blue digits, a sunny sky, a fat cross
      farben: { saeule: '000000', regen: '00AAFF', druck: 'FFFFFF', jetzt: 'FFAA00', ziffer: 'FF0000', kante: '000000', balken: 'FFAA00',
        z_tag: 'FF0000', z_monat: '0055FF', z_min: '0055FF', z_max: 'FF0000', s_nacht: '5500AA', s_tag: 'FFAA00', tlinie: 'FFAA00' },
      optionen: { luftdruck: false, regenvoll: true, sonne: true, tageslinie: true, schwelle: 0, zeile1: true, zeile5: true, druckvoll: true,
        voll_v: true, regen_rel: true, rahmen_z: true, saeulen: false, regen_hinter: true, dicke_d: 0, staerke_v: 10, staerke_h: 10 } },
    nacht: { an: true, farben: { saeule: 'FFFFFF', ziffer: 'FFFFFF', kante: 'AA00FF', balken: 'FFFFFF', z_tag: 'FFFFFF', z_monat: 'FFFFFF',
      z_min: 'FFFFFF', z_max: 'FFFFFF', tlinie: 'FFFFFF' }, optionen: { verlauf: false, regenlage: 2, sonne: false, zeitmarke: false, staerke_h: 5 } } }
];
function vorlagen() {                // fill partial settings up to complete ones
  var aus = [];
  presetsPruefen(VORLAGEN.map(function (v) {
    var f = {}, o = {}, k;
    for (k in v.tag.farben) f[k] = v.tag.farben[k];
    for (k in v.tag.optionen) o[k] = v.tag.optionen[k];
    return { name: v.name, tag: { farben: farbenPruefen(f), optionen: o }, nacht: v.nacht };
  })).forEach(function (p) {
    aus.push(p);
    if (p.nacht.an) aus.push({ name: p.name + ' Night', tag: nachtThema(p.tag, p.nacht), nacht: nachtPruefen(null) });
  });
  return aus;
}

function farbCode(hex) { var c = 0; for (var i = 0; i < 3; i++) c = c * 4 + parseInt(hex.substr(i * 2, 2), 16) / 85; return c; }
function farbenBytes(f) { var g = farbenPruefen(f); return FARBEN.map(function (e) { return farbCode(g[e[0]]); }); }

module.exports = { wetterUrl: wetterUrl, wetterPaket: wetterPaket, ortsDatum: ortsDatum, FARBEN: FARBEN,
                   farbenPruefen: farbenPruefen, farbenBytes: farbenBytes, farbCode: farbCode, STUNDEN: STUNDEN,
                   DRUCKLAGEN: DRUCKLAGEN, optionenPruefen: optionenPruefen, BALKEN: BALKEN, balkenBits: balkenBits,
                   optionenZahl: optionenZahl, nachtPruefen: nachtPruefen, nachtThema: nachtThema, anUhr: anUhr,
                   presetsPruefen: presetsPruefen, ortsMinuten: ortsMinuten, REGENLAGEN: REGENLAGEN, daemmerung: daemmerung,
                   BLOECKE: BLOECKE, INHALTE: INHALTE, bloeckeBytes: bloeckeBytes,
                   vorlagen: vorlagen, linienBytes: linienBytes, wmoArt: wmoArt, istZelle: istZelle, inhaltGueltig: inhaltGueltig, W_FEST: W_FEST, zellenBytes: zellenBytes };
