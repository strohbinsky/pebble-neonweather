"""Neonweather symbols as pixel masks on the digit cell (34 × 34), slopes on a 2 px grid.
Source for tools/symbole_erzeugen.py (→ src/c/symbole.h, src/pkjs/symbole.js) and tools/symbole_entwurf.py.
Symbols made of several parts (ZUSAMMEN) are drawn by the watch part by part, each with its own outline."""
import math

ST, ZB, ZH, MY = 8, 34, 34, 13

# ---------- Masks ----------
def rect(x, y, w, h): return {(i, j) for i in range(x, x + w) for j in range(y, y + h)}
def raster(f, w=34, h=34, q=2):          # area on a q px grid: a cell is set when its centre lies inside
    m = set()
    for gx in range(0, w, q):
        for gy in range(0, h, q):
            if f(gx + q / 2, gy + q / 2): m |= rect(gx, gy, q, q)
    return m
def in_poly(pts):
    def f(x, y):
        c = False
        for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
        return c
    return f
def in_disc(cx, cy, r): return lambda x, y: (x - cx) ** 2 + (y - cy) ** 2 <= r * r
def in_linie(a, b, d):                    # thick stroke from a to b
    def f(x, y):
        dx, dy = b[0] - a[0], b[1] - a[1]
        t = max(0, min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)))
        return math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) <= d / 2
    return f
def oder(*fs): return lambda x, y: any(f(x, y) for f in fs)
def spiegel_y(m, h=34): return {(x, h - 1 - y) for x, y in m}
def spiegel_x(m, w=34): return {(w - 1 - x, y) for x, y in m}
def drehen(m, w=34): return {(w - 1 - y, x) for x, y in m}          # 90° clockwise

# ---------- Digits like main.c ----------
SEGM = [(0, 0, ZB, ST), (ZB - ST, 0, ST, MY + ST), (ZB - ST, MY, ST, ZH - MY), (0, ZH - ST, ZB, ST),
        (0, MY, ST, ZH - MY), (0, 0, ST, MY + ST), (0, MY, ZB, ST)]
MASKE = {"0": 0x3F, "2": 0x5B, "3": 0x4F, "4": 0x66, "5": 0x6D, "6": 0x7D, "7": 0x07, "8": 0x7F, "9": 0x6F, "-": 0x40}
def ziffer(c):
    if c == "1":
        bx = (ZB - ST) // 2 + ST // 2
        return rect(bx, 0, ST, ZH) | rect(bx - ST, 0, ST, ST) | rect(bx - ST, ZH - ST, 3 * ST, ST)
    if c == "-": return rect(ST, MY, ZB - 2 * ST, ST)
    m = set()
    for i in range(7):
        if MASKE.get(c, 0) & (1 << i): m |= rect(*SEGM[i])
    return m

# ---------- Symbols (cell 34 × 34) ----------
def pfeil_hoch():
    return rect(13, 0, 8, 4) | rect(9, 4, 16, 4) | rect(5, 8, 24, 4) | rect(1, 12, 32, 4) | rect(13, 16, 8, 18)
def pfeil_schraeg():                      # towards the top right
    return raster(oder(in_poly([(33, 1), (12, 3), (31, 22)]), in_linie((3, 31), (22, 12), 8)))
def in_rrect(x0, y0, x1, y1, r):          # rectangle with round corners
    return lambda x, y: math.hypot(max(x0 + r - x, 0, x - x1 + r), max(y0 + r - y, 0, y - y1 + r)) <= r
GRUNDWOLKE = oder(in_disc(9, 22, 6), in_disc(20, 14, 9), in_rrect(2, 19, 32, 31, 6))   # small bump on the left, big one on the right, flat bottom
def fuellen(m, w=34, h=34):                # close grid gaps inside (the watch knows no holes in symbols)
    aussen, stapel = set(), [(-1, -1)]
    while stapel:
        p = stapel.pop()
        if p in aussen or p in m or not (-1 <= p[0] <= w and -1 <= p[1] <= h): continue
        aussen.add(p); x, y = p; stapel += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return m | {(x, y) for x in range(w) for y in range(h) if (x, y) not in aussen}
def wolke(dx=0, dy=0, s=1.0): return fuellen(raster(lambda x, y: GRUNDWOLKE((x - dx) / s, (y - dy) / s)))
def sonne():                              # disc and eight square rays, gaps ≥ 3 px
    return (raster(in_disc(17, 17, 7)) | rect(14, 0, 6, 6) | rect(14, 28, 6, 6) | rect(0, 14, 6, 6) | rect(28, 14, 6, 6)
            | rect(3, 3, 6, 6) | rect(25, 3, 6, 6) | rect(3, 25, 6, 6) | rect(25, 25, 6, 6))
