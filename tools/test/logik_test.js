// Checks logik.js against a saved Open-Meteo response (Frankfurt, 12 Oct 2026, open-meteo-frankfurt-2026-10-12.json next to this file).
// Run: node tools/test/logik_test.js
var assert = require('assert'), path = require('path'), fs = require('fs');
var logik = require('../../src/pkjs/logik');
var datei = path.resolve(__dirname, 'open-meteo-frankfurt-2026-10-12.json');
var j = JSON.parse(fs.readFileSync(datei, 'utf8'));
var p = logik.wetterPaket(j, Date.parse('2026-10-12T08:00:00Z'));
assert.strictEqual(p.tag, 20261012);
assert.strictEqual(p.bytes.length, 236, '88 + hourly values (0.22.0) + night hours (0.28.0) + evening before (0.29.0)');
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
assert.strictEqual(ps.length, 236);
assert.strictEqual((ps[88 + 3] << 24) >> 24, Math.round(i3 % 30 - 8.4), 'temperature 03 h today');
assert.strictEqual((ps[88 + 48 + 23] << 24) >> 24, Math.round(j23 % 30 - 8.4), 'temperature 23 h tomorrow');
assert.strictEqual(ps[88 + 24 + 3] & 7, logik.wmoArt(CODES[i3 % CODES.length]), 'kind 03 h');
assert.strictEqual(ps[88 + 24 + 3] >> 3, Math.min(30, Math.round((i3 + 1) * 3.1 / 5)), 'gust 03–04 h = value at 04 h');
assert.deepStrictEqual([0, 1, 2, 3, 45, 48, 51, 61, 67, 80, 71, 86, 95, 99].map(logik.wmoArt), [0, 1, 2, 3, 4, 4, 5, 5, 5, 5, 6, 6, 7, 7]);
assert.ok(ps.every(function (b) { return b >= 0 && b <= 255; }), 'bytes only');
assert.ok(logik.wetterUrl(50.1, 8.68).indexOf('temperature_2m,weather_code,wind_gusts_10m') > 0);
console.log('hours ok: temperature, kind, gusts per hour');
// night hours for the 24-hour axis (since 0.28.0): rain 00–04 and 21–24 h (value of the following hour), pressure at 00–03 and 21–23 h
var n = JSON.parse(JSON.stringify(j));
n.hourly.precipitation = n.hourly.time.map(function (t, i) { return (i % 7) / 10; });
n.hourly.pressure_msl = n.hourly.time.map(function (t, i) { return 1000 + i / 2; });
var pn = logik.wetterPaket(n, Date.parse('2026-10-12T08:00:00Z')).bytes, t0 = h.time.indexOf('2026-10-12T00:00');
assert.deepStrictEqual(logik.NACHTSTUNDEN, [0, 1, 2, 3, 21, 22, 23]);
logik.NACHTSTUNDEN.forEach(function (st, k) {
  assert.strictEqual(pn[184 + k], ((t0 + st + 1) % 7), 'rain ' + st + ' h today');
  assert.strictEqual(pn[184 + 7 + k], Math.round((1000 + (t0 + st) / 2) * 2 - 1900), 'pressure ' + st + ' h today');
  assert.strictEqual(pn[184 + 14 + 7 + k], Math.round((1000 + (t0 + 24 + st) / 2) * 2 - 1900), 'pressure ' + st + ' h tomorrow');
});
assert.strictEqual(pn[184 + 14 + 6], 255, 'rain 23–24 h tomorrow: the day after is not in the response');
assert.strictEqual(pn[10], (h.time.indexOf('2026-10-12T15:00') % 7), 'day part unchanged: rain 14–15 h');
console.log('night hours ok: rain', pn.slice(184, 191).join(','), '| pressure', pn.slice(191, 198).join(','));
// below zero as int8
var k = JSON.parse(JSON.stringify(j)); k.daily.temperature_2m_min[1] = -6.4;
assert.strictEqual((logik.wetterPaket(k, Date.parse('2026-10-12T08:00:00Z')).bytes[34] << 24) >> 24, -6);
assert.ok(logik.wetterUrl(50.1, 8.68).indexOf('latitude=50.10&longitude=8.68') > 0);
console.log('logic ok: rain', p.bytes.slice(0, 17).join(','), '| pressure', p.bytes.slice(17, 34).join(','), '| T', p.bytes[34], p.bytes[35]);
// colours: default, lower case, invalid values (no Pebble colour) → default
var std = logik.farbenBytes(null);
assert.strictEqual(std.length, 83);
assert.deepStrictEqual(std, [0x00, 0x11, 0x1B, 0x37, 0x3F, 64, 0x00, 0x22, 0x12, 0x01, 0x01, 0x01, 0x01, 64, 64, 64, 64,
                             0x00, 0x21, 0x34, 0x24, 0x3F, 64, 64, 0x01, 0x01, 64, 64, 0x01, 0x01, 0x00, 0x3F, 0x22, 0x37,
                             0x00, 0x22, 0x37, 0x12, 0x00, 0x3F, 0x22, 0x38, 0x34,
                             64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64,    // 0.28.0: 3D edge per block, symbol families: inherit
                             0x3F, 64, 64, 64, 64, 64, 64, 64, 64,    // 0.30.0: main colour white; time and block digits inherit it; 3D per family
                             64, 64, 64, 64, 64, 64, 64, 64, 64,      // 0.32.0: outline per block and of the time: inherit
                             64, 64, 64, 64, 64, 64, 64]);            // 0.34.0: outline per symbol family: inherit
