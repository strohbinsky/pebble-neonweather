// Configurator for the computer (0.35.0): the generated neonweather-konfigurator.html runs without a phone, "Code for the Pebble"
// shows a preset code; the phone script's import check takes it as it is. Run after tools/seite_erzeugen.py
var assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
var logik = require(path.resolve(__dirname, '../../src/pkjs/logik.js'));
var app = path.resolve(__dirname, '../..'), datei = path.join(path.basename(path.dirname(app)) === 'dateien' ? path.dirname(app) : path.join(app, 'dist'), 'neonweather-konfigurator.html');
var html = fs.readFileSync(datei, 'utf8'), el = {}, speicher = {};
function knoten(id) { return el[id] || (el[id] = { id: id, innerHTML: '', value: '', textContent: '', style: {} }); }
knoten('v').getContext = knoten('vm').getContext = function () { return { fillRect: function () {}, fillText: function () {}, strokeText: function () {},
  beginPath: function () {}, moveTo: function () {}, lineTo: function () {}, stroke: function () {}, drawImage: function () {} }; };
knoten('pscode').select = function () {};
global.document = { getElementById: knoten, location: '', body: { appendChild: function (s) { new Function(s.text)(); }, className: '' },
                    createElement: function () { return {}; }, execCommand: function () { return true; } };
global.localStorage = { getItem: function (k) { return k in speicher ? speicher[k] : null; }, setItem: function (k, v) { speicher[k] = String(v); } };
global.navigator = {};
assert.ok(!/\/Users\/|\/home\//.test(html), 'no local paths in the file (the publish guard checks names)');
vm.runInThisContext(html.split('<script>')[1].split('</script>')[0]);
function klick(attr, wert) { knoten('inhalt').onclick({ target: { getAttribute: function (a) { return a === attr ? wert : null; }, parentNode: null } }); }
function hat(t) { return knoten('inhalt').innerHTML.indexOf(t) >= 0; }
assert.strictEqual(knoten('ok').textContent, 'Code for the Pebble'); assert.strictEqual(knoten('tst').style.display, 'none', 'no test button');
assert.strictEqual(document.body.className, 'pc'); assert.ok(hat('Configurator:'), 'intro');
klick('data-sek', 'presets'); assert.ok(hat('>Neon<') && hat('>Retro<'), 'stock presets to load');
klick('data-sek', 'presets'); klick('data-sek', 'zahlen'); klick('data-sw', 'zeile1'); klick('data-pk', 'inhalt_1l'); klick('data-iw', 'inhalt_1l:100');
knoten('ok').onclick(); assert.ok(hat("id='pscode'") && hat('Presets → Import'), 'code panel');
knoten('inhalt').oninput({ target: { id: 'pcname', value: 'Alpaka-Tag', getAttribute: function () { return null; } } });
var code = JSON.parse(knoten('pscode').value);
assert.strictEqual(code.name, 'Alpaka-Tag'); assert.strictEqual(code.tag.optionen.zeile1, true); assert.strictEqual(code.tag.optionen.inhalt_1l, 100);
var p = logik.presetsPruefen([code])[0];                    // what the phone keeps after the import
assert.strictEqual(p.tag.optionen.inhalt_1l, 100); assert.strictEqual(p.tag.farben.grund, '000000', 'missing values = default');
klick('data-pc', 'kopieren'); assert.ok(hat('Copied'), 'copy message');
var gemerkt = JSON.parse(speicher['neonweather-konfigurator']);
assert.strictEqual(gemerkt.tag.optionen.inhalt_1l, 100); assert.strictEqual(gemerkt.pcName, 'Alpaka-Tag', 'remembered for the next visit');
klick('data-sp', 'de'); assert.strictEqual(knoten('ok').textContent, 'Code für die Pebble'); assert.ok(hat('Am Handy: Pebble-App'), 'German');
console.log('configurator ok: ' + Math.round(html.length / 1024) + ' KB, code ' + knoten('pscode').value.length + ' characters, import check passes');
