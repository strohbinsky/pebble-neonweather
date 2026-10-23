// Inflate of the settings page loader (0.34.0) against Node's zlib: text, the real page, random bytes (stored blocks),
// repeats (long matches), every level, UTF-8. Run: node tools/test/entpacken_test.js
var assert = require('assert'), fs = require('fs'), path = require('path'), zlib = require('zlib');
global.atob = global.atob || function (b) { return Buffer.from(b, 'base64').toString('binary'); };
global.escape = global.escape;
var code = fs.readFileSync(path.resolve(__dirname, '../../src/seite/entpacken.js'), 'utf8');
var entpacken = new Function(code + '; return entpacken;')();
function rund(text, stufe) {
  var b = zlib.deflateRawSync(Buffer.from(text, 'utf8'), { level: stufe });
  assert.strictEqual(entpacken(b.toString('base64')), text, 'level ' + stufe + ', ' + text.length + ' characters');
}
var seite = fs.readFileSync(path.resolve(__dirname, '../../src/seite/einstellungen.html'), 'utf8');
[0, 1, 6, 9].forEach(function (s) { rund(seite, s); });
rund('', 9); rund('a', 9); rund('Grüße ♥ “x” ÄÖÜ ß 😀', 9); rund('abc'.repeat(5000), 9); rund('x'.repeat(100000), 9);
var zufall = ''; for (var i = 0; i < 70000; i++) zufall += String.fromCharCode(32 + Math.floor(Math.random() * 90));
rund(zufall, 9); rund(zufall + seite + zufall, 9);
var bin = Buffer.alloc(100000); for (i = 0; i < bin.length; i++) bin[i] = Math.random() * 256;   // incompressible: stored blocks
var b = zlib.deflateRawSync(bin, { level: 9 }), s = entpacken.toString();
var roh = new Function(code.replace('return decodeURIComponent(escape(t));', 'return t;') + '; return entpacken;')()(b.toString('base64'));
assert.strictEqual(Buffer.from(roh, 'binary').compare(bin), 0, 'binary, stored blocks');
console.log('inflate ok: page ' + seite.length + ' characters, all levels, UTF-8, stored, long repeats');
