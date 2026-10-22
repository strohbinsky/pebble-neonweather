// Checks logik.js against a saved Open-Meteo response (Frankfurt, 12 Oct 2026, open-meteo-frankfurt-2026-10-12.json next to this file).
// Run: node tools/test/logik_test.js
var assert = require('assert'), path = require('path'), fs = require('fs');
var logik = require('../../src/pkjs/logik');
var datei = path.resolve(__dirname, 'open-meteo-frankfurt-2026-10-12.json');
var j = JSON.parse(fs.readFileSync(datei, 'utf8'));
var p = logik.wetterPaket(j, Date.parse('2026-10-12T08:00:00Z'));
assert.strictEqual(p.tag, 20261012);
assert.strictEqual(p.bytes.length, 184, '88 + hourly values (0.22.0)');
var h = j.hourly, i14 = h.time.indexOf('2026-10-12T14:00');
var i15 = h.time.indexOf('2026-10-12T15:00');
assert.strictEqual(p.bytes[10], Math.round(h.precipitation[i15] * 10), 'rain 14–15 h = value at 15 h');
assert.strictEqual(p.bytes[17 + 10], Math.round(h.pressure_msl[i14] * 2 - 1900), 'pressure 14 h');
assert.strictEqual(p.bytes[34], Math.round(j.daily.temperature_2m_min[1]), 'low');
assert.strictEqual(p.bytes[35], Math.round(j.daily.temperature_2m_max[1]), 'high');
assert.strictEqual(p.bytes[44 + 34], Math.round(j.daily.temperature_2m_min[2]), 'low tomorrow');
// sun as local minutes (since 0.11.0)
assert.strictEqual(p.bytes[36] | p.bytes[37] << 8, logik.ortsMinuten(j.daily.sunrise[1]), 'sunrise');
assert.strictEqual(p.bytes[38] | p.bytes[39] << 8, logik.ortsMinuten(j.daily.sunset[1]), 'sunset');
assert.ok((p.bytes[38] | p.bytes[39] << 8) > 17 * 60, 'sunset in the evening');
// shortly before midnight UTC it is already the next day locally
assert.strictEqual(logik.wetterPaket(j, Date.parse('2026-10-11T22:30:00Z')).tag, 20261012);
// day 2 missing in the response: values marked as missing
var p2 = logik.wetterPaket(j, Date.parse('2026-10-13T08:00:00Z'));
assert.strictEqual(p2.bytes[44], 255); assert.strictEqual(p2.bytes[44 + 34], 128); assert.strictEqual(p2.bytes[80] | p2.bytes[81] << 8, 0xFFFF);
// twilight (since 0.12.0): Frankfurt on 12 Oct about 30–40 min before sunrise and after sunset
var w = function (i) { return p.bytes[i] | p.bytes[i + 1] << 8; };
var auf = w(36), unter = w(38), da = w(40), du = w(42);
assert.ok(auf - da > 25 && auf - da < 45, 'dawn ' + (auf - da) + ' min');
assert.ok(du - unter > 25 && du - unter < 45, 'dusk ' + (du - unter) + ' min');
function hm(m) { return Math.floor(m / 60) + ':' + ('0' + m % 60).slice(-2); }
console.log('sun ok: dawn ' + hm(da) + ', sunrise ' + hm(auf) + ', sunset ' + hm(unter) + ', dusk until ' + hm(du));
// hourly values (since 0.22.0) from the real response: temperature, kind and gust at 14 h
assert.strictEqual((p.bytes[88 + 14] << 24) >> 24, Math.round(h.temperature_2m[i14]), 'temperature 14 h');
assert.strictEqual(p.bytes[88 + 24 + 14], logik.wmoArt(h.weather_code[i14]) | Math.min(30, Math.round(h.wind_gusts_10m[i15] / 5)) << 3, 'weather 14 h');
console.log('hours real: 14 h ' + h.temperature_2m[i14] + ' °C, code ' + h.weather_code[i14] + ', gust ' + h.wind_gusts_10m[i15] + ' km/h');
// without those fields: everything "missing"
var ohne = JSON.parse(JSON.stringify(j)); delete ohne.hourly.temperature_2m; delete ohne.hourly.weather_code;
var po = logik.wetterPaket(ohne, Date.parse('2026-10-12T08:00:00Z')).bytes;
assert.strictEqual(po[88], 128, 'temperature missing = -128'); assert.strictEqual(po[88 + 24], 255, 'weather missing');
var s = JSON.parse(JSON.stringify(j)), CODES = [0, 1, 2, 3, 45, 61, 73, 95, 81, 51];
s.hourly.temperature_2m = s.hourly.time.map(function (t, i) { return i % 30 - 8.4; });
s.hourly.weather_code = s.hourly.time.map(function (t, i) { return CODES[i % CODES.length]; });
s.hourly.wind_gusts_10m = s.hourly.time.map(function (t, i) { return i * 3.1; });
var ps = logik.wetterPaket(s, Date.parse('2026-10-12T08:00:00Z')).bytes, i3 = h.time.indexOf('2026-10-12T03:00'), j23 = h.time.indexOf('2026-10-13T23:00');
assert.strictEqual(ps.length, 184);
assert.strictEqual((ps[88 + 3] << 24) >> 24, Math.round(i3 % 30 - 8.4), 'temperature 03 h today');
assert.strictEqual((ps[88 + 48 + 23] << 24) >> 24, Math.round(j23 % 30 - 8.4), 'temperature 23 h tomorrow');
assert.strictEqual(ps[88 + 24 + 3] & 7, logik.wmoArt(CODES[i3 % CODES.length]), 'kind 03 h');
assert.strictEqual(ps[88 + 24 + 3] >> 3, Math.min(30, Math.round((i3 + 1) * 3.1 / 5)), 'gust 03–04 h = value at 04 h');
assert.deepStrictEqual([0, 1, 2, 3, 45, 48, 51, 61, 67, 80, 71, 86, 95, 99].map(logik.wmoArt), [0, 1, 2, 3, 4, 4, 5, 5, 5, 5, 6, 6, 7, 7]);
assert.ok(ps.every(function (b) { return b >= 0 && b <= 255; }), 'bytes only');
assert.ok(logik.wetterUrl(50.1, 8.68).indexOf('temperature_2m,weather_code,wind_gusts_10m') > 0);
console.log('hours ok: temperature, kind, gusts per hour');
// below zero as int8
var k = JSON.parse(JSON.stringify(j)); k.daily.temperature_2m_min[1] = -6.4;
assert.strictEqual((logik.wetterPaket(k, Date.parse('2026-10-12T08:00:00Z')).bytes[34] << 24) >> 24, -6);
assert.ok(logik.wetterUrl(50.1, 8.68).indexOf('latitude=50.10&longitude=8.68') > 0);
console.log('logic ok: rain', p.bytes.slice(0, 17).join(','), '| pressure', p.bytes.slice(17, 34).join(','), '| T', p.bytes[34], p.bytes[35]);
// colours: default, lower case, invalid values (no Pebble colour) → default
var std = logik.farbenBytes(null);
assert.strictEqual(std.length, 43);
assert.deepStrictEqual(std, [0x00, 0x11, 0x1B, 0x37, 0x3F, 0x3F, 0x00, 0x22, 0x12, 0x01, 0x01, 0x01, 0x01, 0x3F, 0x3F, 0x3F, 0x3F,
                             0x00, 0x21, 0x34, 0x24, 0x3F, 0x3F, 0x3F, 0x01, 0x01, 0x3F, 0x3F, 0x01, 0x01, 0x00, 0x3F, 0x22, 0x37,
                             0x00, 0x22, 0x37, 0x12, 0x00, 0x3F, 0x22, 0x38, 0x34]);
