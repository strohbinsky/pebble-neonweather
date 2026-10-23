"""Screenshots for the README, rendered with the real watch code (tools/vorschau) and made-up sample weather — no location, no live data.
Run: python3 tools/screenshots.py <folder>        (needs cc, node; settings page shots also need Brave or Chrome)
Every picture is 400 × 456 (the 200 × 228 display at 2×). Settings go through logik.anUhr() and empfangen() in main.c,
exactly like on the watch."""
import json, math, os, struct, subprocess, sys, zlib
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
    # night hours 00–03 and 21–23 (0.28.0): no rain, pressure continued from the first and last value; evening before (0.29.0)
    r, pr = w["rain"], w["pressure"]
    nacht = [0] * 7 + [round(v * 2 - 1900) for v in [pr[0]] * 4 + [pr[-1]] * 3]
    vor = r[12:] + [0] * 3 + [round(v * 2 - 1900) for v in pr[12:] + [pr[-1]] * 3] + [t & 255 for t in w["temp"][16:]]
    vor = [max(0, min(254, round(v * 10))) for v in vor[:8]] + vor[8:]
    return bytes(day * 2 + ext * 2 + nacht * 2 + vor)   # today and tomorrow alike, 236 bytes

def packet2(w):                            # second packet (0.30.0): rain chance, UV, wind — made up from the sample weather
    rain = [0] * 4 + w["rain"] + [0] * 3
    chance = [min(95, 25 + round(x * 35)) if x > 0 else 5 for x in rain]   # hour h to h+1, like the rain
    peak = {1: 1, 4: 4, 7: 8, 10: 2, 11: 1, 12: 1}.get(w["day"][1], 3)
    dawn, rise, sset, dusk = (hm(t) for t in w["sun"])
    uv = [max(0, round(peak * math.sin(math.pi * (h * 60 - rise) / (sset - rise)))) if rise <= h * 60 <= sset else 0 for h in range(24)]
    return bytes((chance + uv + [round(g * 0.55) for g in w["gust"]]) * 2)

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

def shot(name, weather, time, preset=None, o=None, f=None, ohne_nacht=False, alter=600, env_mehr=None):
    if NUR and not any(name.startswith(n) for n in NUR): return
    w = WEATHER[weather]
    Path("/tmp/nw-shot.bin").write_bytes(packet(w)); Path("/tmp/nw-shot2.bin").write_bytes(packet2(w))
    uhr = settings(preset, o, f, ohne_nacht)
    Path("/tmp/nw-shot.uhr").write_text("".join(f"{k} {','.join(map(str, v)) if isinstance(v, list) else v}\n" for k, v in uhr.items()))
    y, mo, d = w["day"]
    t = int(datetime(y, mo, d, *(int(x) for x in time.split(":")), tzinfo=timezone.utc).timestamp())
    env = dict(ENV0, TZ="UTC", WETTER="/tmp/nw-shot.bin", WETTER2="/tmp/nw-shot2.bin", TAG="%04d%02d%02d" % w["day"], UHR="/tmp/nw-shot.uhr",
               ALTER=str(alter), AKKU="80", SCHRITTE="8432", PULS="64")   # watch values: sample numbers
    env.update(env_mehr or {})                         # may replace TZ too (time zone picture, 0.36.0)
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
shot("preset-minimal-night", "april", "21:40", "Minimal")       # 0.30.0: Minimal with a night look, Signal and Dusk
for _p in ("Signal", "Dusk"):
    shot(f"preset-{_p.lower()}", "april", "12:05", _p)
    shot(f"preset-{_p.lower()}-night", "april", "21:40", _p)
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
shot("pressure-bottom-line", "gale", "17:40", o={"drucklage": 3, "druckvoll": True, "staerke_d": 8})
# Time lines: vertical and horizontal as a cross with a shared frame
shot("lines-cross", "autumn", "10:33", o={"tageslinie": True, "staerke_v": 4, "staerke_h": 4, "voll_v": True, "rahmen_z": True},
     f={"rahmen_z": "000000", "tlinie": "FFFF55", "jetzt": "FFFF55"})