// inherit (0.28.0): only the new colours may be empty; the watch gets 64
var fe = logik.farbenPruefen({ kante_2l: '0055ff', sf_mond: '', grund: '', kante: '' });
assert.strictEqual(fe.kante_2l, '0055FF'); assert.strictEqual(fe.sf_mond, ''); assert.strictEqual(fe.grund, '000000', 'background never empty');
assert.strictEqual(fe.kante, 'AA00AA', 'the common 3D edge never empty');
var fb = logik.farbenBytes(fe); assert.strictEqual(fb[43 + 2], 0x07, 'edge row 2 left'); assert.strictEqual(fb[43 + 9 + 4], 64, 'moon inherits');
// outline per block (0.32.0): empty = the common outline, own colour goes to byte 67 + block, the time to 75; the common one never empty
var fr = logik.farbenPruefen({ rand_2l: 'ff5500', rand_zeit: '0000aa', rand: '' });
assert.deepStrictEqual([fr.rand_2l, fr.rand_zeit, fr.rand_1l, fr.rand], ['FF5500', '0000AA', '', '000000']);
var fbr = logik.farbenBytes(fr); assert.deepStrictEqual([fbr[67 + 2], fbr[75], fbr[67], fbr[6]], [0x34, 0x02, 64, 0x00], 'outline bytes');
assert.ok(logik.BLOECKE.every(function (b, i) { return b[8] === logik.FARBEN[67 + i][0]; }), 'outline key per block = colour 67 + block');
assert.deepStrictEqual(logik.nachtPruefen({ an: true, farben: { rand_5r: 'FFFFFF' }, optionen: {} }).farben, { rand_5r: 'FFFFFF' }, 'night outline');
// colours per symbol (0.34.0): primary, secondary, outline per symbol; 'none' only for outlines; 3D edge of symbols off by default
assert.strictEqual(logik.SYMF.length, 3 * 39, '39 symbols × 3'); assert.strictEqual(logik.INHALTE.length - logik.W_FEST, 39);
var fs3 = logik.farbenPruefen({ sy3p: 'ff0000', sy3s: 'none', sy3r: 'none', sy4r: 'XX', sr_freude: 'none', sf_freude: 'none', kante: 'none', sy38p: '00ff00' });
assert.deepStrictEqual([fs3.sy3p, fs3.sy3s, fs3.sy3r, fs3.sy4r, fs3.sr_freude, fs3.sf_freude, fs3.kante, fs3.sy38p, fs3.sy0p],
                       ['FF0000', '', 'none', '', 'none', '', 'AA00AA', '00FF00', ''], 'none only for outlines');
