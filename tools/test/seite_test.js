// Plays through the settings page with a mocked Pebble, document and canvas: sections, blocks, night, presets, language, saving.
// Run: node tools/test/seite_test.js   (python3 tools/seite_erzeugen.py first; bauen.sh does that anyway)
var assert = require('assert'), path = require('path');
var speicher = {}, url = null, gesendet = [], h = {};
global.localStorage = { getItem: function (k) { return k in speicher ? speicher[k] : null; }, setItem: function (k, v) { speicher[k] = String(v); },
                        removeItem: function (k) { delete speicher[k]; } };
global.Pebble = { addEventListener: function (n, f) { h[n] = f; }, openURL: function (u) { url = u; }, sendAppMessage: function (d) { gesendet.push(d); } };
global.navigator = {};
require(path.resolve(__dirname, '../../src/pkjs/index.js'));
var logik = require(path.resolve(__dirname, '../../src/pkjs/logik.js'));

// Settings from 0.8.0–0.13.0 are taken over: date bars, rain at the bottom, sun rows; bar colour from 0.4.0
speicher.optionen = JSON.stringify({ datumbalken: true, regenunten: true, sonnenzeilen: true, dicke_v: 3 });   // dicke_v: index from 0.14.0
speicher.balken = '0000AA';
h.ready();
var d0 = gesendet[0];
assert.strictEqual(d0.BEREIT, 1); assert.strictEqual(d0.FARBEN.length, 67); assert.strictEqual(d0.FARBEN[8], 0x02, 'old bar colour blue');
assert.strictEqual(d0.OPTIONEN & 511, 4 + 8 + 256, 'row 2 left/right from the date bars, time');
assert.strictEqual(d0.OPTIONEN >> 11 & 3, 1, 'rain at the bottom taken over');
assert.strictEqual(d0.OPTIONEN >> 25 & 1, 1, 'whoever had bottom stays relative');
assert.strictEqual(d0.OPTIONEN >> 29 & 3, 3, 'rows 1 and 5 from the sun rows');
assert.deepStrictEqual(d0.BLOECKE, [5, 6, 1, 2, 3, 4, 7, 8], 'default blocks');
assert.deepStrictEqual(d0.LINIEN, [4, 1, 0, 2], 'width from 0.14.0 taken over (index 3 = 4 px), no frame, sun stripes 2 px');
assert.strictEqual(d0.NACHTMODUS, 0); assert.deepStrictEqual(d0.FARBEN_N, d0.FARBEN, 'night like day');

function seitenHtml() { return Buffer.from(url.replace('data:text/html;charset=utf-8;base64,', ''), 'base64').toString('utf8'); }   // Base64 since 0.30.0
function vollP(p) { return logik.presetsPruefen([p])[0]; }   // presets come back compact since 0.30.0
function oeffnen() {
  h.showConfiguration();
  var html = seitenHtml();
  var el = {}, zeichnungen = { n: 0 };
  global.knoten = function (id) { return el[id] || (el[id] = { id: id, innerHTML: '', value: '' }); };
  knoten('v').getContext = function () { return { fillRect: function () { zeichnungen.n++; }, fillText: function () {}, strokeText: function () {},
    beginPath: function () {}, moveTo: function () {}, lineTo: function () {}, stroke: function () {} }; };
  global.document = { getElementById: knoten, location: '' };
  new Function(html.split('<script>')[1].split('</script>')[0])();
  return zeichnungen;
}
function klick(attr, wert) { knoten('inhalt').onclick({ target: { getAttribute: function (a) { return a === attr ? wert : null; }, parentNode: null } }); }
function waehle(schluessel, wert) { knoten('inhalt').onchange({ target: { getAttribute: function (a) { return a === 'data-in' ? schluessel : null; }, value: String(wert) } }); }
function regel(k, v) {                                     // drag the slider and let go
  var t = { getAttribute: function (a) { return a === 'data-rg' ? k : null; }, value: String(v) };
  knoten('inhalt').oninput({ target: t }); knoten('inhalt').onchange({ target: t });
}
function zaehle(re) { return (knoten('inhalt').innerHTML.match(re) || []).length; }
function hat(text) { return knoten('inhalt').innerHTML.indexOf(text) >= 0; }
function antwort() { knoten('ok').onclick(); return JSON.parse(decodeURIComponent(document.location.split('#')[1])); }