# Sun position: night, twilight as a gradient, day; stripes at sunrise and sunset only
shot("sun-position", "autumn", "10:33", "Sundial", o={"sonne_streifen": True, "staerke_s": 2}, f={"s_auf": "FFFF55", "s_unter": "FF5500"})
shot("sun-stripes", "autumn", "10:33", o={"sonne": True, "sonne_tag": False, "sonne_daemmerung": False, "sonne_nacht": False,
                                          "sonne_streifen": True, "staerke_s": 3, "zeile1": True, "zeile5": True})
# All 24 fixed symbols on two screens: four per row, rows 1, 2, 4, 5
def symbole(start, ende=26):            # 26 weather and status symbols; the positive ones (26–33, 0.30.0) on a picture of their own
    o = {"zeile1": True, "zeile5": True}
    for i, b in enumerate(("1l", "1r", "2l", "2r", "4l", "4r", "5l", "5r")):
        s1, s2 = start + 2 * i, start + 2 * i + 1
        o["inhalt_" + b] = 64 + s1 if s1 < ende else 0
        o["zweit_" + b] = 64 + s2 if s2 < ende else 0
    return o
shot("symbols-1", "frost", "12:00", "Neon", o=symbole(0), ohne_nacht=True)
shot("symbols-2", "frost", "12:00", "Neon", o=symbole(16), ohne_nacht=True)
# No data for a while: the stale-data cloud
shot("feature-stale", "night", "19:40", o={"zeile1": True, "inhalt_1l": 17, "inhalt_1r": 0}, alter=4 * 3600)

# ---------- 0.28.0–0.30.0 ----------
# positive symbols in rows 1 and 5, each block in its own colour
shot("feature-positive", "april", "12:05", o={"zeile1": True, "zeile5": True, "inhalt_1l": 90, "zweit_1l": 91, "inhalt_1r": 92, "zweit_1r": 93,
                                             "inhalt_5l": 94, "zweit_5l": 95, "inhalt_5r": 96, "zweit_5r": 97},
     f={"z_auf": "FF55AA", "z_auf2": "FFFF55", "z_unter": "55FFAA", "z_unter2": "FFAA00"})
# weather as numbers: rain chance now and in the next 12 h, UV now and max, wind and gusts
shot("feature-numbers", "thunder", "15:20", o={"zeile1": True, "zeile5": True, "inhalt_1l": 24, "inhalt_1r": 25, "inhalt_2l": 26, "inhalt_2r": 27,
                                             "inhalt_4l": 28, "inhalt_4r": 29, "inhalt_5l": 3, "inhalt_5r": 4},
     f={"z_auf": "55AAFF", "z_auf2": "55AAFF", "z_tag": "FFFF55", "z_monat": "FFFF55", "z_min": "AAFFAA", "z_max": "AAFFAA"})
# from the watch: weekday, battery, heart rate, steps over the whole row — and the 12-hour clock
shot("feature-watch", "autumn", "15:12", o={"zeile1": True, "zeile5": True, "inhalt_1l": 20, "inhalt_1r": 1, "inhalt_2l": 21, "inhalt_2r": 23,
                                           "inhalt_5l": 22, "inhalt_5r": 0}, f={"z_unter": "55FF55", "z_auf": "FFAA00"}, env_mehr={"H12": "1"})
# free text: one letter above every digit, four per row when the right block is empty
shot("feature-text", "autumn", "10:33", o={"zeile1": True, "zeile5": True, "inhalt_1l": 19, "text_1l": "GOOD", "inhalt_1r": 0,
                                          "inhalt_5l": 19, "text_5l": "DAY!", "inhalt_5r": 0}, f={"z_auf": "FFFF55", "z_unter": "FFFF55"})
# time axis: the whole day 00–24 h, and the night 16–08 h with midnight in the middle
shot("axis-24", "night", "22:10", o={"achse": 1, "regen_rel": True})
shot("axis-night", "night", "23:40", o={"achse": 2, "regen_rel": True})
# one main colour for every digit, a 3D edge per block
shot("feature-colors", "april", "12:05", o={"zeile1": True, "inhalt_1l": 20, "inhalt_1r": 1},
     f={"haupt": "FFAA55", "kante": "AA0000", "kante_1l": "0055FF", "kante_1r": "0055FF", "ziffer": "FFFFFF", "kante_zeit": "550055"})