var u3 = logik.anUhr({ farben: fs3, optionen: logik.optionenPruefen({ sym3d: true }) }, logik.nachtPruefen({ an: true, farben: { sy3r: '0000FF' }, optionen: {} }));
assert.deepStrictEqual(u3.SYMFARBEN.slice(9, 12), [0x30, 64, 128], 'symbol 3: red, family, no outline');
assert.deepStrictEqual(u3.SYMFARBEN_N.slice(9, 12), [0x30, 64, 0x03], 'night: own outline blue');
assert.strictEqual(u3.SYMFARBEN[38 * 3], 0x0C, 'fluffy cloud green'); assert.strictEqual(u3.FARBEN[82], 128, 'positive symbols: no outline');
assert.strictEqual(u3.SCHALTER & 2, 2, '3D symbols bit 1'); assert.strictEqual(logik.optionenPruefen(null).sym3d, false, '3D symbols off by default');
assert.deepStrictEqual(logik.nachtPruefen({ an: true, farben: { sy1p: 'none', sy1r: 'none', sr_mond: '' }, optionen: {} }).farben, { sy1r: 'none', sr_mond: '' });
assert.ok(!('sy3p' in logik.kompakt({ farben: logik.farbenPruefen(null), optionen: logik.optionenPruefen(null) }).farben), 'compact: empty symbol colours left out');
var nf = logik.nachtPruefen({ an: true, farben: { kante_2l: '', sf_pfeil: 'FFFF00', grund: '' }, optionen: {} });
assert.deepStrictEqual(nf.farben, { kante_2l: '', sf_pfeil: 'FFFF00' }, 'night may set an inherited colour, not the background');
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
[[13, 13], [64, 64], [87, 87], [11, 11], [4, 0], [10, 0], [12, 0], [18, 0], [41, 0], [88, 88], [97, 97], [98, 98], [102, 102], [103, 0], [30, 30], [31, 31], [29, 0], [20, 0], [1.5, 0], ['13', 0]].forEach(function (f) {
  assert.strictEqual(logik.optionenPruefen({ zweit_1l: f[0] }).zweit_1l, f[1], 'second ' + f[0]);
});
assert.deepStrictEqual(logik.INHALTE.slice(logik.W_FEST), require('../../src/pkjs/symbole').namen, 'names as in tools/symbole.py');
var us = logik.anUhr({ farben: {}, optionen: logik.optionenPruefen({ saeulen: false }) }, logik.nachtPruefen({ an: true, optionen: { saeulen: true } }));
assert.deepStrictEqual([logik.anUhr({ farben: {}, optionen: logik.optionenPruefen(null) }, logik.nachtPruefen(null)).SCHALTER, us.SCHALTER, us.SCHALTER_N], [93, 92, 93], 'columns (0.24.0); default: day, twilight, night, stripes solid');
var uh = logik.anUhr({ farben: {}, optionen: logik.optionenPruefen({ regen_hinter: true }) }, logik.nachtPruefen(null));
assert.strictEqual(uh.SCHALTER, 93, 'bit 1 unused since 0.33.0'); assert.deepStrictEqual(uh.EBENEN, [1, 2, 0, 3, 4, 5, 6, 7, 8], 'rain behind the day → layer order (0.33.0)');
// layers (0.33.0): default, valid orders only, night of its own and from regen_hinter, compact presets without the default
assert.strictEqual(logik.optionenPruefen(null).ebenen, '012345678'); assert.deepStrictEqual(uh.EBENEN_N, uh.EBENEN, 'night like the day');
assert.strictEqual(logik.optionenPruefen({ ebenen: '876543210', regen_hinter: true }).ebenen, '876543210', 'order wins over the old switch');
['012345677', '01234567', '0123456789', 12345678, null].forEach(function (e) { assert.strictEqual(logik.optionenPruefen({ ebenen: e }).ebenen, '012345678', 'invalid ' + e); });
assert.deepStrictEqual(logik.nachtPruefen({ an: true, optionen: { regen_hinter: true } }).optionen, { ebenen: '120345678' }, 'night regen_hinter taken over');
assert.deepStrictEqual(logik.nachtPruefen({ an: true, optionen: { ebenen: 'x' } }).optionen, {}, 'invalid night order dropped');
var un = logik.anUhr({ farben: {}, optionen: logik.optionenPruefen(null) }, logik.nachtPruefen({ an: true, optionen: { ebenen: '012345687' } }));
assert.deepStrictEqual([un.EBENEN, un.EBENEN_N], [[0, 1, 2, 3, 4, 5, 6, 7, 8], [0, 1, 2, 3, 4, 5, 6, 8, 7]]);
assert.ok(!('ebenen' in logik.kompakt({ farben: logik.farbenPruefen(null), optionen: logik.optionenPruefen(null) }).optionen), 'compact: default order left out');
assert.ok(!('regen_hinter' in logik.optionenPruefen({ regen_hinter: true })), 'old switch no longer stored');
var so = logik.optionenPruefen({ sonne_tag: false, sonne_daemmerung: false, sonne_nacht: false, sonne_streifen: true, streifen_voll: false, staerke_s: 9 });
assert.strictEqual(logik.anUhr({ farben: {}, optionen: so }, logik.nachtPruefen(null)).SCHALTER, 1 | 32, 'stripes only, dashed (0.26.0)');
assert.deepStrictEqual(logik.linienBytes(so), [2, 1, 0, 9, 2], 'stripe width in LINIEN byte 3, baro 2 px');
// baro width 1–20 px (0.31.0): LINIEN byte 4; the index dicke_d until 0.30.0 is taken over, day and night
assert.deepStrictEqual([0, 1, 3].map(function (i) { return logik.optionenPruefen({ dicke_d: i }).staerke_d; }), [1, 2, 4], 'old baro index');
assert.deepStrictEqual([logik.optionenPruefen({ staerke_d: 25 }).staerke_d, logik.optionenPruefen({ staerke_d: 0 }).staerke_d], [2, 2]);
var bd = logik.anUhr({ farben: {}, optionen: logik.optionenPruefen({ staerke_d: 17 }) }, logik.nachtPruefen({ an: true, optionen: { dicke_d: 0 } }));
assert.deepStrictEqual([bd.LINIEN[4], bd.OPTIONEN >> 27 & 3, bd.LINIEN_N[4], bd.OPTIONEN_N >> 27 & 3], [17, 3, 1, 0], 'baro 17 px by day, old night 1 px');
assert.deepStrictEqual(logik.nachtPruefen({ an: true, optionen: { dicke_d: 2 } }).optionen, { staerke_d: 3 }, 'night: old index becomes px');
assert.strictEqual(logik.optionenPruefen({ staerke_s: 25 }).staerke_s, 2);
assert.strictEqual(logik.anUhr({ farben: {}, optionen: logik.optionenPruefen(null) }, logik.nachtPruefen({ an: true, optionen: { sonne_tag: false } })).SCHALTER_N, 89, 'night without the day area');
assert.strictEqual(logik.nachtPruefen({ an: true, optionen: { zweit_1l: 72 } }).optionen.zweit_1l, 72, 'night: second symbol');
assert.deepStrictEqual(logik.anUhr({ farben: {}, optionen: logik.optionenPruefen({ zweit_5r: 76 }) }, logik.nachtPruefen(null)).ZELLEN, [0, 0, 0, 0, 0, 0, 0, 76]);
[[17, 17], [18, 18], [19, 19], [20, 20], [31, 31], [32, 32], [33, 1], [63, 1], [64, 64], [87, 87], [97, 97], [98, 98], [102, 102], [103, 1], [-1, 1], [2.5, 1]].forEach(function (f) {   // 18 pressure curve, 64–87 fixed (0.23.0), 19 free text (0.28.0), 20–31 and 88–97 (0.30.0), 98–102 (0.34.0)
  assert.strictEqual(logik.optionenPruefen({ inhalt_2l: f[0] }).inhalt_2l, f[1], 'content ' + f[0]);
});
assert.strictEqual(logik.optionenPruefen({ schwelle: 9 }).schwelle, 1, 'invalid threshold → 0.2');
assert.strictEqual(logik.optionenPruefen({ staerke_v: 25 }).staerke_v, 2, 'above 20 px → default');
assert.strictEqual(logik.optionenPruefen(null).regen_rel, false, 'default: fixed scale');
assert.strictEqual(logik.optionenPruefen({ regenlage: 1 }).regen_rel, true, '"bottom" from 0.13–0.17 stays relative');
assert.strictEqual(logik.optionenZahl(logik.optionenPruefen({ regen_rel: true })) >> 25 & 1, 1, 'bit 25');
// 24-hour axis and free text (0.28.0): one character per digit cell, 4 at most, only characters the watch has
var o28 = logik.optionenPruefen({ achse24: true, inhalt_1l: 19, text_1l: 'Hallo', inhalt_5r: 19, text_5r: 'ab', text_2l: 'nicht gezeigt' });
assert.strictEqual(o28.achse, 1, 'achse24 from 0.28.0 becomes axis 1'); assert.strictEqual(logik.optionenPruefen(null).achse, 0, 'axis 04–20 h by default');
assert.ok(!('achse24' in o28), 'old key is not kept');
assert.strictEqual(logik.schalterZahl(o28) >> 7 & 1, 1, 'SCHALTER bit 7'); assert.strictEqual(logik.schalterZahl(logik.optionenPruefen(null)) >> 7 & 1, 0);
assert.strictEqual(o28.text_1l, 'Hall', 'stored as typed, 4 at most'); assert.strictEqual(logik.optionenPruefen({ text_1l: 5 }).text_1l, '', 'only strings');
assert.strictEqual(logik.TEXT_MAX, 4);
assert.deepStrictEqual(logik.textCodes('wélt'), [87, 69, 76, 84], 'upper case, é → E');
assert.deepStrictEqual(logik.textCodes('Grüße'), [71, 82, 98, 83], 'ü = 98, ß → SS, cut at 4');
assert.deepStrictEqual(logik.textCodes('#a~b'), [65, 66], 'characters without a letter on the watch are left out');
assert.deepStrictEqual(logik.textCodes('-1°♥'), [45, 49, 99, 100], 'minus, digit, degree, heart');
var sc = require('../../src/pkjs/schrift');
'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ!?.,:\'+/=°♥()%_'.split('').forEach(function (ch) {
  assert.ok(sc.glyphen[logik.textCodes(ch)[0]], 'letter for ' + ch);
});
var tb = logik.texteBytes(o28);
assert.deepStrictEqual(tb, [4, 72, 65, 76, 76, 0, 0, 0, 0, 0, 0, 2, 65, 66], 'per block length + codes, only blocks with free text');
var u28 = logik.anUhr({ farben: logik.farbenPruefen(null), optionen: o28 }, logik.nachtPruefen({ an: true, optionen: { inhalt_1l: 0 }, farben: {} }));
assert.deepStrictEqual(u28.TEXTE, tb); assert.strictEqual(u28.TEXTE_N[0], 0, 'night without the text in block 0');
assert.strictEqual(u28.SCHALTER_N >> 7 & 1, 1, 'night takes the axis from the day');
var n28 = logik.nachtPruefen({ an: true, optionen: { text_1l: 'Mond', achse24: false, text_2l: 7 }, farben: {} });
assert.deepStrictEqual(n28.optionen, { text_1l: 'Mond', achse: 0 }, 'night: text and axis of its own (achse24 taken over)');
// night axis 16–08 h (0.29.0): SCHALTER bits 7–8 = 2, invalid values fall back to 04–20 h
var o29 = logik.optionenPruefen({ achse: 2 });
assert.strictEqual(o29.achse, 2); assert.strictEqual(logik.schalterZahl(o29) >> 7 & 3, 2, 'SCHALTER bits 7–8');
assert.strictEqual(logik.optionenPruefen({ achse: 3 }).achse, 0); assert.strictEqual(logik.optionenPruefen({ achse: 1.5 }).achse, 1, 'floored like other numbers');
assert.strictEqual(logik.nachtPruefen({ an: true, optionen: { achse: 2 }, farben: {} }).optionen.achse, 2, 'night axis on its own');
var u29 = logik.anUhr({ farben: logik.farbenPruefen(null), optionen: logik.optionenPruefen(null) }, logik.nachtPruefen({ an: true, optionen: { achse: 2 }, farben: {} }));
assert.strictEqual(u29.SCHALTER >> 7 & 3, 0); assert.strictEqual(u29.SCHALTER_N >> 7 & 3, 2, 'day 04–20 h, night 16–08 h');
assert.ok(/past_days=1/.test(logik.wetterUrl(50.1, 8.7)), 'request with yesterday');
// evening before (0.29.0): on 13 Oct the 12th from 16 h is in the response — rain 16–17 h = value at 17 h, 23–24 h = 00 h of the 13th
var pv = logik.wetterPaket(j, Date.parse('2026-10-13T08:00:00Z')).bytes, V = 212;
var k16 = h.time.indexOf('2026-10-12T16:00'), k17 = h.time.indexOf('2026-10-12T17:00'), k23 = h.time.indexOf('2026-10-12T23:00'), m0 = h.time.indexOf('2026-10-13T00:00');
assert.strictEqual(pv[V], Math.round(h.precipitation[k17] * 10), 'rain 16–17 h yesterday');
assert.strictEqual(pv[V + 7], Math.round(h.precipitation[m0] * 10), 'rain 23–24 h yesterday = value at midnight');
assert.strictEqual(pv[V + 8], Math.round(h.pressure_msl[k16] * 2 - 1900), 'pressure 16 h yesterday');
assert.strictEqual(pv[V + 15], Math.round(h.pressure_msl[k23] * 2 - 1900), 'pressure 23 h yesterday');
assert.strictEqual((pv[V + 16] << 24) >> 24, Math.round(h.temperature_2m[k16]), 'temperature 16 h yesterday');
var pf = logik.wetterPaket(j, Date.parse('2026-10-11T08:00:00Z')).bytes;   // the response starts on the 11th: no day before
assert.strictEqual(pf[V], 255, 'without the day before in the response: missing'); assert.strictEqual(pf[V + 8], 255); assert.strictEqual(pf[V + 16], 128);
console.log('0.29.0 ok: night axis, evening before ' + pv.slice(V, V + 8).join(','));
console.log('0.28.0 ok: axis bit, text codes', tb.join(','));
console.log('night ok: options 160194816, blocks, threshold, night theme, presets');
// stock presets (since 0.20.0): six (Retro since 0.27.0), complete, all with valid packets for the watch; since 0.21.0 night looks as presets of their own
var vl = logik.vorlagen();
assert.deepStrictEqual(vl.map(function (p) { return p.name; }), ['Neon', 'Neon Night', 'Paper', 'Paper Night', 'Sundial', 'Terminal', 'Minimal', 'Minimal Night',
  'Retro', 'Retro Night', 'Dusk', 'Dusk Night', 'Signal', 'Signal Night']);   // 0.30.0: Minimal with a night look, Dusk and Signal with one