var zn = oeffnen();
assert.strictEqual(zaehle(/class='sek'/g), 8, 'eight sections'); assert.strictEqual(zaehle(/data-sw=/g), 0, 'all collapsed');
assert.ok(zn.n > 50, 'preview drawn');
assert.ok(hat("data-sp='en' class='a'") && hat('Rows &amp; content') === false && hat('Rows & content'), 'English by default');
assert.strictEqual(knoten('ok').textContent, 'Save'); assert.strictEqual(knoten('hw').textContent, 'Preview with sample data, simplified font');
// Numbers and bars: change blocks, bar and colour per block
klick('data-sek', 'zahlen');
assert.strictEqual(zaehle(/<select data-in=/g), 8, 'eight blocks'); assert.strictEqual(zaehle(/<option /g), 8 * 66, '66 contents each (0.30.0)'); assert.strictEqual(zaehle(/<optgroup /g), 56, 'seven groups per block');
waehle('inhalt_2l', 4);                                     // row 2 left: high instead of day
klick('data-sw', 'balken_1l');
klick('data-k', 'z_auf2'); assert.strictEqual(zaehle(/class='f/g), 65, 'palette with "main color" (0.30.0)'); klick('data-c', 'FFAA00');
// Symbols and curve (0.22.0): the preview draws them, curve colours selectable
assert.ok(!hat("data-sek='kurven'"), 'no curve in use: no Curves section (0.30.0)');
var vorZ = zn.n; waehle('inhalt_1l', 10); waehle('inhalt_1r', 12); waehle('inhalt_5l', 13); waehle('inhalt_5r', 17);
klick('data-sek', 'kurven');                              // section Curves (0.23.0): five colours per curve; since 0.30.0 only the curves in use
assert.strictEqual(zaehle(/data-k='b_kurve'/g), 0, 'pressure curve not in use: its colours hidden');
waehle('inhalt_4l', 18);                                   // pressure curve in the preview
['kurve', 'k_kante', 'k_rand', 'k_punkt', 'k_pkante', 'b_kurve', 'b_kante', 'b_rand', 'b_punkt', 'b_pkante'].forEach(function (k) {
  assert.strictEqual(zaehle(new RegExp("data-k='" + k + "'", 'g')), /^(kurve|k_kante|b_kurve|b_kante)$/.test(k) ? 2 : 1, 'colour ' + k + ' (0.28.0: line and edge also in the curve block card)');
});
klick('data-k', 'k_kante'); klick('data-c', '0055AA'); klick('data-k', 'b_rand'); klick('data-c', 'FFFFFF'); klick('data-sek', 'kurven');
assert.strictEqual(zaehle(/data-in='zweit_/g), 2, 'right cell only with symbols (row 5); curve and baro with hPa take the whole block');
waehle('inhalt_1l', 13); waehle('zweit_1l', 72); waehle('zweit_5l', 76);   // umbrella + fixed windsock, umbrella + fixed sun and cloud
assert.strictEqual(zaehle(/data-in='zweit_1l'/g), 1); assert.ok(hat("<optgroup label='Date &amp; time'>") || hat("<optgroup label='Date & time'>"));
assert.strictEqual((knoten('inhalt').innerHTML.split("data-in='zweit_1l'")[1].split('</select>')[0].match(/<option /g) || []).length, 43, 'right: empty, 8 smart, 8 positive, 26 fixed');
for (var wi = 9; wi <= 31; wi++) { waehle('inhalt_4r', wi); waehle('zweit_4r', wi === 30 ? 31 : 0); }   // every kind once in the preview (0.30.0: 20–31)
logik.INHALTE.map(function (n, j) { return j; }).slice(64).forEach(function (w) { waehle('inhalt_4r', w); waehle('zweit_4r', 161 - w); });
waehle('inhalt_4l', 3);
assert.strictEqual(antwort().tag.optionen.zweit_1l, 72); assert.strictEqual(antwort().tag.farben.b_rand, 'FFFFFF');
waehle('inhalt_4r', 4); waehle('inhalt_1l', 5); waehle('inhalt_1r', 6); waehle('inhalt_5l', 7); waehle('inhalt_5r', 8);
assert.strictEqual(antwort().tag.farben.k_kante, '0055AA');
var a = antwort();
assert.strictEqual(a.tag.optionen.inhalt_2l, 4); assert.strictEqual(a.tag.optionen.balken_1l, true); assert.strictEqual(a.tag.farben.z_auf2, 'FFAA00');
// Rain, baro, lines
assert.ok(knoten('inhalt').innerHTML.indexOf("data-sek='presets'") < knoten('inhalt').innerHTML.indexOf("data-sek='zahlen'"), 'presets first (0.25.0)');
klick('data-sek', 'regen'); klick('data-rd', 'regenlage:2'); assert.strictEqual(zaehle(/data-sw='regen_rel'/g), 0, 'rain off: scale hidden');
klick('data-rd', 'regenlage:1'); assert.ok(zaehle(/data-ch='schwelle:/g) === 5, 'threshold with rain at the bottom');
klick('data-ch', 'schwelle:4'); klick('data-rd', 'regenlage:0'); assert.strictEqual(zaehle(/data-ch='schwelle:/g), 5, 'threshold stays (relative on)');
klick('data-sw', 'regen_rel'); assert.strictEqual(zaehle(/data-ch='schwelle:/g), 0, 'threshold only with the relative scale');
klick('data-sek', 'druck'); klick('data-ch', 'druckvoll:1'); klick('data-ch', 'dicke_d:3'); klick('data-rd', 'drucklage:2');
klick('data-sek', 'linien'); assert.strictEqual(zaehle(/type='range'/g), 1, 'one slider: horizontal line off, its options hidden');
regel('staerke_v', 1); klick('data-sw', 'tageslinie'); regel('staerke_h', 20);
klick('data-ch', 'voll_v:1'); klick('data-ch', 'voll_h:0'); klick('data-sw', 'regen_vorn');
klick('data-sw', 'rahmen_z'); klick('data-k', 'rahmen_z'); klick('data-c', 'FF00FF');
assert.ok(hat("value='20'"), 'slider shows 20');
a = antwort().tag.optionen;
assert.deepStrictEqual([a.regenlage, a.regen_rel, a.schwelle, a.druckvoll, a.dicke_d, a.drucklage, a.staerke_v, a.tageslinie, a.staerke_h], [0, false, 4, true, 3, 2, 1, true, 20]);
// Night: switch on, change a block, reset the block, change a colour
klick('data-tab', 'nacht'); assert.ok(hat('Night mode is off'), 'hint night mode off');
klick('data-nm', '1'); assert.ok(!hat('Night mode is off'));
assert.ok(zaehle(/as day/g) > 20, 'at night everything "as day"');
waehle('inhalt_4r', 0); klick('data-sw', 'balken_4r');
assert.strictEqual(zaehle(/data-reset='blk:5'/g), 1, 'block with ↺');
klick('data-reset', 'blk:5'); assert.strictEqual(zaehle(/data-reset='blk:5'/g), 0, 'block back to day');
klick('data-sek', 'himmel'); klick('data-k', 'grund'); klick('data-c', '000055');
a = antwort();
assert.deepStrictEqual(a.nacht, { an: true, farben: { grund: '000055' }, optionen: {} });
// Presets (since 0.21.0: Load asks what for)
function bild(x) { return logik.nachtThema(x.tag, x.nacht); }
klick('data-sek', 'presets'); knoten('psname').value = 'Five rows'; klick('data-ps', 'neu');
assert.strictEqual(zaehle(/day &amp; night<\/small>|day & night<\/small>/g), 7, 'hint for Five rows and the six stock presets with a night look (0.30.0)');
klick('data-tab', 'tag'); waehle('inhalt_2l', 1);
assert.strictEqual(zaehle(/data-ps='wahl:v:/g), 14, '14 stock presets, night looks made by the page'); assert.strictEqual(zaehle(/data-ps='auf:/g), 0, 'choice closed');
klick('data-ps', 'wahl:p:0'); assert.strictEqual(zaehle(/data-ps='auf:/g), 3, 'day, night, both');
klick('data-ps', 'zu'); assert.strictEqual(zaehle(/data-ps='auf:/g), 0, 'cancel');
// For day: the day becomes Paper, the night looks as before
var vorher = antwort(); klick('data-ps', 'wahl:v:2'); klick('data-ps', 'auf:tag:v:2');
var a2 = antwort();
assert.strictEqual(a2.tag.farben.grund, 'FFFFFF', 'Paper by day'); assert.strictEqual(a2.nacht.an, true);
assert.deepStrictEqual(bild(a2), bild(vorher), 'night unchanged');
assert.ok(hat('“Paper” loaded for day'), 'message');
// For night: day look of Terminal (no night: only two targets) onto the night, the day stays
klick('data-ps', 'wahl:v:5'); assert.strictEqual(zaehle(/data-ps='auf:/g), 2, 'no night, no "both"');
klick('data-ps', 'auf:nacht:v:5');
var a3 = antwort();
assert.deepStrictEqual(a3.tag, a2.tag, 'day unchanged'); assert.deepStrictEqual(bild(a3), logik.vorlagen()[5].tag, 'night = Terminal');
logik.vorlagen().forEach(function (v, i) {                // the page's own night looks = logik.vorlagen()
  klick('data-ps', 'wahl:v:' + i); klick('data-ps', 'auf:beide:v:' + i);
  if (v.nacht.an) assert.deepStrictEqual([antwort().tag, antwort().nacht], [v.tag, v.nacht], 'stock preset ' + v.name);
  else klick('data-ps', 'zu');
});
klick('data-ps', 'wahl:v:5'); klick('data-ps', 'auf:nacht:v:5'); assert.deepStrictEqual(bild(antwort()), logik.vorlagen()[5].tag);
klick('data-ps', 'wahl:v:13'); klick('data-ps', 'auf:tag:v:13'); assert.deepStrictEqual(antwort().tag, logik.vorlagen()[13].tag, 'Signal Night onto the day');
klick('data-ps', 'wahl:v:2'); klick('data-ps', 'auf:tag:v:2'); klick('data-ps', 'wahl:v:5'); klick('data-ps', 'auf:nacht:v:5'); var a3 = antwort();
assert.ok(hat("data-nm='1'"), 'night tab');
// Night look as a preset onto the night, night mode was off: switches on
klick('data-nm', '1'); assert.strictEqual(antwort().nacht.an, false, 'night mode off');
klick('data-ps', 'wahl:v:3'); klick('data-ps', 'auf:nacht:v:3');
assert.strictEqual(antwort().nacht.an, true); assert.strictEqual(bild(antwort()).farben.grund, '000000', 'Paper Night');
// Both, as before
klick('data-ps', 'wahl:p:0'); klick('data-ps', 'auf:beide:p:0');
assert.strictEqual(antwort().tag.optionen.inhalt_2l, 4, 'preset loaded'); assert.deepStrictEqual(antwort().nacht, JSON.parse(JSON.stringify(a.nacht)));
klick('data-tab', 'tag');
// Save: the phone sends day, night and blocks
h.webviewclosed({ response: document.location.split('#')[1] });
var d = gesendet[gesendet.length - 1];
assert.strictEqual(d.BLOECKE[2], 4, 'block row 2 left = high'); assert.strictEqual(d.FARBEN[26], 0x38, 'digits row 1 right FFAA00');
assert.strictEqual(d.OPTIONEN & 1, 1, 'bar row 1 left'); assert.strictEqual(d.OPTIONEN >> 26 & 1, 1, 'baro continuous');
assert.strictEqual(d.OPTIONEN >> 27 & 3, 3, 'baro 4 px');
assert.deepStrictEqual([d.OPTIONEN >> 22 & 1, d.OPTIONEN >> 23 & 1, d.OPTIONEN >> 24 & 1], [1, 0, 0], 'vertical solid, horizontal dashed, no cut-through'); assert.deepStrictEqual(d.LINIEN, [1, 20, 1, 2], 'time lines 1 and 20 px, frame on, sun stripes 2 px');
assert.strictEqual(d.FARBEN[30], 0x33, 'frame colour FF00FF'); assert.strictEqual(d.ZELLEN.length, 8); assert.strictEqual(d.ZELLEN[0], 72, 'second symbol stays stored');
assert.strictEqual(d.NACHTMODUS, 1); assert.strictEqual(d.FARBEN_N[0], 0x01); assert.deepStrictEqual(d.BLOECKE_N, d.BLOECKE);
assert.strictEqual(JSON.parse(speicher.presets)[0].name, 'Five rows'); assert.ok(!('balken' in speicher));
assert.strictEqual(d.SCHALTER, 93, 'default: columns, day, twilight, night, stripes solid');
assert.strictEqual(speicher.sprache, 'en', 'language stored');
// Columns off (0.24.0, in the Background section since 0.25.0): the preview draws less, the phone sends bit 0 = 0
var mit = oeffnen().n; klick('data-sek', 'himmel'); assert.strictEqual(zaehle(/data-sw='regen_hinter'/g), 0, 'no sun position, no "rain behind the day"'); var ohne = { n: 0 }; knoten('v').getContext = function () { return { fillRect: function () { ohne.n++; },
  fillText: function () {}, strokeText: function () {}, beginPath: function () {}, moveTo: function () {}, lineTo: function () {}, stroke: function () {} }; };
klick('data-sw', 'saeulen'); assert.strictEqual(antwort().tag.optionen.saeulen, false); assert.ok(ohne.n > 0 && ohne.n < mit, 'preview without columns');
klick('data-sw', 'sonne'); klick('data-sw', 'regen_hinter'); assert.strictEqual(antwort().tag.optionen.regen_hinter, true, 'rain behind the day (0.25.0)');
h.webviewclosed({ response: document.location.split('#')[1] }); assert.strictEqual(gesendet[gesendet.length - 1].SCHALTER, 94, 'columns off, rain behind the day');
// Sun position (0.26.0): own section, sub-options per area, stripes
oeffnen(); klick('data-sek', 'sonne');
['sonne_nacht', 'sonne_daemmerung', 'verlauf', 'sonne_tag', 'sonne_streifen', 'regen_hinter'].forEach(function (k) {
  assert.strictEqual(zaehle(new RegExp("data-sw='" + k + "'", 'g')), 1, 'switch ' + k);
});
assert.strictEqual(zaehle(/data-rg='staerke_s'/g), 0, 'stripes off: no width');
klick('data-sw', 'sonne_streifen'); regel('staerke_s', 7); klick('data-ch', 'streifen_voll:0');
assert.strictEqual(zaehle(/data-k='s_auf'/g) + zaehle(/data-k='s_unter'/g), 2, 'colours sunrise and sunset');
klick('data-sw', 'sonne_daemmerung'); assert.strictEqual(zaehle(/data-sw='verlauf'/g), 0, 'twilight off: gradient hidden');
klick('data-sw', 'sonne_tag'); assert.strictEqual(zaehle(/data-sw='regen_hinter'/g), 0, 'no day and no twilight, no "rain behind …"');
antwort(); h.webviewclosed({ response: document.location.split('#')[1] });
var ds = gesendet[gesendet.length - 1];
assert.strictEqual(ds.SCHALTER, 2 | 16 | 32, 'rain behind (stays stored), night, stripes dashed'); assert.strictEqual(ds.LINIEN[3], 7, 'stripes 7 px');
// Default colours at night = all night colours back
oeffnen(); klick('data-tab', 'nacht'); assert.strictEqual(knoten('std').textContent, 'Night colors like day');
knoten('std').onclick(); assert.strictEqual(knoten('std').textContent, 'Sure? Tap again');
assert.notDeepStrictEqual(antwort().nacht.farben, {}, 'only after the second tap');
knoten('std').onclick(); assert.deepStrictEqual(antwort().nacht.farben, {}, 'night colours back to day');
// Share and import (0.27.0): code of an own preset, back in as a new preset; broken values fall back, junk is refused
oeffnen(); klick('data-sek', 'presets'); assert.strictEqual(zaehle(/data-ps='teilen:/g), 1, 'Share only for own presets');
klick('data-ps', 'teilen:0'); assert.ok(hat("id='pscode'"), 'code shown');
var code = knoten('inhalt').innerHTML.split("readonly>")[1].split('</textarea>')[0].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
var cp = JSON.parse(code); assert.strictEqual(cp.name, 'Five rows'); assert.strictEqual(cp.tag.optionen.inhalt_2l, 4); assert.strictEqual(cp.nacht.an, true);
var vor = JSON.parse(speicher.presets).length;
knoten('psimport').value = code.replace('Five rows', 'Shared'); klick('data-ps', 'import'); assert.ok(hat('“Shared” imported'), 'import message');
knoten('psimport').value = '{"name":"Bad","tag":{"farben":{"grund":"123456","regen":"ff0000"},"optionen":{"inhalt_2l":40,"zweit_1l":4,"zeile1":"yes","inhalt_4r":66}},"nacht":{"an":true,"farben":{"grund":"xx"},"optionen":{"zeile5":true}}}';
klick('data-ps', 'import');
knoten('psimport').value = 'hello'; klick('data-ps', 'import'); assert.ok(hat('That doesn’t look like a preset code.'));
var ai = antwort(), bad = vollP(ai.presets[vor + 1]);
assert.strictEqual(ai.presets.length, vor + 2); assert.deepStrictEqual(ai.presets[vor].tag, ai.presets[0].tag, 'shared = original');
assert.ok(cp.tag.farben.haupt && !('grund' in cp.tag.farben), 'code compact: main colour plus differences (0.30.0)');
assert.strictEqual(bad.tag.farben.grund, logik.STD.farben.grund, 'invalid colour → default (0.30.0)'); assert.strictEqual(bad.tag.farben.regen, 'FF0000');
assert.deepStrictEqual([bad.tag.optionen.inhalt_2l, bad.tag.optionen.zweit_1l, bad.tag.optionen.zeile1, bad.tag.optionen.inhalt_4r],
                       [logik.STD.optionen.inhalt_2l, 0, false, 66], 'broken options → default');
assert.deepStrictEqual(bad.nacht, { an: true, farben: {}, optionen: { zeile5: true } }, 'night: only valid differences');
klick('data-ps', 'wahl:p:' + (vor + 1)); klick('data-ps', 'auf:tag:p:' + (vor + 1)); assert.strictEqual(antwort().tag.optionen.inhalt_4r, 66, 'imported preset loads');
h.webviewclosed({ response: document.location.split('#')[1] });
assert.deepStrictEqual(JSON.parse(speicher.presets).map(function (p) { return p.name; }).slice(-2), ['Shared', 'Bad'], 'stored on the phone');
// 0.28.0: time axis, free text, 3D edge per block, symbol colours
var z8 = oeffnen(); klick('data-tab', 'tag'); klick('data-sek', 'regen');
assert.strictEqual(zaehle(/data-ch='achse:/g), 3, 'time axis 4–20 / 0–24 / 16–08 h'); assert.ok(hat("data-ch='achse:0' class='a'"), '04–20 h by default');
var vorA = z8.n; klick('data-ch', 'achse:1'); assert.strictEqual(antwort().tag.optionen.achse, 1);
assert.ok(z8.n - vorA > 0, 'preview drawn again'); klick('data-rd', 'regenlage:2'); assert.strictEqual(zaehle(/data-ch='achse:/g), 3, 'axis stays with rain off');
klick('data-rd', 'regenlage:0');
// 0.29.0: night axis 16–08 h, on the night tab only; preview at the sample time 22:33
klick('data-ch', 'achse:0'); klick('data-tab', 'nacht'); var vorN = z8.n; klick('data-ch', 'achse:2');
assert.ok(hat("data-ch='achse:2' class='a'") && hat("data-reset='optionen:achse'"), 'night: axis of its own with ↺');
assert.ok(z8.n - vorN > 17, 'preview with 17 columns'); var an29 = antwort();
assert.strictEqual(an29.nacht.optionen.achse, 2); assert.strictEqual(an29.tag.optionen.achse, 0, 'day keeps 04–20 h');
klick('data-reset', 'optionen:achse'); assert.ok(!('achse' in antwort().nacht.optionen)); klick('data-tab', 'tag');
// 0.30.0: button "Save & show night/day for 30 s" instead of the switch of 0.29.0; Save alone sends no TEST
assert.strictEqual(knoten('tst').textContent, 'Save & show night for 30 s'); assert.strictEqual(antwort().test, false);
speicher.test = '1';                                       // left over from 0.29.0: removed on saving
knoten('tst').onclick(); gesendet.length = 0; h.webviewclosed({ response: document.location.split('#')[1] });
assert.strictEqual(gesendet[0].TEST, 1, 'TEST sent'); assert.ok(!('test' in speicher), 'old switch value gone');
oeffnen(); klick('data-tab', 'nacht'); assert.strictEqual(knoten('tst').textContent, 'Save & show day for 30 s', 'night tab: the day');
klick('data-tab', 'tag'); gesendet.length = 0; h.webviewclosed({ response: encodeURIComponent(JSON.stringify(antwort())) });
assert.strictEqual(gesendet[0].TEST, undefined, 'no TEST with Save');
var z8 = oeffnen(); klick('data-tab', 'tag'); klick('data-sek', 'regen'); klick('data-ch', 'achse:1'); klick('data-rd', 'regenlage:2');
klick('data-rd', 'regenlage:0'); klick('data-sek', 'regen');
klick('data-sek', 'zahlen');
assert.strictEqual(zaehle(/data-tx=/g), 0, 'no text field without free text');
waehle('inhalt_2l', 19); assert.strictEqual(zaehle(/data-tx='text_2l'/g), 1, 'text field'); assert.strictEqual(zaehle(/data-in='zweit_2l'/g), 0, 'free text takes the whole block');
function tippe(k, v, fertig) {                             // type into the text field: input while typing, change when done
  var t = { getAttribute: function (a) { return a === 'data-tx' ? k : null; }, value: v };
  knoten('inhalt').oninput({ target: t }); if (fertig) knoten('inhalt').onchange({ target: t });
}
var vorT = z8.n; tippe('text_2l', 'Hallo'); assert.ok(z8.n > vorT, 'preview while typing'); assert.ok(!hat("value='Hallo'"), 'no re-render while typing');
tippe('text_2l', "<'&x", true); assert.ok(hat("value='&lt;&#39;&amp;x'"), 'escaped in the field');
tippe('text_2l', "Seb's noch mehr", true); assert.ok(hat("value='Seb&#39;'") && hat("maxlength='4'"), '4 at most: one per digit cell');
assert.strictEqual(antwort().tag.optionen.text_2l, "Seb'");
// 3D edge per block: inherits by default, own colour, back to inherit; curve blocks show the curve colours
assert.ok(hat("data-k='kante_2l'"), '3D swatch in the card'); klick('data-k', 'kante_2l');
assert.strictEqual(zaehle(/class='f/g), 65, 'palette with "like 3D edge"'); assert.ok(hat("data-c=''"));
klick('data-c', '0055FF'); assert.strictEqual(antwort().tag.farben.kante_2l, '0055FF');
klick('data-k', 'kante_2l'); klick('data-c', ''); assert.strictEqual(antwort().tag.farben.kante_2l, '', 'back to the common edge');
klick('data-k', 'kante_2l'); klick('data-c', 'AA0000');
waehle('inhalt_2r', 10); assert.ok(hat("data-k='kurve'") && hat("data-k='k_kante'") && hat('Curve colors apply'), 'curve block: line and edge of the curve');
assert.ok(hat("data-k='kante_zeit'"), '3D edge of the time');
assert.strictEqual(zaehle(/data-k='sf_/g), 0, 'symbol colours moved to "Digits & symbols" (0.30.0)'); klick('data-sek', 'ziffern');
['sf_pfeil', 'sf_schirm', 'sf_warnung', 'sf_wetter', 'sf_mond', 'sf_alt', 'sf_freude', 'sk_pfeil', 'sk_mond', 'sk_freude', 'haupt', 'kante', 'rand'].forEach(function (k) {
  assert.strictEqual(zaehle(new RegExp("data-k='" + k + "'", 'g')), 1, 'colour ' + k);
});
klick('data-k', 'sk_mond'); assert.ok(hat('block 3D edge') && zaehle(/class='f/g) === 65, 'family edge inherits the block edge'); klick('data-k', 'sk_mond');
klick('data-k', 'sf_mond'); assert.ok(hat('block color'), 'family colour inherits the block colour'); klick('data-k', 'sf_mond');
klick('data-k', 'sf_mond'); klick('data-c', 'FFFF55'); waehle('inhalt_1l', 16); waehle('inhalt_4r', 12);   // moon, baro with hPa in the preview
var a8 = antwort();
assert.deepStrictEqual([a8.tag.farben.sf_mond, a8.tag.farben.sf_pfeil, a8.tag.farben.kante_2l], ['FFFF55', '', 'AA0000']);
// night: own text and edge, one ↺ for the block takes both back
klick('data-tab', 'nacht'); tippe('text_2l', 'Mond', true); klick('data-k', 'kante_2l'); klick('data-c', '5555FF');
assert.deepStrictEqual(antwort().nacht.optionen.text_2l, 'Mond'); assert.strictEqual(zaehle(/data-reset='blk:2'/g), 1);
klick('data-reset', 'blk:2'); a8 = antwort(); assert.ok(!('text_2l' in a8.nacht.optionen) && !('kante_2l' in a8.nacht.farben), 'block back to day');
tippe('text_2l', 'Nachts', true); klick('data-tab', 'tag'); antwort();
h.webviewclosed({ response: document.location.split('#')[1] });
var d8 = gesendet[gesendet.length - 1];
assert.strictEqual(d8.SCHALTER >> 7 & 1, 1, 'axis to the watch'); assert.strictEqual(d8.FARBEN.length, 67);
assert.strictEqual(d8.FARBEN[43 + 2], 0x20, 'edge row 2 left AA0000'); assert.strictEqual(d8.FARBEN[43 + 3], 64, 'edge row 2 right inherits');
assert.strictEqual(d8.FARBEN[43 + 9 + 4], 0x3D, 'moon FFFF55'); assert.strictEqual(d8.FARBEN[43 + 9], 64, 'arrows inherit');
assert.deepStrictEqual(d8.TEXTE.slice(0, 7), [0, 0, 4, 83, 69, 66, 39], "block 2: SEB'");
assert.deepStrictEqual(d8.TEXTE_N.slice(2, 7), [4, 78, 65, 67, 72], 'night text NACH(TS), 4 at most');
// import keeps empty colours and texts
oeffnen(); klick('data-sek', 'presets');
knoten('psimport').value = JSON.stringify({ name: 'T', tag: { farben: { kante_1l: '', sf_mond: '00FF00', grund: '' }, optionen: { text_1l: 'abc', text_1r: 7 } }, nacht: { an: false, farben: { sf_alt: '' }, optionen: {} } });
klick('data-ps', 'import'); var ti = vollP(antwort().presets.slice(-1)[0]);
assert.deepStrictEqual([ti.tag.farben.kante_1l, ti.tag.farben.sf_mond, ti.tag.farben.grund === '', ti.tag.optionen.text_1l, typeof ti.tag.optionen.text_1r], ['', '00FF00', false, 'abc', 'string']);
assert.deepStrictEqual(ti.nacht.farben, { sf_alt: '' });
// textCodes on the page = logik.js (same rule, same character list from schrift.js)
var src = (function () { h.showConfiguration(); return seitenHtml(); })();
var fn = new Function('SC', src.split('<script>')[1].split('function familie')[0].split('var TEXT_SONDER')[1].replace(/^/, 'var TEXT_SONDER') +
                      '; return { textCodes: textCodes };')(require('../../src/pkjs/schrift'));
['Hallo Wélt! ß ♥', 'abc', '', 'ÆØÅ ÇÑ', '12:30', "Seb's", '#a~b', '-5°', 'Grüße'].forEach(function (t) { assert.deepStrictEqual(fn.textCodes(t), logik.textCodes(t), 'textCodes ' + t); });
console.log('0.28.0 ok: axis, free text, 3D edge per block, symbol colours');
// Language (0.27.0): German on demand, every text swapped, stored on the phone, English stays the default
oeffnen(); klick('data-tab', 'tag'); klick('data-sp', 'de');
assert.ok(hat("data-sp='de' class='a'") && hat('>Zeilen und Inhalte<') && hat('>Sonnenstand<') && !hat('>Rows & content<'), 'sections in German');
assert.strictEqual(knoten('ok').textContent, 'Speichern'); assert.strictEqual(knoten('std').textContent, 'Alle Farben auf Standard');
assert.strictEqual(knoten('hw').textContent, 'Vorschau mit Beispieldaten, Schrift vereinfacht');
klick('data-sek', 'zahlen'); assert.ok(hat("<optgroup label='Datum und Zeit'>") && hat('>Tiefstwert<') && hat('>Mondsichel zunehmend<') && hat('>Balken Zeile') === false);
assert.ok(hat('>Wochentag<') && hat('>Kleeblatt<') && hat("<optgroup label='Positive Symbole'>") && hat('>Wie Uhr<'), 'new contents in German (0.30.0)');
klick('data-sek', 'ziffern');
waehle('inhalt_1l', 19); waehle('inhalt_2r', 10); assert.ok(hat('Ein Zeichen über jeder Ziffer') && hat("placeholder='Dein Text'") && hat('>Freier Text<') && hat('>Symbolfarben<') && hat('>Mond<'), 'new texts in German (0.28.0)');
klick('data-k', 'sf_mond'); assert.ok(hat('Blockfarbe')); klick('data-k', 'sf_mond');
assert.ok(hat('>Hauptfarbe<') && hat('>Ziffern und Symbole<'), 'Digits & symbols in German');
klick('data-k', 'sk_alt'); assert.ok(hat('3D-Kante des Blocks') && hat('>Status: Daten veraltet, Akku, Handy<')); klick('data-k', 'sk_alt');
assert.ok(hat('>Ziffern Zeile 2 links<') === false && hat('>links<') && hat('>Balken<'), 'block cards in German');
klick('data-k', 'z_tag'); klick('data-k', 'z_tag'); klick('data-sek', 'sonne');
if (!hat('>Fläche<')) klick('data-sw', 'sonne');   // the imported preset (defaults since 0.30.0) left the sun position off
assert.ok(hat('>Fläche<') && hat('>Dämmerung<'));
klick('data-sek', 'presets'); assert.ok(hat('>Papier<') && hat('>Sonnenuhr<') && hat('>Neon Nacht<') && hat('placeholder=\'Name, z. B. Neon\''), 'stock presets in German');
klick('data-ps', 'wahl:v:2'); assert.ok(hat('>Für den Tag<') && hat('>Abbrechen<'));
klick('data-ps', 'auf:tag:v:2'); assert.ok(hat('„Papier“ für den Tag geladen'), 'message in German');
klick('data-tab', 'nacht'); assert.ok(hat('>wie Tag<') || hat('wie Tag'), 'night in German');
var english = [];
knoten('inhalt').innerHTML.replace(/>([^<>]+)</g, function (m, t) { if (/\b(the|and|or|off|on|day|night|bar|row|color)\b/i.test(t)) english.push(t); });
assert.deepStrictEqual(english, [], 'no English left on the German page');
var ad = antwort(); assert.strictEqual(ad.sprache, 'de');
h.webviewclosed({ response: document.location.split('#')[1] }); assert.strictEqual(speicher.sprache, 'de', 'German stored');
oeffnen(); assert.ok(hat("data-sp='de' class='a'") && hat('>Presets<'), 'opens in German again');
klick('data-sp', 'en'); assert.ok(hat('>Rows & content<') && antwort().sprache === 'en', 'back to English');
// Presets across languages (0.27.0): the code carries keys and values only — shared in English, imported in German, and back
function codeAusSeite() { return knoten('inhalt').innerHTML.split("readonly>")[1].split('</textarea>')[0].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
oeffnen(); klick('data-sp', 'en'); klick('data-sek', 'presets');
knoten('psname').value = 'Paper'; klick('data-ps', 'neu');             // own preset named like a stock one
var pe = antwort().presets.length - 1;
klick('data-ps', 'teilen:' + pe); var codeEn = codeAusSeite();
klick('data-sp', 'de');
assert.ok(hat("<i class='pn'>Paper</i>") && hat('>Papier<'), 'own name stays as typed, stock name translated');
assert.strictEqual(codeAusSeite(), codeEn, 'same code in both languages');
knoten('psimport').value = codeEn; klick('data-ps', 'import'); assert.ok(hat('„Paper“ importiert'), 'English code imported on the German page');
var al = antwort(), pd = al.presets.length - 1;
assert.deepStrictEqual([al.presets[pd].tag, al.presets[pd].nacht], [al.presets[pe].tag, al.presets[pe].nacht], 'identical after import');
klick('data-ps', 'teilen:' + pd); var codeDe = codeAusSeite();
klick('data-sp', 'en'); knoten('psimport').value = codeDe; klick('data-ps', 'import'); assert.ok(hat('“Paper” imported'), 'German code imported on the English page');
al = antwort(); assert.deepStrictEqual(al.presets[al.presets.length - 1].tag, al.presets[pe].tag);
klick('data-ps', 'wahl:p:' + (al.presets.length - 1)); klick('data-ps', 'auf:beide:p:' + (al.presets.length - 1));
assert.deepStrictEqual([antwort().tag, antwort().nacht], [vollP(al.presets[pe]).tag, al.presets[pe].nacht], 'loads exactly as saved');
// ---------- 0.30.0 ----------
var z30 = oeffnen(); klick('data-sp', 'en'); klick('data-tab', 'tag');
assert.strictEqual(zaehle(/class='sek'/g), hat("data-sek='kurven'") ? 9 : 8, 'Curves only with a curve in use');
['presets', 'zahlen', 'ziffern', 'regen', 'druck', 'linien', 'himmel', 'sonne'].forEach(function (k) { assert.ok(hat("data-sek='" + k + "'"), 'section ' + k); });
assert.ok(knoten('inhalt').innerHTML.indexOf("data-ch='achse:") < knoten('inhalt').innerHTML.indexOf("data-sek='presets'"), 'time axis below the tabs, above the sections');
// time format: one setting for day and night, to the watch as GLOBAL with the weekday language
klick('data-sek', 'zahlen'); assert.strictEqual(zaehle(/data-gl='zeitformat:/g), 3); klick('data-gl', 'zeitformat:2');
assert.deepStrictEqual(antwort().global, { zeitformat: 2 }); klick('data-tab', 'nacht'); assert.ok(hat("data-gl='zeitformat:2' class='a'"), 'same at night'); klick('data-tab', 'tag');
// main colour: time and block digits inherit it
klick('data-sek', 'ziffern'); klick('data-k', 'haupt'); assert.strictEqual(zaehle(/class='f/g), 64, 'main colour never empty'); klick('data-c', 'FF0000');
klick('data-k', 'ziffer'); klick('data-c', '');                       // time back to "main color"
var a30 = antwort(); assert.deepStrictEqual([a30.tag.farben.haupt, a30.tag.farben.ziffer], ['FF0000', '']);
gesendet.length = 0; h.webviewclosed({ response: document.location.split('#')[1] });
var d30 = gesendet[0];
assert.strictEqual(d30.GLOBAL, 2, '12 h, English'); assert.strictEqual(JSON.parse(speicher.global).zeitformat, 2, 'kept on the phone');
assert.deepStrictEqual([d30.FARBEN[5], d30.FARBEN[58]], [64, 0x30], 'time inherits, main colour red');
// night: the section header counts the changes, one ↺ per symbol family
function geaendert(k) {                                   // number in the header of section k at night, 0 = none
  var m = new RegExp("data-sek='" + k + "'>[^<]*<small>[^<]*</small>(<small class='ae'>(\\d+) changed</small>)?").exec(knoten('inhalt').innerHTML);
  return m && m[2] ? parseInt(m[2], 10) : 0;
}
oeffnen(); klick('data-tab', 'nacht'); knoten('std').onclick(); knoten('std').onclick();   // night colours like day first
var g0 = geaendert('ziffern'), h0 = geaendert('himmel');   // night options of earlier steps may remain
klick('data-sek', 'ziffern'); klick('data-k', 'sk_mond'); klick('data-c', '0000FF');
assert.ok(hat("data-reset='fam:4'") && geaendert('ziffern') === g0 + 1, 'family ↺, header counts');
klick('data-k', 'haupt'); klick('data-c', 'AAAAAA'); assert.strictEqual(geaendert('ziffern'), g0 + 2);
klick('data-sek', 'himmel'); klick('data-k', 'grund'); klick('data-c', '000055'); assert.strictEqual(geaendert('himmel'), h0 + 1, 'header of a closed section counts too');
klick('data-reset', 'fam:4'); assert.ok(!('sk_mond' in antwort().nacht.farben) && geaendert('ziffern') === g0 + 1, 'family back to day');
klick('data-tab', 'tag');
// preview controls: sample weather and time, not saved
var vs = knoten('vs').innerHTML; assert.strictEqual((vs.match(/data-vw=/g) || []).length, 4); assert.ok(/id='vz'/.test(vs) && /Preview at 10:33/.test(vs));
var vn = z30.n; vn = oeffnen(); var n0 = vn.n;
knoten('vs').onclick({ target: { getAttribute: function (k) { return k === 'data-vw' ? '2' : null; } } }); assert.ok(vn.n > n0, 'thunder drawn');
assert.ok(/data-vw='2' class='a'/.test(knoten('vs').innerHTML));
knoten('vs').oninput({ target: { id: 'vz', value: '1320' } }); assert.strictEqual(knoten('vzt').textContent, 'Preview at 22:00');
[0, 1, 3].forEach(function (k) { knoten('vs').onclick({ target: { getAttribute: function (a) { return a === 'data-vw' ? String(k) : null; } } }); });
assert.ok(!('vw' in antwort()), 'preview controls are not saved');
// the state survives a reload of the web view (URL fragment)
var frag = null; global.history = { replaceState: function (a, b, u) { frag = u; } };
oeffnen(); klick('data-sek', 'zahlen'); klick('data-sw', 'zeile1'); var z1 = antwort().tag.optionen.zeile1;
knoten('psname').value = 'Reload'; klick('data-ps', 'neu');
global.location = { hash: frag }; oeffnen();
assert.strictEqual(antwort().tag.optionen.zeile1, z1, 'unsaved change back after the reload');
assert.strictEqual(antwort().presets.slice(-1)[0].name, 'Reload', 'unsaved preset back too');
delete global.location; delete global.history;
oeffnen(); assert.notStrictEqual(antwort().presets.slice(-1)[0].name, 'Reload', 'a fresh page starts from the phone');
// size: the data URL (Base64)
h.showConfiguration(); console.log('settings page as data URL: ' + Math.round(url.length / 1024) + ' KB');
assert.ok(url.length < 130 * 1024, 'data URL below 130 KB');
console.log('0.30.0 ok: sections, time axis, time format, main colour, family ↺, header counts, preview controls, reload, size');
console.log('page ok: 8 sections, sun position, 8 blocks with content/bar/colours, rain, baro line, widths, night with ↺ per block, presets, old settings, English/German');
