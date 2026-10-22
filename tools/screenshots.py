"""Screenshots for the README, rendered with the real watch code (tools/vorschau) and made-up sample weather — no location, no live data.
Run: python3 tools/screenshots.py <folder>        (needs cc, node; settings page shots also need Brave or Chrome)
Every picture is 400 × 456 (the 200 × 228 display at 2×). Settings go through logik.anUhr() and empfangen() in main.c,
exactly like on the watch."""
import json, os, struct, subprocess, sys, zlib
from datetime import datetime, timezone
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/images").resolve()
OUT.mkdir(parents=True, exist_ok=True)
NUR = sys.argv[2:]                        # optional: only pictures whose name starts with one of these
ENV0 = dict(os.environ, PATH=os.path.expanduser("~/.local/bin") + ":" + os.environ["PATH"])

# ---------- Sample weather: 17 hours 04–20 h of rain (mm) and pressure (hPa), hourly temperature and weather kind 00–23 h ----------
# kind: 0 clear, 1 fair, 2 partly cloudy, 3 overcast, 4 fog, 5 rain, 6 snow, 7 thunderstorm. Sun: dawn, sunrise, sunset, dusk (minutes)
def hm(t): h, m = t.split(":"); return int(h) * 60 + int(m)
WEATHER = {
    "autumn": dict(day=(2026, 10, 21), low=6, high=15, sun=("07:30", "08:05", "18:15", "18:50"),
                   rain=[.2, .6, 1.4, 2.2, 1.1, .4, .1, 0, 0, 0, 0, .2, .3, 0, 0, 0, 0],
                   pressure=[1003, 1003.5, 1004, 1005, 1006.5, 1008, 1009, 1010, 1011, 1012, 1012.5, 1013, 1013.5, 1014, 1015, 1015.5, 1016],
                   temp=[8, 8, 7, 7, 7, 6, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 15, 14, 12, 11, 10, 9, 9, 8],
                   kind=[3] * 4 + [5] * 6 + [3, 3, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 3, 3], gust=[35] * 10 + [25] * 14),
    "frost": dict(day=(2027, 1, 15), low=-6, high=1, sun=("07:23", "08:08", "16:55", "17:40"),
                  rain=[0] * 17,
                  pressure=[1037, 1037, 1036.8, 1036.5, 1036.5, 1036.2, 1036, 1035.6, 1035.2, 1035, 1034.8, 1034.6, 1034.5, 1034.3, 1034.2, 1034, 1034],
                  temp=[-3, -4, -4, -5, -5, -5, -6, -6, -6, -5, -3, -1, 0, 1, 1, 0, -1, -2, -3, -3, -4, -4, -5, -5],
                  kind=[0] * 6 + [4] * 4 + [0] * 14, gust=[10] * 24),
    "thunder": dict(day=(2026, 7, 8), low=19, high=33, sun=("04:50", "05:30", "21:30", "22:15"),
                    rain=[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .3, 6, 12, 3, .5, .1],
                    pressure=[1013, 1013, 1012.5, 1012, 1011.5, 1011, 1010, 1009, 1008, 1007, 1006, 1005, 1005.5, 1008, 1009, 1009.5, 1010],
                    temp=[22, 21, 20, 20, 19, 19, 20, 22, 24, 26, 28, 30, 31, 32, 33, 32, 27, 24, 23, 23, 22, 22, 21, 21],
                    kind=[0] * 10 + [1, 1, 2, 2, 3, 7, 7, 7, 5, 3, 2, 1, 1, 1], gust=[15] * 14 + [40, 75, 80, 60, 30] + [20] * 5),
    "gale": dict(day=(2026, 11, 14), low=4, high=9, sun=("07:05", "07:42", "16:40", "17:17"),
                 rain=[.3, .5, .8, 1, 1.2, .9, 1.5, 2, 2.5, 1.8, 3, 4, 2.5, 1.6, 2.2, 1, .6],
                 pressure=[1008, 1007, 1006, 1004.5, 1003, 1001, 999, 997.5, 996, 994, 992, 990, 988.5, 987, 986, 985, 984.5],
                 temp=[6, 6, 5, 5, 4, 4, 4, 5, 5, 6, 7, 8, 8, 9, 9, 9, 8, 8, 7, 7, 7, 6, 6, 6],
                 kind=[3] * 4 + [5] * 20, gust=[40, 45, 50, 55, 55, 60, 60, 65, 70, 70, 75, 80, 85, 90, 90, 85, 80, 75, 70, 65, 60, 55, 50, 50]),
    "april": dict(day=(2027, 4, 18), low=3, high=12, sun=("05:55", "06:30", "20:20", "20:55"),
                  rain=[0, 0, 0, .1, 0, .3, 0, .8, 1.6, .2, 0, .5, 1.2, .1, 0, 0, 0],
                  pressure=[1015, 1014.5, 1014, 1014, 1013.5, 1013, 1012.5, 1012, 1012, 1012.5, 1013, 1013, 1013.5, 1014, 1014.5, 1015, 1015.5],
                  temp=[5, 4, 4, 3, 3, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 11, 10, 10, 9, 8, 7, 6, 6, 5],
                  kind=[1] * 9 + [5, 2, 5, 5, 2, 1, 5, 5, 2, 1, 1, 1, 0, 0, 0], gust=[30] * 24),
    "night": dict(day=(2026, 12, 30), low=-4, high=2, sun=("07:40", "08:20", "16:35", "17:15"),
                  rain=[0] * 11 + [.1, .2, .3, .4, .4, .3],
                  pressure=[1022, 1021.8, 1021.5, 1021.2, 1021, 1020.5, 1020, 1019.5, 1019, 1018.5, 1018, 1017.5, 1017.2, 1017, 1016.6, 1016.3, 1016],
                  temp=[-2, -3, -3, -4, -4, -4, -4, -3, -2, -1, 0, 1, 2, 2, 2, 1, 1, 0, 0, 0, -1, -1, -1, -2],
                  kind=[2] * 15 + [5] * 9, gust=[20] * 24),
}