assert.deepStrictEqual(logik.vorlagenBasis().map(function (p) { return p.name; }), vl.filter(function (p) { return !/ Night$/.test(p.name); }).map(function (p) { return p.name; }));
vl.forEach(function (p) {                                 // stock presets are valid as they are: nothing falls back to the default unseen
  var u = logik.anUhr(p.tag, p.nacht);
  assert.ok(u.BLOECKE.every(function (b) { return logik.inhaltGueltig(b); }) && u.ZELLEN.every(function (b) { return logik.istZelle(b); }), p.name);
});
logik.vorlagenBasis().slice(6).forEach(function (p) { assert.strictEqual(p.nacht.an, true, p.name + ' with a night look'); });
vl.forEach(function (p) {
  var u = logik.anUhr(p.tag, p.nacht);
  assert.strictEqual(u.FARBEN.length, 83, p.name); assert.strictEqual(u.SYMFARBEN.length, 117, p.name); assert.strictEqual(u.EBENEN.length, 9, p.name); assert.strictEqual(u.BLOECKE.length, 8, p.name); assert.strictEqual(u.LINIEN.length, 5, p.name);
});
assert.strictEqual(vl[2].tag.farben.grund, 'FFFFFF'); assert.strictEqual(vl[2].nacht.farben.grund, '000000', 'Paper inverted at night');
assert.deepStrictEqual(vl[3].tag, logik.nachtThema(vl[2].tag, vl[2].nacht), 'Paper Night = night look of Paper');
assert.strictEqual(vl[3].nacht.an, false); assert.strictEqual(vl[1].tag.farben.ziffer, 'AA55AA', 'Neon Night dimmed');
assert.strictEqual(vl[5].tag.optionen.inhalt_1l, 4, 'Terminal: high at the top left');
var re = logik.anUhr(vl[8].tag, vl[8].nacht);   // Retro (0.27.0, Seb's preset): sun, cross 10 px, columns off; night white, no rain, no sun
assert.deepStrictEqual([re.OPTIONEN >> 16 & 1, re.LINIEN[0], re.LINIEN[1], re.SCHALTER & 1, re.NACHTMODUS], [1, 10, 10, 0, 1]);
assert.deepStrictEqual([re.OPTIONEN_N >> 16 & 1, re.OPTIONEN_N >> 11 & 3, re.LINIEN_N[1], re.FARBEN_N[5]], [0, 2, 5, 0x3F], 'Retro night');
console.log('presets ok: ' + vl.length);

