// Free text (0.28.0): the settings page preview must place the same letters as the watch (one per digit cell). Renders main.c (tools/vorschau) and the
// page preview (canvas mock) with the same texts in red and compares the red pixels.
// Run: node tools/test/text_vergleich.js   (needs cc; python3 tools/schrift_erzeugen.py and tools/seite_erzeugen.py first)
var assert = require('assert'), path = require('path'), fs = require('fs'), cp = require('child_process');
var APP = path.resolve(__dirname, '../..');
var speicher = {}, url = null, h = {};
global.localStorage = { getItem: function (k) { return k in speicher ? speicher[k] : null; }, setItem: function (k, v) { speicher[k] = String(v); }, removeItem: function () {} };
global.Pebble = { addEventListener: function (n, f) { h[n] = f; }, openURL: function (u) { url = u; }, sendAppMessage: function () {} };
global.navigator = {};
require(path.join(APP, 'src/pkjs/index.js'));
var logik = require(path.join(APP, 'src/pkjs/logik.js'));
cp.execSync('cc -O1 -Wno-unused-function -I tools/vorschau -o /tmp/nw-textvergleich tools/vorschau/vorschau.c 2>/dev/null', { cwd: APP });

function seitePixel(opt, farben) {                 // red pixels of the page preview
  speicher.optionen = JSON.stringify(opt); speicher.farben = JSON.stringify(farben); speicher.nacht = 'null';
  h.showConfiguration();
  var html = Buffer.from(url.replace('data:text/html;charset=utf-8;base64,', ''), 'base64').toString('utf8'), px = {}, ctx = { fillStyle: '' }, el = {};   // Base64 since 0.30.0
  ctx.fillRect = function (x, y, w, hh) {
    if (ctx.fillStyle !== '#FF0000') return;
    for (var i = x; i < x + w; i++) for (var j = y; j < y + hh; j++) if (i >= 0 && i < 200 && j >= 0 && j < 228) px[i + ',' + j] = 1;
  };
  ['fillText', 'strokeText', 'beginPath', 'moveTo', 'lineTo', 'stroke'].forEach(function (n) { ctx[n] = function () {}; });
  global.document = { getElementById: function (id) { return el[id] || (el[id] = { innerHTML: '', getContext: function () { return ctx; } }); }, location: '',
                      createElement: function () { return {}; }, body: { appendChild: function (s) { new Function(s.text)(); } } };   // 0.34.0: loader
  require('vm').runInThisContext(html.split('<script>')[1].split('</script>')[0]);
  return px;
}
function uhrPixel(opt, farben) {                   // red pixels of the watch
  var u = logik.anUhr({ farben: logik.farbenPruefen(farben), optionen: logik.optionenPruefen(opt) }, logik.nachtPruefen(null)), t = '';
  for (var k in u) t += k + ' ' + (Array.isArray(u[k]) ? u[k].join(',') : u[k]) + '\n';
  fs.writeFileSync('/tmp/nw-textvergleich.uhr', t);
  cp.execSync('/tmp/nw-textvergleich 1792744380 /tmp/nw-textvergleich.raw', { env: Object.assign({}, process.env, { TZ: 'Europe/Berlin', UHR: '/tmp/nw-textvergleich.uhr' }) });
  var raw = fs.readFileSync('/tmp/nw-textvergleich.raw'), px = {};
  for (var y = 0; y < 228; y++) for (var x = 0; x < 200; x++) { var o = (y * 200 + x) * 3; if (raw[o] === 255 && raw[o + 1] === 0 && raw[o + 2] === 0) px[x + ',' + y] = 1; }
  return px;
}
var FAELLE = [                                     // letters and signs only: the page draws digits in a system font
  { zeile1: true, inhalt_1l: 19, text_1l: 'SEB', inhalt_1r: 0, inhalt_2l: 19, text_2l: 'HI', inhalt_2r: 19, text_2r: 'Ä♥' },
  { zeile5: true, inhalt_4l: 19, text_4l: 'ABCD', inhalt_4r: 19, text_4r: 'Wo?', inhalt_5l: 0, inhalt_5r: 19, text_5r: 'ÖÜ' },
  { zeile1: true, zeile5: true, inhalt_1l: 19, text_1l: 'QRS%', inhalt_1r: 19, text_1r: ' X', inhalt_5l: 19, text_5l: 'KMNZ', inhalt_5r: 0 }
];
FAELLE.forEach(function (o, n) {
  var f = {}; logik.BLOECKE.forEach(function (b) { if (o[b[0]] === 19) f[b[2]] = 'FF0000'; });   // only the text blocks red
  var a = seitePixel(o, f), b = uhrPixel(o, f), na = Object.keys(a).length, nb = Object.keys(b).length;
  var nur = Object.keys(a).filter(function (k) { return !b[k]; }).concat(Object.keys(b).filter(function (k) { return !a[k]; }));
  assert.ok(nb > 100, 'case ' + n + ': text drawn on the watch');
  assert.deepStrictEqual(nur.slice(0, 10), [], 'case ' + n + ': page ' + na + ' px, watch ' + nb + ' px, different ' + nur.length);
  console.log('case ' + n + ': ' + nb + ' red pixels, identical');
});
console.log('text ok: page preview = watch');