SYMBOLE = {
    "STEIGT": pfeil_hoch(),
    "LEICHT HOCH": pfeil_schraeg(),
    "GLEICH": drehen(pfeil_hoch()),
    "LEICHT RUNTER": spiegel_y(pfeil_schraeg()),
    "FAELLT": spiegel_y(pfeil_hoch()),
    "SCHIRM": rect(11, 0, 12, 4) | rect(5, 4, 24, 4) | rect(2, 8, 30, 4) | rect(0, 12, 34, 6) | rect(16, 18, 6, 16) | rect(6, 28, 16, 6) | rect(6, 23, 6, 11),
    "FROST": raster(oder(*[in_linie((17 + 16 * math.cos(w), 17 + 16 * math.sin(w)), (17 - 16 * math.cos(w), 17 - 16 * math.sin(w)), 6)
                          for w in (math.pi / 2, math.pi / 6, 5 * math.pi / 6)])),
    "GEWITTER": raster(in_poly([(13, 0), (29, 0), (21, 12), (31, 12), (9, 34), (15, 18), (5, 18)])),
    "STURM": rect(0, 6, 22, 6) | rect(22, 0, 6, 12) | rect(0, 16, 34, 6) | rect(0, 26, 16, 6) | rect(16, 26, 6, 8),
    "SONNE": sonne(),
    "WOLKE": wolke(),
    "REGEN": wolke(4, -5, 0.8) | raster(oder(*[in_linie((x, 26), (x - 3, 33), 4) for x in (10, 19, 28)])),
    "SCHNEE": wolke(4, -5, 0.8) | rect(5, 27, 6, 6) | rect(15, 27, 6, 6) | rect(25, 27, 6, 6),
    "NEBEL": rect(0, 2, 20, 6) | rect(24, 2, 10, 6) | rect(4, 14, 30, 6) | rect(0, 26, 12, 6) | rect(16, 26, 18, 6),
    "SICHEL ZU": raster(lambda x, y: in_disc(17, 17, 15.5)(x, y) and not in_disc(5, 17, 15.5)(x, y), q=1),
    "HALB ZU": raster(lambda x, y: in_disc(17, 17, 15.5)(x, y) and x >= 17, q=1),
    "VOLL": raster(in_disc(17, 17, 15.5), q=1),
    "HALB AB": raster(lambda x, y: in_disc(17, 17, 15.5)(x, y) and x < 17, q=1),
    "SICHEL AB": raster(lambda x, y: in_disc(17, 17, 15.5)(x, y) and not in_disc(29, 17, 15.5)(x, y), q=1),
}
# Composite: several shapes on top of each other, each with its own outline (order = drawing order)
ZUSAMMEN = {
    "SONNE WOLKE": [(raster(in_disc(23, 11, 9)), 0, 0), (wolke(0, 8, 0.8), 0, 0)],
    "WINDSACK": [(rect(0, 0, 5, 34), 0, 0), (rect(7, 2, 8, 16), 0, 0), (rect(17, 4, 7, 12), 0, 0), (rect(26, 6, 8, 8), 0, 0)],
    "VERALTET": [(wolke(), 0, 0), (raster(in_linie((2, 32), (32, 2), 6)), 0, 0)],
}
REIHEN = [["STEIGT", "LEICHT HOCH", "GLEICH", "LEICHT RUNTER", "FAELLT"],
          ["SCHIRM", "FROST", "GEWITTER", "STURM", "WINDSACK", "VERALTET"],
          ["SONNE", "WOLKE", "SONNE WOLKE", "REGEN", "SCHNEE", "NEBEL"],
          ["SICHEL ZU", "HALB ZU", "VOLL", "HALB AB", "SICHEL AB"]]
def formen(name): return ZUSAMMEN[name] if name in ZUSAMMEN else [(SYMBOLE[name], 0, 0)]


# Gibbous moon (since 0.22.0 for phases 3 and 5): lit half plus an ellipse across the middle
SYMBOLE["DREIVIERTEL ZU"] = raster(lambda x, y: in_disc(17, 17, 15.5)(x, y) and (x >= 17 or ((x - 17) / 8) ** 2 + ((y - 17) / 15.5) ** 2 <= 1), q=1)
SYMBOLE["DREIVIERTEL AB"] = spiegel_x(SYMBOLE["DREIVIERTEL ZU"])
# Order on the watch = enum SYM_… in src/c/symbole.h; moon phases 0–7 in a row from NEUMOND
UHR = ["STEIGT", "LEICHT HOCH", "GLEICH", "LEICHT RUNTER", "FAELLT", "SCHIRM", "FROST", "GEWITTER", "WINDSACK", "VERALTET",
       "SONNE", "WOLKE", "SONNE WOLKE", "REGEN", "SCHNEE", "NEBEL",
       "NEUMOND", "SICHEL ZU", "HALB ZU", "DREIVIERTEL ZU", "VOLL", "DREIVIERTEL AB", "HALB AB", "SICHEL AB"]
# Moon on the watch: first the whole disc flat in the edge colour (unlit, no 3D edge), the lit part on top
MONDE = UHR[-8:]
SCHEIBE = raster(in_disc(17, 17, 15.5), q=1)
# Names in the "Fixed symbols" list (since 0.22.0) — same order as UHR; logik_test.js checks logik.js against them
NAMEN = {"STEIGT": "Arrow up", "LEICHT HOCH": "Arrow up-right", "GLEICH": "Arrow right", "LEICHT RUNTER": "Arrow down-right",
         "FAELLT": "Arrow down", "SCHIRM": "Umbrella", "FROST": "Snowflake", "GEWITTER": "Lightning", "WINDSACK": "Windsock",
         "VERALTET": "Cloud crossed out", "SONNE": "Sun", "WOLKE": "Cloud", "SONNE WOLKE": "Sun and cloud", "REGEN": "Rain cloud",
         "SCHNEE": "Snow cloud", "NEBEL": "Fog", "NEUMOND": "New moon", "SICHEL ZU": "Waxing crescent", "HALB ZU": "First quarter",
         "DREIVIERTEL ZU": "Waxing gibbous", "VOLL": "Full moon", "DREIVIERTEL AB": "Waning gibbous",
         "HALB AB": "Last quarter", "SICHEL AB": "Waning crescent"}