var f = logik.farbenPruefen({ balken: '0000aa', regen: '123456', grund: 'FFFFFF' });
assert.strictEqual(f.balken, '0000AA'); assert.strictEqual(f.regen, '55AAFF'); assert.strictEqual(f.grund, 'FFFFFF');
console.log('colours ok:', std.map(function (b) { return b.toString(16); }).join(' '));
// options as a number, night theme, presets (since 0.11.0)
var o = logik.optionenPruefen(null);
assert.strictEqual(logik.optionenZahl(o), 160194816, 'default like OPTIONEN_STD in main.c');
assert.deepStrictEqual([o.staerke_v, o.staerke_h], [2, 1], 'time lines 2 and 1 px');
assert.deepStrictEqual(logik.bloeckeBytes(o), [5, 6, 1, 2, 3, 4, 7, 8], 'default blocks');
assert.strictEqual(logik.optionenPruefen({ regenunten: true }).regenlage, 1, 'regenunten from 0.10.0 → bottom');
var tag = { farben: logik.farbenPruefen(null), optionen: o };
var n = logik.nachtPruefen({ an: true, farben: { grund: '000055', unsinn: 'FFFFFF', regen: '123456' }, optionen: { zeitmarke: false, drucklage: 9 } });
assert.deepStrictEqual(n, { an: true, farben: { grund: '000055' }, optionen: { zeitmarke: false } }, 'valid changes only');
var u = logik.anUhr(tag, n);
assert.strictEqual(u.NACHTMODUS, 1);
assert.strictEqual(u.FARBEN_N[0], 0x01, 'night: background changed'); assert.strictEqual(u.FARBEN[0], 0x00, 'day unchanged');
assert.strictEqual(u.OPTIONEN_N, 160194816 - (1 << 13), 'night without time marker'); assert.strictEqual(u.FARBEN_N[2], u.FARBEN[2], 'the rest like day');
var ps = logik.presetsPruefen([{ name: '  Neon  ', tag: tag, nacht: n }, { name: '', tag: tag }, null]);
assert.strictEqual(ps.length, 1); assert.strictEqual(ps[0].name, 'Neon');
assert.strictEqual(logik.optionenZahl(logik.optionenPruefen({ schwelle: 4 })) >> 19 & 7, 4, 'threshold 1.0');
assert.strictEqual(logik.optionenPruefen({ inhalt_2l: 42 }).inhalt_2l, 1, 'invalid block content → default');
// second symbol (0.22.0): cell contents only, names of the fixed symbols as in the generator
[[13, 13], [64, 64], [87, 87], [11, 11], [4, 0], [10, 0], [12, 0], [18, 0], [41, 0], [88, 0], [1.5, 0], ['13', 0]].forEach(function (f) {
  assert.strictEqual(logik.optionenPruefen({ zweit_1l: f[0] }).zweit_1l, f[1], 'second ' + f[0]);
});
assert.deepStrictEqual(logik.INHALTE.slice(logik.W_FEST), require('../../src/pkjs/symbole').namen, 'names as in tools/symbole.py');
var us = logik.anUhr({ farben: {}, optionen: logik.optionenPruefen({ saeulen: false }) }, logik.nachtPruefen({ an: true, optionen: { saeulen: true } }));
assert.deepStrictEqual([logik.anUhr({ farben: {}, optionen: logik.optionenPruefen(null) }, logik.nachtPruefen(null)).SCHALTER, us.SCHALTER, us.SCHALTER_N], [93, 92, 93], 'columns (0.24.0); default: day, twilight, night, stripes solid');
assert.strictEqual(logik.anUhr({ farben: {}, optionen: logik.optionenPruefen({ regen_hinter: true }) }, logik.nachtPruefen(null)).SCHALTER, 95, 'rain behind the day (0.25.0)');
var so = logik.optionenPruefen({ sonne_tag: false, sonne_daemmerung: false, sonne_nacht: false, sonne_streifen: true, streifen_voll: false, staerke_s: 9 });
assert.strictEqual(logik.anUhr({ farben: {}, optionen: so }, logik.nachtPruefen(null)).SCHALTER, 1 | 32, 'stripes only, dashed (0.26.0)');
assert.deepStrictEqual(logik.linienBytes(so), [2, 1, 0, 9], 'stripe width in LINIEN byte 3');
assert.strictEqual(logik.optionenPruefen({ staerke_s: 25 }).staerke_s, 2);
assert.strictEqual(logik.anUhr({ farben: {}, optionen: logik.optionenPruefen(null) }, logik.nachtPruefen({ an: true, optionen: { sonne_tag: false } })).SCHALTER_N, 89, 'night without the day area');
assert.strictEqual(logik.nachtPruefen({ an: true, optionen: { zweit_1l: 72 } }).optionen.zweit_1l, 72, 'night: second symbol');
assert.deepStrictEqual(logik.anUhr({ farben: {}, optionen: logik.optionenPruefen({ zweit_5r: 76 }) }, logik.nachtPruefen(null)).ZELLEN, [0, 0, 0, 0, 0, 0, 0, 76]);
[[17, 17], [18, 18], [19, 1], [63, 1], [64, 64], [87, 87], [88, 1], [-1, 1], [2.5, 1]].forEach(function (f) {   // 18 pressure curve, 64–87 fixed (0.23.0)
  assert.strictEqual(logik.optionenPruefen({ inhalt_2l: f[0] }).inhalt_2l, f[1], 'content ' + f[0]);
});
assert.strictEqual(logik.optionenPruefen({ schwelle: 9 }).schwelle, 1, 'invalid threshold → 0.2');
assert.strictEqual(logik.optionenPruefen({ staerke_v: 25 }).staerke_v, 2, 'above 20 px → default');
assert.strictEqual(logik.optionenPruefen(null).regen_rel, false, 'default: fixed scale');
assert.strictEqual(logik.optionenPruefen({ regenlage: 1 }).regen_rel, true, '"bottom" from 0.13–0.17 stays relative');
assert.strictEqual(logik.optionenZahl(logik.optionenPruefen({ regen_rel: true })) >> 25 & 1, 1, 'bit 25');
console.log('night ok: options 160194816, blocks, threshold, night theme, presets');
// stock presets (since 0.20.0): six (Retro since 0.27.0), complete, all with valid packets for the watch; since 0.21.0 night looks as presets of their own
var vl = logik.vorlagen();
assert.deepStrictEqual(vl.map(function (p) { return p.name; }), ['Neon', 'Neon Night', 'Paper', 'Paper Night', 'Sundial', 'Terminal', 'Minimal', 'Retro', 'Retro Night']);
vl.forEach(function (p) {
  var u = logik.anUhr(p.tag, p.nacht);
  assert.strictEqual(u.FARBEN.length, 43, p.name); assert.strictEqual(u.BLOECKE.length, 8, p.name); assert.strictEqual(u.LINIEN.length, 4, p.name);
});
assert.strictEqual(vl[2].tag.farben.grund, 'FFFFFF'); assert.strictEqual(vl[2].nacht.farben.grund, '000000', 'Paper inverted at night');
assert.deepStrictEqual(vl[3].tag, logik.nachtThema(vl[2].tag, vl[2].nacht), 'Paper Night = night look of Paper');
assert.strictEqual(vl[3].nacht.an, false); assert.strictEqual(vl[1].tag.farben.ziffer, 'AA55AA', 'Neon Night dimmed');
assert.strictEqual(vl[5].tag.optionen.inhalt_1l, 4, 'Terminal: high at the top left');
var re = logik.anUhr(vl[7].tag, vl[7].nacht);   // Retro (0.27.0, Seb's preset): sun, cross 10 px, columns off; night white, no rain, no sun
assert.deepStrictEqual([re.OPTIONEN >> 16 & 1, re.LINIEN[0], re.LINIEN[1], re.SCHALTER & 1, re.NACHTMODUS], [1, 10, 10, 0, 1]);
assert.deepStrictEqual([re.OPTIONEN_N >> 16 & 1, re.OPTIONEN_N >> 11 & 3, re.LINIEN_N[1], re.FARBEN_N[5]], [0, 2, 5, 0x3F], 'Retro night');
console.log('presets ok: ' + vl.length);
