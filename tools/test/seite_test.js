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
assert.strictEqual(d0.BEREIT, 1); assert.strictEqual(d0.FARBEN.length, 43); assert.strictEqual(d0.FARBEN[8], 0x02, 'old bar colour blue');
assert.strictEqual(d0.OPTIONEN & 511, 4 + 8 + 256, 'row 2 left/right from the date bars, time');
assert.strictEqual(d0.OPTIONEN >> 11 & 3, 1, 'rain at the bottom taken over');
assert.strictEqual(d0.OPTIONEN >> 25 & 1, 1, 'whoever had bottom stays relative');
assert.strictEqual(d0.OPTIONEN >> 29 & 3, 3, 'rows 1 and 5 from the sun rows');
assert.deepStrictEqual(d0.BLOECKE, [5, 6, 1, 2, 3, 4, 7, 8], 'default blocks');
assert.deepStrictEqual(d0.LINIEN, [4, 1, 0, 2], 'width from 0.14.0 taken over (index 3 = 4 px), no frame, sun stripes 2 px');
assert.strictEqual(d0.NACHTMODUS, 0); assert.deepStrictEqual(d0.FARBEN_N, d0.FARBEN, 'night like day');

function oeffnen() {
  h.showConfiguration();
  var html = decodeURIComponent(url.replace('data:text/html;charset=utf-8,', ''));
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
assert.strictEqual(zaehle(/<select data-in=/g), 8, 'eight blocks'); assert.strictEqual(zaehle(/<option /g), 344, '43 contents each'); assert.strictEqual(zaehle(/<optgroup /g), 32, 'four groups per block');
waehle('inhalt_2l', 4);                                     // row 2 left: high instead of day
klick('data-sw', 'balken_1l');
klick('data-k', 'z_auf2'); assert.strictEqual(zaehle(/class='f/g), 64, 'palette'); klick('data-c', 'FFAA00');
// Symbols and curve (0.22.0): the preview draws them, curve colours selectable
var vorZ = zn.n; waehle('inhalt_1l', 10); waehle('inhalt_1r', 12); waehle('inhalt_5l', 13); waehle('inhalt_5r', 17);
klick('data-sek', 'kurven');                              // section Curves (0.23.0): five colours per curve
['kurve', 'k_kante', 'k_rand', 'k_punkt', 'k_pkante', 'b_kurve', 'b_kante', 'b_rand', 'b_punkt', 'b_pkante'].forEach(function (k) {
  assert.strictEqual(zaehle(new RegExp("data-k='" + k + "'", 'g')), 1, 'colour ' + k);
});
klick('data-k', 'k_kante'); klick('data-c', '0055AA'); klick('data-k', 'b_rand'); klick('data-c', 'FFFFFF'); klick('data-sek', 'kurven');
waehle('inhalt_4l', 18);                                   // pressure curve in the preview
assert.strictEqual(zaehle(/data-in='zweit_/g), 2, 'right cell only with symbols (row 5); curve and baro with hPa take the whole block');
waehle('inhalt_1l', 13); waehle('zweit_1l', 72); waehle('zweit_5l', 76);   // umbrella + fixed windsock, umbrella + fixed sun and cloud
assert.strictEqual(zaehle(/data-in='zweit_1l'/g), 1); assert.ok(hat("<optgroup label='Numbers'>"));
assert.strictEqual((knoten('inhalt').innerHTML.split("data-in='zweit_1l'")[1].split('</select>')[0].match(/<option /g) || []).length, 31, 'right: empty, 6 smart, 24 fixed');
[9, 10, 11, 12, 13, 14, 15, 16, 17, 18].concat(logik.INHALTE.map(function (n, j) { return j; }).slice(64)).forEach(function (w) {
  waehle('inhalt_4r', w); waehle('zweit_4r', w >= 64 ? 151 - w : 0);   // every kind once in the preview
});
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
assert.strictEqual(zaehle(/day &amp; night<\/small>|day & night<\/small>/g), 4, 'hint for Five rows, Neon, Paper, Retro');
klick('data-tab', 'tag'); waehle('inhalt_2l', 1);
assert.strictEqual(zaehle(/data-ps='wahl:v:/g), 9, 'nine stock presets'); assert.strictEqual(zaehle(/data-ps='auf:/g), 0, 'choice closed');
klick('data-ps', 'wahl:p:0'); assert.strictEqual(zaehle(/data-ps='auf:/g), 3, 'day, night, both');
klick('data-ps', 'zu'); assert.strictEqual(zaehle(/data-ps='auf:/g), 0, 'cancel');
// For day: the day becomes Paper, the night looks as before
var vorher = antwort(); klick('data-ps', 'wahl:v:2'); klick('data-ps', 'auf:tag:v:2');
var a2 = antwort();
assert.strictEqual(a2.tag.farben.grund, 'FFFFFF', 'Paper by day'); assert.strictEqual(a2.nacht.an, true);
assert.deepStrictEqual(bild(a2), bild(vorher), 'night unchanged');
assert.ok(hat('“Paper” loaded for day'), 'message');
// For night: day look of Minimal (no night: only two targets) onto the night, the day stays
klick('data-ps', 'wahl:v:6'); assert.strictEqual(zaehle(/data-ps='auf:/g), 2, 'no night, no "both"');
klick('data-ps', 'auf:nacht:v:6');
var a3 = antwort();
assert.deepStrictEqual(a3.tag, a2.tag, 'day unchanged'); assert.deepStrictEqual(bild(a3), logik.vorlagen()[6].tag, 'night = Minimal');
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
var ai = antwort(), bad = ai.presets[vor + 1];
assert.strictEqual(ai.presets.length, vor + 2); assert.deepStrictEqual(ai.presets[vor].tag, ai.presets[0].tag, 'shared = original');
assert.strictEqual(bad.tag.farben.grund, ai.tag.farben.grund, 'invalid colour → current day'); assert.strictEqual(bad.tag.farben.regen, 'FF0000');
assert.deepStrictEqual([bad.tag.optionen.inhalt_2l, bad.tag.optionen.zweit_1l, bad.tag.optionen.zeile1, bad.tag.optionen.inhalt_4r],
                       [ai.tag.optionen.inhalt_2l, ai.tag.optionen.zweit_1l, ai.tag.optionen.zeile1, 66], 'broken options → current day');
assert.deepStrictEqual(bad.nacht, { an: true, farben: {}, optionen: { zeile5: true } }, 'night: only valid differences');
klick('data-ps', 'wahl:p:' + (vor + 1)); klick('data-ps', 'auf:tag:p:' + (vor + 1)); assert.strictEqual(antwort().tag.optionen.inhalt_4r, 66, 'imported preset loads');
h.webviewclosed({ response: document.location.split('#')[1] });
assert.deepStrictEqual(JSON.parse(speicher.presets).map(function (p) { return p.name; }).slice(-2), ['Shared', 'Bad'], 'stored on the phone');
// Language (0.27.0): German on demand, every text swapped, stored on the phone, English stays the default
oeffnen(); klick('data-tab', 'tag'); klick('data-sp', 'de');
assert.ok(hat("data-sp='de' class='a'") && hat('>Zeilen und Inhalte<') && hat('>Sonnenstand<') && !hat('>Rows & content<'), 'sections in German');
assert.strictEqual(knoten('ok').textContent, 'Speichern'); assert.strictEqual(knoten('std').textContent, 'Alle Farben auf Standard');
assert.strictEqual(knoten('hw').textContent, 'Vorschau mit Beispieldaten, Schrift vereinfacht');
klick('data-sek', 'zahlen'); assert.ok(hat("<optgroup label='Zahlen'>") && hat('>Tiefstwert<') && hat('>Mondsichel zunehmend<') && hat('>Balken Zeile') === false);
assert.ok(hat('>Ziffern Zeile 2 links<') === false && hat('>links<') && hat('>Balken<'), 'block cards in German');
klick('data-k', 'z_tag'); klick('data-k', 'z_tag'); klick('data-sek', 'sonne'); assert.ok(hat('>Fläche<') && hat('>Dämmerung<'));
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
assert.deepStrictEqual([antwort().tag, antwort().nacht], [al.presets[pe].tag, al.presets[pe].nacht], 'loads exactly as saved');
console.log('page ok: 8 sections, sun position, 8 blocks with content/bar/colours, rain, baro line, widths, night with ↺ per block, presets, old settings, English/German');