def packet(w):
    day = [255 if r is None else max(0, min(254, round(r * 10))) for r in w["rain"]]
    day += [max(0, min(254, round(p * 2 - 1900))) for p in w["pressure"]] + [w["low"] & 255, w["high"] & 255]
    dawn, rise, sset, dusk = (hm(t) for t in w["sun"])
    for m in (rise, sset, dawn, dusk): day += [m & 255, m >> 8]
    ext = [t & 255 for t in w["temp"]] + [k | min(30, round(g / 5)) << 3 for k, g in zip(w["kind"], w["gust"])]
    return bytes(day * 2 + ext * 2)        # today and tomorrow alike

# ---------- Settings: a stock preset or the defaults, plus changes, through logik.anUhr() ----------
JS = """var l=require('./src/pkjs/logik'),a=JSON.parse(process.argv[1]),v=l.vorlagen(),p=null,k;
for(var i=0;i<v.length;i++)if(v[i].name===a.preset)p=v[i];
if(!p)p={tag:{farben:l.farbenPruefen(null),optionen:l.optionenPruefen(null)},nacht:l.nachtPruefen(null)};
var t=JSON.parse(JSON.stringify(p.tag));for(k in a.o)t.optionen[k]=a.o[k];for(k in a.f)t.farben[k]=a.f[k];
t.farben=l.farbenPruefen(t.farben);t.optionen=l.optionenPruefen(t.optionen);
console.log(JSON.stringify(l.anUhr(t,a.ohneNacht?l.nachtPruefen(null):p.nacht)));"""
def settings(preset=None, o=None, f=None, ohne_nacht=False):
    r = subprocess.run(["node", "-e", JS, json.dumps({"preset": preset, "o": o or {}, "f": f or {}, "ohneNacht": ohne_nacht})],
                       cwd=APP, env=ENV0, capture_output=True, text=True, check=True)
    return json.loads(r.stdout)

subprocess.run(["cc", "-O1", "-Wno-unused-function", "-I", APP / "tools/vorschau", "-o", "/tmp/neonweather-shots", APP / "tools/vorschau/vorschau.c"],
               check=True, stderr=subprocess.DEVNULL)

def png(raw, out, s=2, w=200, h=228):
    rows = b"".join((b"\x00" + b"".join(raw[(y * w + x) * 3:(y * w + x) * 3 + 3] * s for x in range(w))) * s for y in range(h))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    out.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w * s, h * s, 8, 2, 0, 0, 0)) +
                    chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))