// ---------- 0.30.0 ----------
// second packet: rain chance (hour h to h+1 = value at h+1), UV and wind at h; missing fields = 255
var w2 = JSON.parse(JSON.stringify(j));
w2.hourly.precipitation_probability = w2.hourly.time.map(function (t, i) { return i % 101; });
w2.hourly.uv_index = w2.hourly.time.map(function (t, i) { return (i % 9) * 0.8; });
w2.hourly.wind_speed_10m = w2.hourly.time.map(function (t, i) { return i * 1.7; });
var q = logik.wetter2Paket(w2, Date.parse('2026-10-12T08:00:00Z')), z14 = h.time.indexOf('2026-10-12T14:00'), m23 = h.time.indexOf('2026-10-13T23:00');
assert.strictEqual(q.length, 144, '2 days × 72');
assert.strictEqual(q[14], (z14 + 1) % 101, 'rain chance 14–15 h = value at 15 h');
assert.strictEqual(q[24 + 14], Math.round((z14 % 9) * 0.8), 'UV 14 h'); assert.strictEqual(q[48 + 14], Math.round(z14 * 1.7), 'wind 14 h');
assert.strictEqual(q[72 + 48 + 23], Math.min(254, Math.round(m23 * 1.7)), 'wind 23 h tomorrow');
var qr = logik.wetter2Paket(j, Date.parse('2026-10-12T08:00:00Z'));   // the saved response has rain chance and wind, no UV
assert.strictEqual(qr[14], h.precipitation_probability[z14 + 1], 'real rain chance 14–15 h'); assert.strictEqual(qr[48 + 14], Math.round(h.wind_speed_10m[z14]), 'real wind 14 h');
assert.ok(qr.slice(24, 48).every(function (b) { return b === 255; }), 'UV missing in the response = 255');
console.log('second packet real: rain chance', qr.slice(0, 24).join(','), '| wind', qr.slice(48, 72).join(','));
assert.ok(/precipitation_probability,uv_index,wind_speed_10m/.test(logik.wetterUrl(50.1, 8.7)), 'request with the new fields');
// main colour: colours from before 0.30.0 keep their look, equal digit colours inherit; with 'haupt' nothing is converted
var alt = logik.farbenPruefen({ ziffer: 'FF0000', z_tag: 'ff0000', z_min: '0055FF', grund: 'FFFFFF' });
assert.deepStrictEqual([alt.haupt, alt.ziffer, alt.z_tag, alt.z_min, alt.z_auf, alt.grund], ['FF0000', '', '', '0055FF', 'FFFFFF', 'FFFFFF'], 'migration');
var neu = logik.farbenPruefen({ haupt: '00FF00', ziffer: '00FF00', z_tag: '' });
assert.deepStrictEqual([neu.haupt, neu.ziffer, neu.z_tag, neu.z_min], ['00FF00', '00FF00', '', ''], 'no migration with a main colour');
assert.deepStrictEqual(logik.farbenPruefen({}).haupt, 'FFFFFF'); assert.strictEqual(logik.farbenPruefen({ sk_mond: '', sf_freude: 'FF0000' }).sf_freude, 'FF0000');
var vr = logik.vorlagen()[8].tag.farben;                // Retro: red main colour, blue digits stay, rows 1/5 stay white
assert.deepStrictEqual([vr.haupt, vr.ziffer, vr.z_tag, vr.z_monat, vr.z_auf], ['FF0000', '', '', '0055FF', 'FFFFFF'], 'Retro after the migration');
// compact presets: always with the main colour, back to the same full preset
var voll = logik.presetsPruefen([{ name: 'X', tag: { farben: logik.farbenPruefen({ haupt: 'FFFFFF', grund: '000055' }), optionen: logik.optionenPruefen({ zeile1: true }) }, nacht: logik.nachtPruefen(null) }]);
var kp = logik.kompaktListe(voll);
assert.deepStrictEqual(kp[0].tag, { farben: { haupt: 'FFFFFF', grund: '000055' }, optionen: { zeile1: true } }, 'only differences plus the main colour');
assert.deepStrictEqual(logik.presetsPruefen(kp), voll, 'compact → full');
assert.deepStrictEqual(logik.presetsPruefen(logik.kompaktListe(logik.vorlagenBasis()), Infinity), logik.vorlagenBasis(), 'stock presets survive');
assert.strictEqual(logik.presetsPruefen(logik.vorlagen().concat(logik.vorlagen())).length, 20, 'own presets stay at 20');
assert.ok(JSON.stringify(logik.kompaktListe(logik.vorlagenBasis())).length < JSON.stringify(logik.vorlagenBasis()).length / 3, 'a third at most');
// Base64 page: UTF-8 survives
var html = '<p>Grüße ♥ “x” {"a": 1}</p>'.repeat(5), url = logik.seitenUrl(html);
assert.ok(url.indexOf('data:text/html;charset=utf-8;base64,') === 0); assert.strictEqual(Buffer.from(url.split(',')[1], 'base64').toString('utf8'), html);
['', 'a', 'ab', 'abc', 'abcd'].forEach(function (t) { assert.strictEqual(Buffer.from(logik.seitenUrl(t).split(',')[1], 'base64').toString(), t, 'padding ' + t.length); });
// GLOBAL: time format and weekday language
assert.strictEqual(logik.anUhr(tag, n).GLOBAL, 0, 'default: like the watch, English');
assert.strictEqual(logik.anUhr(tag, n, { zeitformat: 2, sprache: 'de' }).GLOBAL, 6); assert.strictEqual(logik.anUhr(tag, n, { zeitformat: 1, sprache: 'en' }).GLOBAL, 1);
assert.deepStrictEqual(logik.globalPruefen({ zeitformat: 7 }), { zeitformat: 0 });
assert.deepStrictEqual([30, 31, 29, 97].map(logik.istZelle), [true, true, false, true], 'battery and phone are cells, numbers are not');
assert.deepStrictEqual(logik.INHALTE.slice(20, 32), ['Weekday', 'Battery %', 'Steps', 'Heart rate', 'Rain chance now', 'Rain chance 12 h', 'UV index now', 'UV index max', 'Wind now', 'Gusts now', 'Battery low', 'Phone disconnected']);
console.log('0.30.0 ok: second packet, main colour, compact presets, Base64 page, GLOBAL');
// time zone names (0.36.0) without Intl: offsets in January and July, table of zones with DST; Node takes TZ at runtime
[['Europe/Berlin', 'de', [60, 'MEZ', 120, 'MESZ']], ['Europe/Berlin', 'en', [60, 'CET', 120, 'CEST']], ['Europe/London', 'en', [0, 'GMT', 60, 'BST']],
 ['America/Chicago', 'de', [-360, 'CST', -300, 'CDT']], ['Australia/Sydney', 'en', [600, 'AEST', 660, 'AEDT']],
 ['Asia/Kolkata', 'en', [330, '', 330, '']], ['UTC', 'de', [0, 'UTC', 0, 'UTC']]].forEach(function (f) {
  process.env.TZ = f[0];
  var b = logik.zonenBytes(Date.UTC(2026, 9, 23, 10), f[1]), aus = [];
  for (var i = 0; i < 2; i++) { var m = b[6 * i] << 8 | b[6 * i + 1]; aus.push(m > 32767 ? m - 65536 : m, String.fromCharCode.apply(null, b.slice(6 * i + 2, 6 * i + 6).filter(Boolean))); }
  assert.deepStrictEqual(aus, f[2], f[0] + ' ' + f[1]); assert.strictEqual(b.length, 12);
});
delete process.env.TZ;
assert.ok(!/Intl\./.test(require('fs').readFileSync(require('path').resolve(__dirname, '../../src/pkjs/logik.js'), 'utf8').replace(/\/\/.*$/gm, '')),
          'no Intl in the phone script: it kills the JS engine of the emulator');
console.log('0.36.0 ok: time zone names for 7 zones, no Intl');