# an outline per block and for the time (0.32.0): blue around the time, own colours in rows 2 and 4, row 5 with the common one
shot("feature-outlines", "autumn", "10:33", o={"zeile5": True},
     f={"rand_zeit": "00AAFF", "rand_2l": "FF55AA", "rand_2r": "FF55AA", "rand_4l": "55FF55", "rand_4r": "FFAA00"})
# layers (0.33.0): default order, then rain in front of the bars and the time lines in front of everything, digits included
shot("feature-layers-default", "april", "12:05", o={"tageslinie": True, "voll_v": True, "staerke_v": 4})
shot("feature-layers", "april", "12:05", o={"tageslinie": True, "voll_v": True, "staerke_v": 4, "ebenen": "013425786"})
# time zone (0.36.0): the abbreviation across row 1, the offset in row 5 next to the weekday (zone of the Mac preview: Berlin)
shot("feature-timezone", "autumn", "10:33", o={"zeile1": True, "inhalt_1l": 32, "inhalt_1r": 0, "zeile5": True, "inhalt_5l": 32, "inhalt_5r": 20},
     env_mehr={"TZ": "Europe/Berlin"})
# symbols (0.34.0): flat by default, new ones (butterfly, sleeping smiley, two alpacas, fluffy cloud), colours per symbol
shot("feature-symbol-colors", "autumn", "21:40", o={"zeile1": True, "zeile5": True, "inhalt_1l": 98, "zweit_1l": 99, "inhalt_1r": 100, "zweit_1r": 101,
     "inhalt_5l": 102, "zweit_5l": 90, "inhalt_5r": 76, "zweit_5r": 81},
     f={"sy34p": "FF55AA", "sy34s": "AA0055", "sy35p": "FFFF55", "sy35s": "AA5500", "sy36p": "FFFFAA", "sy36s": "550055", "sy37p": "FFFFFF", "sy37s": "000000",
        "sy38p": "AAFFFF", "sy26p": "FF0055", "sy12p": "FFFF55", "sy17p": "FFFFAA", "sy17s": "555555"})

# ---------- Settings page (Brave or Chrome headless; BROWSER=<path> to choose) ----------
BROWSER = os.environ.get("BROWSER") or next((b for b in ("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
                                                         "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") if os.path.exists(b)), None)
SEITE_JS = """var speicher=JSON.parse(process.argv[1]),url=null,zeigen=null;
global.localStorage={getItem:function(k){return k in speicher?speicher[k]:null;},setItem:function(){},removeItem:function(){}};
global.Pebble={addEventListener:function(n,f){if(n==='showConfiguration')zeigen=f;},openURL:function(u){url=u;},sendAppMessage:function(){}};
global.navigator={};require('./src/pkjs/index.js');zeigen();process.stdout.write(Buffer.from(url.split(',')[1],'base64').toString('utf8'));"""   # Base64 since 0.30.0
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
seite("settings-top", "", 1080)
seite("settings-rows", offen("zahlen"), 1500)
seite("settings-presets", offen("presets", "teilen=0;"), 1250)
seite("settings-sun", offen("sonne", "z.tag.optionen.sonne=true;z.tag.optionen.sonne_streifen=true;"), 1600)
seite("settings-german", "sp='de';" + offen("regen"), 1150)
seite("settings-digits", offen("ziffern"), 1500)
seite("settings-layers", offen("ebenen", "z.tag.optionen.ebenen='013425786';"), 1500)   # 0.33.0
seite("settings-symbols", offen("ziffern", "symWahl=36;z.tag.farben.sy36p='FFFFAA';z.tag.farben.sy36s='550055';z.tag.farben.sy34p='FF55AA';z.tag.farben.sy26p='FF0055';"), 2600)   # 0.34.0
seite("settings-picker", offen("zahlen", "offen='pk:inhalt_2r';"), 2000)   # 0.34.0: content menu                 # 0.30.0: main colour, 3D edge, symbol families