def shot(name, weather, time, preset=None, o=None, f=None, ohne_nacht=False, alter=600):
    if NUR and not any(name.startswith(n) for n in NUR): return
    w = WEATHER[weather]
    Path("/tmp/nw-shot.bin").write_bytes(packet(w))
    uhr = settings(preset, o, f, ohne_nacht)
    Path("/tmp/nw-shot.uhr").write_text("".join(f"{k} {','.join(map(str, v)) if isinstance(v, list) else v}\n" for k, v in uhr.items()))
    y, mo, d = w["day"]
    t = int(datetime(y, mo, d, *(int(x) for x in time.split(":")), tzinfo=timezone.utc).timestamp())
    env = dict(ENV0, TZ="UTC", WETTER="/tmp/nw-shot.bin", TAG="%04d%02d%02d" % w["day"], UHR="/tmp/nw-shot.uhr", ALTER=str(alter))
    subprocess.run(["/tmp/neonweather-shots", str(t), "/tmp/nw-shot.raw"], env=env, check=True)
    png(Path("/tmp/nw-shot.raw").read_bytes(), OUT / f"{name}.png")
    print(name)

# ---------- Stock presets: April showers at noon, night looks after dusk ----------
shot("preset-neon", "april", "12:05", "Neon")
shot("preset-neon-night", "april", "21:40", "Neon")
shot("preset-paper", "april", "12:05", "Paper")
shot("preset-paper-night", "april", "21:40", "Paper")
shot("preset-sundial", "april", "12:05", "Sundial")
shot("preset-terminal", "april", "12:05", "Terminal")
shot("preset-minimal", "april", "12:05", "Minimal")
shot("preset-retro", "april", "12:05", "Retro")
shot("preset-retro-night", "april", "21:40", "Retro")
# Retro in other weather, for the top of the README (made by Seb, stock preset since 0.27.0)
for wx, time in (("autumn", "10:33"), ("thunder", "15:12"), ("frost", "12:30")):
    shot(f"retro-{wx}", wx, time, "Retro")

# ---------- The default look in six kinds of weather ----------
for wx, time in (("autumn", "10:33"), ("frost", "07:48"), ("thunder", "15:12"), ("gale", "17:40"), ("april", "12:05"), ("night", "19:40")):
    shot(f"weather-{wx}", wx, time)

# ---------- Features ----------
# Rows 1 and 5 with sunrise and sunset (the stock layout of Neon) and the new top-down day: sunrise stripe above, sunset below
shot("feature-rows", "autumn", "10:33", o={"zeile1": True, "zeile5": True})
# Smart symbols: warning, umbrella, weather now, moon; baro trend with hPa; on a thundery afternoon
shot("feature-symbols", "thunder", "14:20", "Neon", o={"inhalt_1l": 14, "zweit_1l": 13, "inhalt_1r": 15, "zweit_1r": 16,
                                                        "inhalt_5l": 12, "inhalt_5r": 11, "zweit_5r": 9})
# Curves: temperature now and the day's temperature curve; pressure curve and trend arrow
shot("feature-curves", "gale", "13:10", o={"zeile1": True, "zeile5": True, "inhalt_1l": 9, "inhalt_1r": 10, "inhalt_5l": 18, "inhalt_5r": 12})
# Rain: fixed scale, daily max = full height, strip at the bottom, full columns
shot("rain-fixed", "april", "12:05")
shot("rain-relative", "april", "12:05", o={"regen_rel": True})
shot("rain-bottom", "april", "12:05", o={"regenlage": 1, "regen_rel": True})
shot("rain-full-columns", "gale", "17:40", o={"regenvoll": True})
# Pressure line: continuous at the bottom, thick
shot("pressure-bottom-line", "gale", "17:40", o={"drucklage": 3, "druckvoll": True, "dicke_d": 3})
# Time lines: vertical and horizontal as a cross with a shared frame
shot("lines-cross", "autumn", "10:33", o={"tageslinie": True, "staerke_v": 4, "staerke_h": 4, "voll_v": True, "rahmen_z": True},
     f={"rahmen_z": "000000", "tlinie": "FFFF55", "jetzt": "FFFF55"})
