// Neonweather — phone part. When the watch asks (at most hourly) it fetches rain, pressure and the day's temperatures
// from Open-Meteo for the current location and sends them as one packet. Settings page: day and night theme, presets, language.
var logik = require('./logik');
var laeuft = false;

function log(t) { console.log('neonweather: ' + t); }

function senden(dict, versuch) {
  versuch = versuch || 0;
  Pebble.sendAppMessage(dict, function () {}, function () {
    if (versuch < 3) setTimeout(function () { senden(dict, versuch + 1); }, 2000 * (versuch + 1));
    else log('sending failed');
  });
}

function fehler(code, text) {
  laeuft = false;
  log(text);
  senden({ FEHLER: code });
}

function wetterHolen(lat, lon) {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', logik.wetterUrl(lat, lon));
    xhr.timeout = 30000;
    xhr.onload = function () {
      try {
        if (xhr.status !== 200) return fehler(4, 'HTTP ' + xhr.status);
        var p = logik.wetterPaket(JSON.parse(xhr.responseText), Date.now());
        laeuft = false;
        senden({ WETTER: p.bytes, TAG: p.tag, STAND: Math.floor(Date.now() / 1000) });
        log('weather sent, day ' + p.tag);
      } catch (e) { fehler(3, 'parsing: ' + e); }
    };
    xhr.onerror = function () { fehler(2, 'network'); };
    xhr.ontimeout = function () { fehler(2, 'timeout'); };
    xhr.send();
  } catch (e) { fehler(3, 'fetch: ' + e); }
}

function abrufen() {
  if (laeuft) return;
  laeuft = true;
  setTimeout(function () { laeuft = false; }, 90000);   // safety net in case no callback arrives
  navigator.geolocation.getCurrentPosition(function (pos) {
    localStorage.setItem('ort', JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude }));
    wetterHolen(pos.coords.latitude, pos.coords.longitude);
  }, function () {
    var o = null;
    try { o = JSON.parse(localStorage.getItem('ort')); } catch (e) { o = null; }
    if (o) wetterHolen(o.lat, o.lon); else fehler(1, 'no location');   // no location: use the last one
  }, { enableHighAccuracy: false, maximumAge: 30 * 60 * 1000, timeout: 30000 });
}

// ---------- Settings: colours (since 0.5.0), time bar and pressure position (since 0.7.0), language (since 0.27.0) ----------
// Page: src/seite/einstellungen.html, turned into the module seite.js by tools/seite_erzeugen.py (runs in bauen.sh)
var SEITE = require('./seite');
var SYMBOLE = require('./symbole');   // since 0.22.0: symbols for the preview on the settings page

function gespeichert(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function farben() {
  var f = gespeichert('farben');
  if (!f && localStorage.getItem('balken')) f = { balken: localStorage.getItem('balken') };   // setting until 0.4.0
  return logik.farbenPruefen(f);
}
function optionen() { return logik.optionenPruefen(gespeichert('optionen')); }
function tag() { return { farben: farben(), optionen: optionen() }; }
function nacht() { return logik.nachtPruefen(gespeichert('nacht')); }
function presets() { return logik.presetsPruefen(gespeichert('presets')); }
function sprache() { return localStorage.getItem('sprache') === 'de' ? 'de' : 'en'; }   // page language, English by default (0.27.0)

Pebble.addEventListener('showConfiguration', function () {
  var zustand = { tag: tag(), nacht: nacht(), presets: presets(), vorlagen: logik.vorlagen(), sprache: sprache() };
  var html = SEITE.split('/*ZUSTAND*/null').join(JSON.stringify(zustand))   // split/join: every occurrence, no $ patterns
                  .split('/*LISTE*/null').join(JSON.stringify(logik.FARBEN))
                  .split('/*LAGEN*/null').join(JSON.stringify(logik.DRUCKLAGEN))
                  .split('/*INHALTE*/null').join(JSON.stringify(logik.INHALTE))
                  .split('/*BLOECKE*/null').join(JSON.stringify(logik.BLOECKE))
                  .split('/*SYMBOLE*/null').join(JSON.stringify(SYMBOLE));
  Pebble.openURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
});

Pebble.addEventListener('webviewclosed', function (e) {
  if (!e || !e.response) return;
  try {
    var d = JSON.parse(decodeURIComponent(e.response));
    if (!d.tag) return;
    var t = { farben: logik.farbenPruefen(d.tag.farben), optionen: logik.optionenPruefen(d.tag.optionen) }, n = logik.nachtPruefen(d.nacht);
    localStorage.setItem('farben', JSON.stringify(t.farben));
    localStorage.setItem('optionen', JSON.stringify(t.optionen));
    localStorage.setItem('nacht', JSON.stringify(n));
    localStorage.setItem('presets', JSON.stringify(logik.presetsPruefen(d.presets)));
    localStorage.removeItem('balken');
    if (d.sprache === 'de' || d.sprache === 'en') localStorage.setItem('sprache', d.sprache);
    senden(logik.anUhr(t, n));
    log('settings saved, night mode ' + (n.an ? 'on' : 'off'));
  } catch (err) { log('settings: ' + err); }
});

// On start: report ready and send the settings right away (they apply without opening the settings page too)
Pebble.addEventListener('ready', function () {
  var d = logik.anUhr(tag(), nacht()); d.BEREIT = 1; senden(d);
});
Pebble.addEventListener('appmessage', function (e) { if (e.payload.ANFRAGE !== undefined) abrufen(); });