# Sun position: night, twilight as a gradient, day; stripes at sunrise and sunset only
shot("sun-position", "autumn", "10:33", "Sundial", o={"sonne_streifen": True, "staerke_s": 2}, f={"s_auf": "FFFF55", "s_unter": "FF5500"})
shot("sun-stripes", "autumn", "10:33", o={"sonne": True, "sonne_tag": False, "sonne_daemmerung": False, "sonne_nacht": False,
                                          "sonne_streifen": True, "staerke_s": 3, "zeile1": True, "zeile5": True})
# All 24 fixed symbols on two screens: four per row, rows 1, 2, 4, 5
def symbole(start):
    o = {"zeile1": True, "zeile5": True}
    for i, b in enumerate(("1l", "1r", "2l", "2r", "4l", "4r", "5l", "5r")):
        s1, s2 = start + 2 * i, start + 2 * i + 1
        o["inhalt_" + b] = 64 + s1 if s1 < 24 else 0
        o["zweit_" + b] = 64 + s2 if s2 < 24 else 0
    return o
shot("symbols-1", "frost", "12:00", "Neon", o=symbole(0), ohne_nacht=True)
shot("symbols-2", "frost", "12:00", "Neon", o=symbole(16), ohne_nacht=True)
# No data for a while: the stale-data cloud
shot("feature-stale", "night", "19:40", o={"zeile1": True, "inhalt_1l": 17, "inhalt_1r": 0}, alter=4 * 3600)

# ---------- Settings page (Brave or Chrome headless; BROWSER=<path> to choose) ----------
BROWSER = os.environ.get("BROWSER") or next((b for b in ("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
                                                         "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") if os.path.exists(b)), None)
SEITE_JS = """var speicher=JSON.parse(process.argv[1]),url=null,zeigen=null;
global.localStorage={getItem:function(k){return k in speicher?speicher[k]:null;},setItem:function(){},removeItem:function(){}};
global.Pebble={addEventListener:function(n,f){if(n==='showConfiguration')zeigen=f;},openURL:function(u){url=u;},sendAppMessage:function(){}};
global.navigator={};require('./src/pkjs/index.js');zeigen();process.stdout.write(decodeURIComponent(url.replace('data:text/html;charset=utf-8,','')));"""
BEISPIEL = {"presets": json.dumps([{"name": "Five rows", "tag": {"farben": {}, "optionen": {"zeile1": True, "zeile5": True}}, "nacht": {"an": False, "farben": {}, "optionen": {}}}])}
def seite(name, skript, hoehe, speicher=BEISPIEL):
    if NUR and not any(name.startswith(n) for n in NUR): return
    if not BROWSER: print("no browser for", name); return
    html = subprocess.run(["node", "-e", SEITE_JS, json.dumps(speicher)], cwd=APP, env=ENV0, capture_output=True, text=True, check=True).stdout
    # headless lays out at ~500 px minimum and cuts off the right edge: phone width for the body, window a bit wider
    html = html.replace("</style>", "body{width:380px;margin:0 auto}</style>", 1).replace("</body>", "<script>" + skript + "</script></body>")
    Path("/tmp/nw-seite.html").write_text(html)
    subprocess.run([BROWSER, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
                    f"--screenshot={OUT / (name + '.png')}", f"--window-size=520,{hoehe}", "file:///tmp/nw-seite.html"],
                   check=True, capture_output=True)
    print(name)
def offen(sek, mehr=""):           # open one section and hide the others, so preview and section fit into one picture
    return (f"sek.{sek}=true;{mehr}zeigen();[].forEach.call(document.querySelectorAll('.sek'),function(e)"
            f"{{if(!e.querySelector(\"[data-sek='{sek}']\"))e.style.display='none';}});")
seite("settings-top", "", 860)
seite("settings-rows", offen("zahlen"), 1500)
seite("settings-presets", offen("presets", "teilen=0;"), 1250)
seite("settings-sun", offen("sonne", "z.tag.optionen.sonne=true;z.tag.optionen.sonne_streifen=true;"), 1600)
seite("settings-german", "sp='de';" + offen("regen"), 1150)
