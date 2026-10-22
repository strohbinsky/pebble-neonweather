// Neonweather — watchface for the Pebble Time 2 (emery, 200 x 228).
// Pressure at the top (one dash per hour), rain as filled columns at the bottom, 17 hours from 04:00.
// In the middle date / time in its bar / low and high as bold seven-segment digits with a 3D edge.
// Design: draft v7, digits after v8 D, shadow and time marker after v10 C/E, columns after v11 C
// (design script watchface_entwurf.py, not in the repo). The phone fetches the weather (src/pkjs), at most hourly.
// Since 0.22.0 symbols and temperature curve as block content (tools/symbole.py → symbole.h, draft tools/symbole_entwurf.py).
#include <pebble.h>
#include "symbole.h"

#define ABRUF_S       3600   // weather at most hourly
#define WIEDERHOLEN_S 900    // no answer / no network: ask again every 15 min (until 0.6.1 every minute — battery)
#define SERVER_S      1800   // server or data error: not before 30 min
#define STUNDEN       17     // 04..20 h
#define TAG_LEN       (2 * STUNDEN + 10)  // rain, pressure, low, high, sun: sunrise, sunset, dawn, dusk (minutes, 2 bytes each)
#define ERW_LEN       48     // since 0.22.0 per day: 24 × temperature 00–23 h (int8), 24 × weather (bits 0–2 kind, 3–7 gusts / 5 km/h)
#define WETTER_LEN    (2 * TAG_LEN + 2 * ERW_LEN)   // today and tomorrow (keeps data after midnight without the phone), followed by both extensions: 184
#define FORMAT        4      // storage format; bump on change and the watch drops old data (3: twilight, 0.12.0; 4: hourly values, 0.22.0)
#define FEHLT         255    // byte value for "no value"

enum { PK_WETTER = 1, PK_TAG, PK_STAND, PK_FORMAT, PK_THEMA_TAG = 20, PK_THEMA_NACHT, PK_NACHTMODUS };
// keys 5–19: settings stored one by one until 0.10.0, deleted on load

// ---------- Colours: all of them selectable in the settings (since 0.5.0) ----------
// Order = bytes of the FARBEN message = list FARBEN in src/pkjs/logik.js. One byte per colour: rrggbb, 2 bits each
enum { F_GRUND, F_SAEULE, F_REGEN, F_DRUCK, F_JETZT, F_ZIFFER, F_RAND, F_KANTE, F_BALKEN, F_TAG_B, F_MONAT_B, F_MIN_B, F_MAX_B,
       F_Z_TAG, F_Z_MONAT, F_Z_MIN, F_Z_MAX, F_S_NACHT, F_S_D1, F_S_D2, F_S_TAG, F_TLINIE, F_Z_AUF, F_Z_UNTER, F_AUF_B, F_UNTER_B,
       F_Z_AUF2, F_Z_UNTER2, F_AUF_B2, F_UNTER_B2, F_RAHMEN_Z, F_KURVE, F_K_KANTE, F_K_PUNKT,   // F_KURVE … since 0.22.0
       F_K_RAND, F_K_PKANTE, F_B_KURVE, F_B_KANTE, F_B_RAND, F_B_PUNKT, F_B_PKANTE,   // since 0.23.0
       F_S_AUF, F_S_UNTER, F_ANZAHL };              // sunrise and sunset stripes, since 0.26.0   // F_RAHMEN_Z since 0.19.0   // F_ZIFFER = digits of the time; always append new colours at the end (0.10.0: F_Z_…, 0.12.0: F_S_…, 0.14.0: sun rows)
// since 0.9.0 no own colours for past hours: every hour looks the same
static const int32_t FARBE_STD[F_ANZAHL] = {
  0x000000,   // background
  0x550055,   // columns, filled, subtle
  0x55AAFF,   // rain
  0xFF55FF,   // pressure
  0xFFFFFF,   // time marker
  0xFFFFFF,   // digits
  0x000000,   // digit outline
  0xAA00AA,   // 3D edge
  0x5500AA,   // time bar
  0x000055,   // bar day
  0x000055,   // bar month
  0x000055,   // bar low
  0x000055,   // bar high
  0xFFFFFF,   // digits day
  0xFFFFFF,   // digits month
  0xFFFFFF,   // digits low
  0xFFFFFF,   // digits high
  0x000000,   // sun: night
  0xAA0055,   // sun: twilight 1 (night side; the only one when solid)
  0xFF5500,   // sun: twilight 2 (day side)
  0xAA5500,   // sun: day
  0xFFFFFF,   // horizontal time-of-day line
  0xFFFFFF,   // digits sunrise
  0xFFFFFF,   // digits sunset
  0x000055,   // bar sunrise
  0x000055,   // bar sunset
  0xFFFFFF,   // digits row 1 right
  0xFFFFFF,   // digits row 5 right
  0x000055,   // bar row 1 right
  0x000055,   // bar row 5 right
  0x000000,   // frame around the time lines
  0xFFFFFF,   // temperature curve
  0xAA00AA,   // 3D edge of the curve
  0xFF55FF,   // "now" dot on the curve
  0x000000,   // outline of the temperature curve
  0xAA00AA,   // edge of the dot
  0xFF55FF,   // pressure curve
  0x5500AA,   // 3D edge of the pressure curve
  0x000000,   // outline of the pressure curve
  0xFFFFFF,   // "now" dot on the pressure curve
  0xAA00AA,   // edge of the dot
  0xFFAA00,   // sunrise stripe
  0xFF5500,   // sunset stripe
};
static uint8_t farb_code(int32_t hex) { return ((hex >> 16 & 255) / 85) << 4 | ((hex >> 8 & 255) / 85) << 2 | (hex & 255) / 85; }
// Theme = all settings; one for the day, one for the night (since 0.11.0). A points to the one in effect
// Number rows as blocks (0.14.0): row 1 at the top, 2, (3 = time, fixed), 4, 5 at the bottom; two blocks each, left/right.
// Block k: 0 R1L 1 R1R 2 R2L 3 R2R 4 R4L 5 R4R 6 R5L 7 R5R. Content freely selectable (message BLOECKE, 8 bytes)
enum { W_LEER, W_TAG, W_MONAT, W_TMIN, W_TMAX, W_AUF_H, W_AUF_M, W_UNTER_H, W_UNTER_M,
       W_TJETZT, W_TKURVE, W_BARO, W_BARO_HPA, W_SCHIRM, W_WARNUNG, W_WETTER, W_MOND, W_ALTER,   // W_TJETZT and up since 0.22.0
       W_BKURVE,                                    // 0.23.0; append new contents here, up to 63
       W_ENDE, W_FEST = 64 };                       // W_FEST + s: symbol s, fixed (order as enum SYM_…), since 0.23.0 from 64
static bool w_gueltig(int w) { return w < W_ENDE || (w >= W_FEST && w < W_FEST + SYM_ANZAHL); }
static const uint8_t BLOCK_STD[8] = { W_AUF_H, W_AUF_M, W_TAG, W_MONAT, W_TMIN, W_TMAX, W_UNTER_H, W_UNTER_M };
static const uint8_t F_BLOCK_Z[8] = { F_Z_AUF, F_Z_AUF2, F_Z_TAG, F_Z_MONAT, F_Z_MIN, F_Z_MAX, F_Z_UNTER, F_Z_UNTER2 };
static const uint8_t F_BLOCK_B[8] = { F_AUF_B, F_AUF_B2, F_TAG_B, F_MONAT_B, F_MIN_B, F_MAX_B, F_UNTER_B, F_UNTER_B2 };

typedef struct {
  uint8_t farbe[F_ANZAHL];
  uint16_t balken;                      // bits 0–7 bar per block, bit 8 bar of the time
  uint8_t block[8];                     // content per block (W_…)
  uint8_t zweit[8];                     // 0.22.0: symbol of the right cell when the block shows a symbol or nothing (message ZELLEN)
  uint8_t drucklage, regenlage, schwelle, dicke_v, dicke_h, dicke_d;   // pressure position 0–3, rain position 0 standard 1 bottom 2 off;
                                        // dicke_v/_h 1–20 px (message LINIEN, since 0.15.0), dicke_d 1–4 px
  bool zeitmarke, luftdruck, regenvoll, sonne, tageslinie, verlauf, druckvoll, zeile1, zeile5;
  bool saeulen;                         // 0.24.0: subtle column per hour in the background; off = rain only (message SCHALTER, bit 0)
  bool regen_hinter;                    // 0.25.0: day (since 0.25.1 also twilight) of the sun position in front of columns and rain (SCHALTER, bit 1)
  bool s_tag, s_daem, s_nacht;          // 0.26.0: sun position areas one by one (SCHALTER, bits 2–4); twilight off = night until sunrise
  bool streifen, streifen_voll;         // 0.26.0: sunrise and sunset stripes, solid or dashed (bits 5, 6)
  uint8_t dicke_s;                      // 0.26.0: stripe width 1–20 px (LINIEN byte 3)
  bool voll_v, voll_h, regen_vorn;     // 0.17.0: time lines solid instead of dashed; rain cuts through the vertical one
  bool regen_rel;                       // 0.18.0: rain relative to the daily maximum (both positions), with threshold
  bool rahmen_z;                        // 0.19.0: shared frame around the time lines (LINIEN byte 2)
} Thema;
static Thema s_th[2];
static const Thema *A = &s_th[0];
static bool s_nachtmodus;               // setting: night theme from sunset on
// Options as one number (message OPTIONEN, 0.14.0): bits 0–8 bars, 9–10 pressure position, 11–12 rain position, 13 time marker,
// 14 pressure, 15 rain full height, 16 sun position, 17 time-of-day line, 18 gradient, 19–21 threshold "rain at the bottom",
// 22 vertical time line solid, 23 horizontal solid, 24 rain in front of the vertical line, 25 rain relative,
// 26 baro continuous, 27–28 baro width −1, 29 row 1, 30 row 5.
// Default 160194816 = time bar, time marker, pressure, gradient, threshold 0.2 mm/h, horizontal solid, rain in front, baro 2 px
#define OPTIONEN_STD 160194816
static const uint8_t SCHWELLE_Z[5] = { 1, 2, 3, 5, 10 };   // tenths of mm/h: 0.1 0.2 0.3 0.5 1.0
static void optionen_setzen(Thema *t, int32_t o) {
  t->balken = o & 511; t->drucklage = o >> 9 & 3; t->regenlage = o >> 11 & 3; t->zeitmarke = o >> 13 & 1; t->luftdruck = o >> 14 & 1;
  t->regenvoll = o >> 15 & 1; t->sonne = o >> 16 & 1; t->tageslinie = o >> 17 & 1; t->verlauf = o >> 18 & 1;
  t->schwelle = (o >> 19 & 7) < 5 ? o >> 19 & 7 : 1;
  t->voll_v = o >> 22 & 1; t->voll_h = o >> 23 & 1; t->regen_vorn = o >> 24 & 1; t->regen_rel = o >> 25 & 1;
  t->druckvoll = o >> 26 & 1; t->dicke_d = (o >> 27 & 3) + 1;
  t->zeile1 = o >> 29 & 1; t->zeile5 = o >> 30 & 1;
}
static void thema_std(Thema *t) {
  for (int i = 0; i < F_ANZAHL; i++) t->farbe[i] = farb_code(FARBE_STD[i]);
  optionen_setzen(t, OPTIONEN_STD);
  for (int i = 0; i < 8; i++) { t->block[i] = BLOCK_STD[i]; t->zweit[i] = W_LEER; }
  t->dicke_v = 2; t->dicke_h = 1; t->saeulen = true;
  t->s_tag = t->s_daem = t->s_nacht = true; t->streifen_voll = true; t->dicke_s = 2;
}

static GColor farbe(int i) {
  const int c = A->farbe[i];
  return GColorFromHEX(((c >> 4 & 3) * 0x55) << 16 | ((c >> 2 & 3) * 0x55) << 8 | (c & 3) * 0x55);
}
#define C_GRUND   farbe(F_GRUND)
#define C_GEIST   farbe(F_SAEULE)
#define C_REGEN   farbe(F_REGEN)
#define C_DRUCK   farbe(F_DRUCK)
#define C_JETZT   farbe(F_JETZT)
#define C_ZIFFER  farbe(F_ZIFFER)
#define C_RAND    farbe(F_RAND)
#define C_KANTE   farbe(F_KANTE)
#define C_BALKEN  farbe(F_BALKEN)
// bars in row 2 or 4 (bits of blocks 2/3 or 4/5): pressure zones make way for them
#define DATUM_AN (A->balken & 0x0C)
#define TEMP_AN  (A->balken & 0x30)

// ---------- Dimensions (tools/test/entwurf_vergleich.py reads ST, ZB, ZH, TIEFE, TIEFE_LOCH from here) ----------
#define SAEULE_B 6           // column 6 px, gap 6 px: 12 px per hour
#define ST      8            // stroke width
#define ZB      34           // digit width
#define ZH      34           // digit height
#define MITTE_Y ((ZH - ST) / 2)
#define TIEFE   4            // 3D edge towards bottom right
#define TIEFE_LOCH 2         // only this deep inside the holes of 0, 2..9, otherwise they fill up
#define POL     4            // bars above and below the time
#define B_OBEN  (228 / 2 - (ZH + TIEFE + 2 * POL) / 2)   // 91
#define B_UNTEN (B_OBEN + ZH + TIEFE + 2 * POL)          // 137
#define Y_DATUM (B_OBEN - POL - ZH - TIEFE)              // 49
#define Y_ZEIT  (B_OBEN + POL)                           // 95
#define Y_TEMP  (B_UNTEN + POL)                          // 141
#define D_OBEN  (Y_DATUM - POL)                          // 45: date bar, same spacing as the time bar
#define T_UNTEN (Y_TEMP + ZH + TIEFE + POL)              // 183: bottom edge of the temperature bar (exclusive)
#define ZEILE   (ZH + TIEFE + 2 * POL)                   // 46: spacing of the number rows
#define Y_AUF   (Y_DATUM - ZEILE)                        // 3: sunrise above the date (0.14.0)
#define Y_UNTER (Y_TEMP + ZEILE)                         // 187: sunset below the temperature
static const int16_t SPALTE[4] = { 0, 54, 107, 161 };    // evenly spaced, the last edge ends at the right border

static Window *s_window;
static Layer *s_layer;
static GContext *g;

static uint8_t s_wetter[WETTER_LEN];
static int32_t s_tag;                  // data day YYYYMMDD of day 0
static int32_t s_stand;                // fetch time (UTC)
static bool s_hat_wetter;
static time_t s_letzte_anfrage;
static int s_warte_s = WIEDERHOLEN_S;

static int s_fehler;                   // 1 location, 2 network, 3 parsing, 4 server, 0 = none

// ---------- Helpers ----------
static void flaeche(int x, int y, int w, int h, GColor c) {
  graphics_context_set_fill_color(g, c);
  graphics_fill_rect(g, GRect(x, y, w, h), 0, GCornerNone);
}

static int rdiv(int a, int b) { return a >= 0 ? (a + b / 2) / b : -((-a + b / 2) / b); }   // rounded division

static int isqrt(int v) {
  int r = 0, b = 1 << 30;
  while (b > v) b >>= 2;
  while (b) { if (v >= r + b) { v -= r + b; r = (r >> 1) + b; } else r >>= 1; b >>= 2; }
  return r;
}

static int32_t tag_von(const struct tm *t) { return (t->tm_year + 1900) * 10000 + (t->tm_mon + 1) * 100 + t->tm_mday; }

static int32_t folgetag(int32_t tag) {
  struct tm t = { 0 };
  t.tm_year = tag / 10000 - 1900; t.tm_mon = tag / 100 % 100 - 1; t.tm_mday = tag % 100 + 1; t.tm_hour = 12;
  time_t z = mktime(&t);
  return tag_von(localtime(&z));
}

// Which stored day is today? 0, 1 or -1 (no data for today)
static int heute_index(void) {
  if (!s_hat_wetter) return -1;
  time_t now = time(NULL);
  const int32_t heute = tag_von(localtime(&now));
  if (heute == s_tag) return 0;
  if (heute == folgetag(s_tag)) return 1;
  return -1;
}

// ---------- Digits: seven segments without notches, 1 with flag and foot (draft v12 D) ----------
typedef struct { int16_t x, y, w, h; } Rechteck;   // int16: holes in screen coordinates reach up to x 200
static const Rechteck SEGM[7] = {        // since 0.6.0 horizontals across the full width: 3 and 7 sat 8 px too far right
  { 0, 0, ZB, ST },                        // a top
  { ZB - ST, 0, ST, MITTE_Y + ST },        // b top right
  { ZB - ST, MITTE_Y, ST, ZH - MITTE_Y },  // c bottom right
  { 0, ZH - ST, ZB, ST },                 // d bottom
  { 0, MITTE_Y, ST, ZH - MITTE_Y },        // e bottom left
  { 0, 0, ST, MITTE_Y + ST },              // f top left
  { 0, MITTE_Y, ZB, ST },                 // g middle
};

static uint8_t maske(char c) {   // bits a..g
  switch (c) {
    case '0': return 0x3F; case '2': return 0x5B; case '3': return 0x4F; case '4': return 0x66;
    case '5': return 0x6D; case '6': return 0x7D; case '7': return 0x07; case '8': return 0x7F;
    case '9': return 0x6F; case '-': return 0x40; default: return 0;
  }
}

// Draw a rectangle minus the holes: split it into up to 4 pieces per hole, finally grow each piece by d px
static void ohne_loecher(int ax, int ay, int aw, int ah, const Rechteck *lo, int nl, int d, GColor c) {
  if (aw <= 0 || ah <= 0) return;
  if (nl == 0) { flaeche(ax - d, ay - d, aw + 2 * d, ah + 2 * d, c); return; }
  const int ix = lo->x, iy = lo->y, ix2 = ix + lo->w, iy2 = iy + lo->h, ax2 = ax + aw, ay2 = ay + ah;
  if (ax >= ix2 || ax2 <= ix || ay >= iy2 || ay2 <= iy) { ohne_loecher(ax, ay, aw, ah, lo + 1, nl - 1, d, c); return; }
  const int oy = ay < iy ? iy : ay, uy = ay2 > iy2 ? iy2 : ay2;
  if (ay < iy)   ohne_loecher(ax, ay, aw, iy - ay, lo + 1, nl - 1, d, c);
  if (ay2 > iy2) ohne_loecher(ax, iy2, aw, ay2 - iy2, lo + 1, nl - 1, d, c);
  if (ax < ix)   ohne_loecher(ax, oy, ix - ax, uy - oy, lo + 1, nl - 1, d, c);
  if (ax2 > ix2) ohne_loecher(ix2, oy, ax2 - ix2, uy - oy, lo + 1, nl - 1, d, c);
}

// Closed holes of a digit (relative to the cell): 0 one big, 8 two, 9 top, 6 bottom, otherwise none.
// Until 0.6.0 the whole interior was clipped, open areas too (above the crossbar of the 4) — the shadow looked off
static int loecher(char c, Rechteck *lo) {
  if (c == '1' || c == '-') return 0;
  const uint8_t m = maske(c); int n = 0;                       // bits a=1 b=2 c=4 d=8 e=16 f=32 g=64
  if ((m & 0x3F) == 0x3F && !(m & 0x40)) { lo[0] = (Rechteck){ ST, ST, ZB - 2 * ST, ZH - 2 * ST }; return 1; }
  if ((m & 0x63) == 0x63) lo[n++] = (Rechteck){ ST, ST, ZB - 2 * ST, MITTE_Y - ST };                  // a b f g
  if ((m & 0x5C) == 0x5C) lo[n++] = (Rechteck){ ST, MITTE_Y + ST, ZB - 2 * ST, ZH - 2 * ST - MITTE_Y };  // c d e g
  return n;
}

// Draw a shape made of rectangles with black outline and 3D edge: first the outline around all layers, then the edge, then the face.
// Edge layers deeper than TIEFE_LOCH skip the closed holes so they stay open
static void form(const Rechteck *r, int n, int x, int y, const Rechteck *lo_rel, int nl, GColor face) {
  Rechteck lo[2];
  for (int j = 0; j < nl; j++) lo[j] = (Rechteck){ x + lo_rel[j].x, y + lo_rel[j].y, lo_rel[j].w, lo_rel[j].h };
  for (int k = 0; k <= TIEFE; k++)
    for (int i = 0; i < n; i++)
      ohne_loecher(x + r[i].x + k, y + r[i].y + k, r[i].w, r[i].h, lo, k > TIEFE_LOCH ? nl : 0, 1, C_RAND);
  for (int k = TIEFE; k >= 1; k--)
    for (int i = 0; i < n; i++)
      ohne_loecher(x + r[i].x + k, y + r[i].y + k, r[i].w, r[i].h, lo, k > TIEFE_LOCH ? nl : 0, 0, C_KANTE);
  for (int i = 0; i < n; i++) flaeche(x + r[i].x, y + r[i].y, r[i].w, r[i].h, face);
}

static void ziffer(char c, int x, int y, GColor face) {
  Rechteck r[7]; int n = 0;
  if (c == '1') {                          // stroke slightly right of centre, flag and foot: fills the cell like the others
    const int bx = (ZB - ST) / 2 + ST / 2;
    r[0] = (Rechteck){ bx, 0, ST, ZH }; r[1] = (Rechteck){ bx - ST, 0, ST, ST }; r[2] = (Rechteck){ bx - ST, ZH - ST, 3 * ST, ST }; n = 3;
  }
  else if (c == '-') { r[0] = (Rechteck){ ST, MITTE_Y, ZB - 2 * ST, ST }; n = 1; }   // minus stays short
  else { const uint8_t m = maske(c); for (int i = 0; i < 7; i++) if (m & (1 << i)) r[n++] = SEGM[i]; }
  Rechteck lo[2];
  const int nl = loecher(c, lo);
  if (n) form(r, n, x, y, lo, nl, face);
}

static void minus_bei_eins(int x, int y, GColor face) {   // -10..-19: short minus left of the centred 1
  const Rechteck r = { 0, MITTE_Y, (ZB - ST) / 2 - 5, ST };
  form(&r, 1, x, y, NULL, 0, face);
}

// Four digits; the left two in one colour, the right two in a second one (day/month, low/high)
static void zeile(const char *z, int y, GColor links, GColor rechts) { for (int i = 0; i < 4; i++) ziffer(z[i], SPALTE[i], y, i < 2 ? links : rechts); }

// Temperature in two cells: ≥ 0 "06", -1..-9 "-6", -10..-19 "12" with a minus next to the 1, below that -19 is shown
static bool temp_zellen(int v, char *z) {
  if (v == -128) { z[0] = z[1] = '-'; return false; }
  if (v > 99) v = 99;
  if (v >= 0) { z[0] = '0' + v / 10; z[1] = '0' + v % 10; return false; }
  if (v > -10) { z[0] = '-'; z[1] = '0' - v; return false; }
  if (v < -19) v = -19;
  z[0] = '1'; z[1] = '0' + (-v) % 10; return true;
}

// ---------- Drawing ----------
// Square-root scale. Standard: 1 mm/h reaches the time bar (umbrella), more goes further up.
// Bottom (since 0.13.0): relative to the daily maximum vmax (only hours from the threshold count), at least 2 px; nothing below the threshold
static int regen_px(int zehntel, int vmax) {
  if (zehntel <= 0) return 0;
  if (A->regenlage == 2) return 0;                                            // rain off
  const bool unten = A->regenlage == 1;                                       // until 0.12.2 also forced by the low/high bars
  const int hmax = unten ? 228 - T_UNTEN : 228;                               // strip below row 4 or full height
  if (A->regen_rel) {                                // 0.18.0 for both positions: daily maximum = full height, nothing below the threshold
    if (zehntel < SCHWELLE_Z[A->schwelle] || vmax <= 0) return 0;
    if (A->regenvoll) return hmax;
    const int h = rdiv(hmax * zehntel, vmax);
    return h < 2 ? 2 : h;
  }
  if (A->regenvoll) return hmax;                                              // full height: every rainy hour fills its column
  if (unten) {                                       // fixed scale in the strip: half height = 1 mm/h, full from 4 mm/h (as until 0.12)
    const int h = (isqrt(5 * hmax * hmax * zehntel / 2) + 5) / 10;
    return h > hmax ? hmax : h;
  }
  const int hz = 228 - B_UNTEN;
  return (isqrt(hz * hz * 1000 * zehntel / 100) + 5) / 10;
}

// byte = hPa * 2 - 1900. Scale 985 hPa (bottom) to 1040 hPa (top) in the selected zone:
// 0 upper half down to just above the bar, 1 between border and date, 2 between temperature and border, 3 lower half
static int druck_y(int b) {
  int o, u;
  switch (A->drucklage) {
    case 1:  o = 2;                      u = DATUM_AN ? D_OBEN - 3 : Y_DATUM - 4; break;
    case 2:  o = TEMP_AN ? T_UNTEN + 2 : Y_TEMP + ZH + TIEFE + 3; u = 228 - 2; break;
    case 3:  o = TEMP_AN ? T_UNTEN + 2 : B_UNTEN + 2;            u = 228 - 2; break;
    default: o = A->zeile1 && (A->balken & 3) ? D_OBEN + 2 : 2; u = DATUM_AN ? D_OBEN - 3 : B_OBEN - 3; break;
  }                                     // date and temperature bars are never covered (since 0.8.0)
  const int y = u - rdiv((b + 1900 - 1970) * (u - o), 110);
  return y < o - 2 ? o - 2 : y > u ? u : y;
}

// night = before sunrise or from sunset (local minutes from the weather packet); without sun data always day
static int sonne_min(const uint8_t *d, int i) {
  const int v = d[2 * STUNDEN + 2 + 2 * i] | d[2 * STUNDEN + 3 + 2 * i] << 8;
  return v == 0xFFFF ? -1 : v;
}
static bool ist_nacht(int jm) {
  const int t = heute_index();
  if (!s_nachtmodus || t < 0) return false;
  const int auf = sonne_min(s_wetter + t * TAG_LEN, 0), unter = sonne_min(s_wetter + t * TAG_LEN, 1);
  return auf >= 0 && unter >= 0 && (jm < auf || jm >= unter);
}

// Is (x, y) under a bar that is switched on? (bars are above the rain; also applies to the cut-through)
static bool unter_balken(int x, int y) {
  const int sei = x >= 100;
  if ((A->balken & 256) && y >= B_OBEN && y < B_UNTEN) return true;
  if (y < D_OBEN) return A->zeile1 && (A->balken >> sei & 1);
  if (y < B_OBEN) return A->balken >> (2 + sei) & 1;
  if (y < B_UNTEN) return false;
  if (y < T_UNTEN) return A->balken >> (4 + sei) & 1;
  return A->zeile5 && (A->balken >> (6 + sei) & 1);
}

// ---------- Hourly values (since 0.22.0): hour H = 0–47 from midnight of day 0 ----------
static int temp_h(int H) {                        // whole degrees, -128 = missing
  return H < 0 || H >= 48 ? -128 : (int8_t)s_wetter[2 * TAG_LEN + H / 24 * ERW_LEN + H % 24];
}
static int wetter_h(int H) {                      // bits 0–2 kind, 3–7 gusts / 5 km/h; FEHLT = missing
  return H < 0 || H >= 48 ? FEHLT : s_wetter[2 * TAG_LEN + H / 24 * ERW_LEN + 24 + H % 24];
}
enum { ART_KLAR, ART_HEITER, ART_WOLKIG, ART_BEDECKT, ART_NEBEL, ART_REGEN, ART_SCHNEE, ART_GEWITTER };   // = wmoArt() in logik.js
#define STURM_BOE 13                              // gusts from 65 km/h (DWD: stormy gusts)
#define ALTER_S   (3 * ABRUF_S)                   // data counts as stale after 3 hours without a fetch

static int temp_jetzt(int t, int jm) {            // linear between two hourly values; -128 = missing
  const int H = t * 24 + jm / 60, a = temp_h(H), b = temp_h(H + 1);
  if (a == -128) return -128;
  return b == -128 ? a : a + rdiv((b - a) * (jm % 60), 60);
}
// Pressure at minute m from midnight of day 0 in 1/20 hPa: from the hourly values 04–20 h of both days, linear in between
// (also across the night 20–04 h); -1 = unknown
static int druck_um(int m) {
  int m0 = -1, b0 = 0, m1 = -1, b1 = 0;
  for (int d = 0; d < 2; d++)
    for (int i = 0; i < STUNDEN; i++) {
      const int b = s_wetter[d * TAG_LEN + STUNDEN + i], mi = d * 1440 + (4 + i) * 60;
      if (b == FEHLT) continue;
      if (mi <= m) { m0 = mi; b0 = b; }
      else if (m1 < 0) { m1 = mi; b1 = b; }
    }
  if (m0 < 0) return -1;
  if (m0 == m) return b0 * 10;
  if (m1 < 0) return -1;
  return b0 * 10 + rdiv((b1 - b0) * 10 * (m - m0), m1 - m0);
}
#define UNBEKANNT -9999
static int tendenz(int t, int jm) {               // pressure change over the last 3 hours in 1/20 hPa
  const int m = t * 1440 + jm, a = druck_um(m), b = druck_um(m - 180);
  return a < 0 || b < 0 ? UNBEKANNT : a - b;
}
static int art_bits(int t, int jm, int n, int *boe) {   // current and n − 1 following hours: one bit per kind, highest gust
  int bits = 0; *boe = 0;
  for (int i = 0, H = t * 24 + jm / 60; i < n; i++, H++) {
    const int w = wetter_h(H);
    if (w == FEHLT) continue;
    bits |= 1 << (w & 7);
    if (w >> 3 > *boe) *boe = w >> 3;
  }
  return bits;
}
static bool frost(int t, int jm) {                // 0 °C or colder in the next 12 hours
  for (int i = 0, H = t * 24 + jm / 60; i < 12; i++, H++) { const int v = temp_h(H); if (v != -128 && v <= 0) return true; }
  return false;
}
static int mondphase(time_t now) {                // 0 new moon, 1 waxing crescent … 4 full moon … 7 waning crescent
  const int32_t P = 2551443;                      // synodic month (29.53 days) in s; reference: new moon 6 Jan 2000 18:14 UTC
  int32_t a = (int32_t)((int64_t)(now - 947182440) % P);
  if (a < 0) a += P;
  return (int)(((int64_t)a * 8 + P / 2) / P) % 8;
}

// Shape from a bitmask (rows, bit 7 = left column, cell q × q px): outline around all layers, edge, face — like form()
static void laeufe(const uint8_t *m, int bw, int bh, int q, int x, int y, int d, GColor c) {
  const int stride = (bw + 7) / 8;
  for (int r = 0; r < bh; r++) {
    int s = -1;
    for (int i = 0; i <= bw; i++) {
      const bool b = i < bw && (m[r * stride + i / 8] >> (7 - i % 8) & 1);
      if (b && s < 0) s = i;
      if (!b && s >= 0) { flaeche(x + s * q - d, y + r * q - d, (i - s) * q + 2 * d, q + 2 * d, c); s = -1; }
    }
  }
}
static void bits_form(const uint8_t *m, int bw, int bh, int q, int x, int y, GColor face, GColor kante, GColor rand) {
  for (int k = 0; k <= TIEFE; k++) laeufe(m, bw, bh, q, x + k, y + k, 1, rand);
  for (int k = TIEFE; k >= 1; k--) laeufe(m, bw, bh, q, x + k, y + k, 0, kante);
  laeufe(m, bw, bh, q, x, y, 0, face);
}
static void symbol(int s, int x, int y, GColor face) {   // part by part, each with its own outline; dark parts flat in the edge colour
  for (int i = SYM_START[s]; i < SYM_START[s + 1]; i++) {
    if (!SYM_DUNKEL[i]) { bits_form(SYM_TEIL[i], SYM_GROESSE, SYM_GROESSE, 1, x, y, face, C_KANTE, C_RAND); continue; }
    laeufe(SYM_TEIL[i], SYM_GROESSE, SYM_GROESSE, 1, x, y, 1, C_RAND);
    laeufe(SYM_TEIL[i], SYM_GROESSE, SYM_GROESSE, 1, x, y, 0, C_KANTE);
  }
}

// Curves 04–20 h in a block (temperature since 0.22.0, pressure since 0.23.0): 88 × 34 px on a 2 px grid, stroke 6 px,
// dot at the current time, all colours selectable per curve. Maths in 1/16 px: hour i at x = 3 + i · 82/16
static bool nah(int cx, int cy, int ax, int ay, int bx, int by) {   // distance dot–segment ≤ 3 px
  const int dx = bx - ax, dy = by - ay, ex = cx - ax, ey = cy - ay, R2 = 48 * 48;
  const int32_t dot = ex * dx + ey * dy, len2 = dx * dx + dy * dy;
  if (dot <= 0) return ex * ex + ey * ey <= R2;
  if (dot >= len2) return (cx - bx) * (cx - bx) + (cy - by) * (cy - by) <= R2;
  const int64_t cr = (int64_t)ex * dy - (int64_t)ey * dx;
  return cr * cr <= (int64_t)R2 * len2;
}
#define KEIN -9999                                // curve value missing
// Curve from 17 hourly values v (KEIN = missing), scale lo (bottom) to hi (top); f = colours line, edge, outline, dot, edge of the dot
static void kurve(const int *v, int lo, int hi, int jm, int x, int y, const uint8_t *f) {
  int px[STUNDEN], py[STUNDEN];
  for (int i = 0; i < STUNDEN; i++) { px[i] = 48 + 82 * i; py[i] = v[i] == KEIN ? 0 : (hi > lo ? rdiv(28 * (hi - v[i]), hi - lo) : 14) * 16 + 48; }
  uint8_t m[17 * 6];
  memset(m, 0, sizeof m);
  for (int gy = 0; gy < 17; gy++)
    for (int gx = 0; gx < 44; gx++) {
      const int cx = (2 * gx + 1) * 16, cy = (2 * gy + 1) * 16;
      int i0 = (cx - 178) / 82, i1 = cx / 82;     // only segments close enough in x
      if (i0 < 0) i0 = 0;
      if (i1 > STUNDEN - 2) i1 = STUNDEN - 2;
      for (int i = i0; i <= i1; i++)
        if (v[i] != KEIN && v[i + 1] != KEIN && nah(cx, cy, px[i], py[i], px[i + 1], py[i + 1])) { m[gy * 6 + gx / 8] |= 0x80 >> (gx % 8); break; }
    }
  bits_form(m, 44, 17, 2, x, y, farbe(f[0]), farbe(f[1]), farbe(f[2]));
  if (jm < 240 || jm > 1200) return;               // dot only 04:00–20:00
  const int i = (jm - 240) / 60;
  if (v[i] == KEIN) return;
  int yy = py[i];
  if (i + 1 < STUNDEN && v[i + 1] != KEIN) yy += rdiv((py[i + 1] - py[i]) * ((jm - 240) % 60), 60);
  static const uint8_t PUNKT[8] = { 255, 255, 255, 255, 255, 255, 255, 255 };
  bits_form(PUNKT, 8, 8, 1, x + (48 + rdiv(82 * (jm - 240), 60)) / 16 - 4, y + yy / 16 - 4, farbe(f[3]), farbe(f[4]), farbe(f[2]));
}
static void temp_kurve(int t, int jm, int x, int y) {   // low at the bottom, high at the top
  static const uint8_t F[5] = { F_KURVE, F_K_KANTE, F_K_RAND, F_K_PUNKT, F_K_PKANTE };
  int v[STUNDEN], lo = 127, hi = -127, n = 0;
  for (int i = 0; i < STUNDEN; i++) {
    const int w = temp_h(t * 24 + 4 + i);
    v[i] = w == -128 ? KEIN : w;
    if (w == -128) continue;
    n++; if (w < lo) lo = w; if (w > hi) hi = w;
  }
  if (n) kurve(v, lo, hi, jm, x, y, F);
}
// Pressure curve (since 0.23.0): shows the trend of the day. Daily range, but at least 8 hPa from bottom to top —
// a calm day stays flat, a low shows up. Byte = 0.5 hPa
#define DRUCK_SPANNE 16
static void druck_kurve(int t, int jm, int x, int y) {
  static const uint8_t F[5] = { F_B_KURVE, F_B_KANTE, F_B_RAND, F_B_PUNKT, F_B_PKANTE };
  const uint8_t *d = s_wetter + t * TAG_LEN;
  int v[STUNDEN], lo = 1000, hi = -1, n = 0;
  for (int i = 0; i < STUNDEN; i++) {
    const int b = d[STUNDEN + i];
    v[i] = b == FEHLT ? KEIN : b;
    if (b == FEHLT) continue;
    n++; if (b < lo) lo = b; if (b > hi) hi = b;
  }
  if (!n) return;
  if (hi - lo < DRUCK_SPANNE) { lo = (lo + hi - DRUCK_SPANNE) / 2; hi = lo + DRUCK_SPANNE; }
  kurve(v, lo, hi, jm, x, y, F);
}

// Cell contents (since 0.22.0): a symbol sits in a cell like a digit — fixed or when there is a reason.
// Numbers, curve and "baro with hPa" take the whole block
static bool ist_zelle(int w) { return w == W_LEER || w == W_BARO || (w >= W_SCHIRM && w <= W_ALTER) || (w >= W_FEST && w < W_FEST + SYM_ANZAHL); }
static int zell_symbol(int w, int t, int jm, time_t now) {   // symbol or -1 (no reason, no data)
  if (w >= W_FEST) return w - W_FEST;
  if (w == W_ALTER) return t < 0 || now - s_stand > ALTER_S ? SYM_VERALTET : -1;
  if (w == W_MOND) return SYM_NEUMOND + mondphase(now);
  if (t < 0) return -1;
  int boe;
  switch (w) {
    case W_BARO: {
      const int d = tendenz(t, jm), a = d < 0 ? -d : d;
      if (d == UNBEKANNT) return -1;
      return a < 10 ? SYM_GLEICH : a < 32 ? (d > 0 ? SYM_LEICHT_HOCH : SYM_LEICHT_RUNTER) : (d > 0 ? SYM_STEIGT : SYM_FAELLT);
    }
    case W_SCHIRM: return art_bits(t, jm, 3, &boe) & (1 << ART_REGEN | 1 << ART_GEWITTER) ? SYM_SCHIRM : -1;
    case W_WARNUNG: {                               // most important first: thunderstorm, storm (3 h), frost (12 h)
      const int a = art_bits(t, jm, 3, &boe);
      return a & 1 << ART_GEWITTER ? SYM_GEWITTER : boe >= STURM_BOE ? SYM_WINDSACK : frost(t, jm) ? SYM_FROST : -1;
    }
    case W_WETTER: {                                // current hour; at night the moon instead of the sun
      const int wv = wetter_h(t * 24 + jm / 60);
      if (wv == FEHLT) return -1;
      const uint8_t *d = s_wetter + t * TAG_LEN;
      const int au = sonne_min(d, 0), un = sonne_min(d, 1);
      const bool nacht = au >= 0 && un >= 0 && (jm < au || jm >= un);
      switch (wv & 7) {
        case ART_KLAR: case ART_HEITER: return nacht ? SYM_NEUMOND + mondphase(now) : SYM_SONNE;
        case ART_WOLKIG:  return nacht ? SYM_WOLKE : SYM_SONNE_WOLKE;
        case ART_BEDECKT: return SYM_WOLKE;
        case ART_NEBEL:   return SYM_NEBEL;
        case ART_REGEN:   return SYM_REGEN;
        case ART_SCHNEE:  return SYM_SCHNEE;
        default:          return SYM_GEWITTER;
      }
    }
  }
  return -1;
}
// Whole block as a picture: temperature and pressure curve; baro trend with hPa (arrow in the left cell, whole hPa 0–9 in the right one)
static void block_bild(int w, int t, int jm, time_t now, int x, int y, GColor c) {
  if (t < 0) return;
  if (w == W_TKURVE) { temp_kurve(t, jm, x, y); return; }
  if (w == W_BKURVE) { druck_kurve(t, jm, x, y); return; }
  const int s = zell_symbol(W_BARO, t, jm, now), d = tendenz(t, jm), h = rdiv(d < 0 ? -d : d, 20);
  if (s < 0) return;
  symbol(s, x, y, c); ziffer('0' + (h > 9 ? 9 : h), x + SPALTE[1], y, c);
}

// Two characters of a block by content; true = minus next to the 1 (−10..−19). Empty = space (draws nothing)
static bool block_zellen(int w, const struct tm *lt, const uint8_t *d, char *z) {
  z[0] = z[1] = ' ';
  int v = -1;
  switch (w) {
    case W_TAG:   v = lt->tm_mday; break;
    case W_MONAT: v = lt->tm_mon + 1; break;
    case W_TMIN: case W_TMAX: return temp_zellen(d ? (int8_t)d[2 * STUNDEN + (w == W_TMAX)] : -128, z);
    case W_TJETZT: return temp_zellen(heute_index() >= 0 ? temp_jetzt(heute_index(), lt->tm_hour * 60 + lt->tm_min) : -128, z);
    case W_AUF_H: case W_AUF_M: case W_UNTER_H: case W_UNTER_M: {
      const int m = d ? sonne_min(d, w >= W_UNTER_H) : -1;
      if (m < 0) { z[0] = z[1] = '-'; return false; }
      v = (w == W_AUF_H || w == W_UNTER_H) ? m / 60 % 100 : m % 60;
      break;
    }
    default: return false;
  }
  z[0] = '0' + v / 10 % 10; z[1] = '0' + v % 10;
  return false;
}

// Line with a t×t brush (horizontally centred, top at the point), Bresenham — own routine so watch and Mac preview draw the same
static void linie(int x0, int y0, int x1, int y1, int t, GColor c) {
  const int dx = abs(x1 - x0), dy = -abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  int e = dx + dy;
  for (;;) {
    flaeche(x0 - t / 2, y0, t, t, c);
    if (x0 == x1 && y0 == y1) break;
    const int e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}

// Sun position as background (since 0.12.0): row y = local minute. Since 0.27.0 the day runs top down: 00:00 at the top,
// 23:59 at the bottom — sunrise sits above sunset, like rows 1 and 5 (until 0.26.0 00:00 was at the bottom).
// night | twilight | day | twilight | night; twilight solid or dithered (Bayer 4×4) from D1 (night side) to D2 (day side)
static const uint8_t BAYER[4][4] = { { 0, 8, 2, 10 }, { 12, 4, 14, 6 }, { 3, 11, 1, 9 }, { 15, 7, 13, 5 } };
// One row of the sun position: night, twilight (solid or gradient in the Bayer grid), day
// Since 0.26.0 every area can be switched off (then background colour); without twilight the night lasts until sunrise
static int minute_von_zeile(int y) { return (y * 1440 + 720) / 228; }   // centre of row y as local minute
static int zeile_von_minute(int m) { return rdiv(m * 228, 1440); }        // row of local minute m (horizontal lines)
static void himmel_zeile(int y, int auf, int unter, int da, int du) {
  const int m = minute_von_zeile(y);
  if (A->s_daem ? m < da || m >= du : m < auf || m >= unter) { flaeche(0, y, 200, 1, A->s_nacht ? farbe(F_S_NACHT) : C_GRUND); return; }
  if (m >= auf && m < unter) { flaeche(0, y, 200, 1, A->s_tag ? farbe(F_S_TAG) : C_GRUND); return; }
  flaeche(0, y, 200, 1, farbe(F_S_D1));
  if (!A->verlauf) return;
  const int num = m < auf ? m - da : du - m, den = m < auf ? auf - da : du - unter;
  graphics_context_set_stroke_color(g, farbe(F_S_D2));
  for (int x = 0; x < 200; x++) if (2 * num * 16 > (2 * BAYER[y % 4][x % 4] + 1) * den) graphics_draw_pixel(g, GPoint(x, y));
}
static bool himmel(const uint8_t *d) {
  const int auf = sonne_min(d, 0), unter = sonne_min(d, 1), da = sonne_min(d, 2), du = sonne_min(d, 3);
  if (auf < 0 || unter < 0 || da < 0 || du < 0) return false;
  for (int y = 0; y < 228; y++) himmel_zeile(y, auf, unter, da, du);
  return true;
}
// Rain behind day and twilight (0.25.0 day only, since 0.25.1 twilight too): these rows are drawn again after columns and
// rain. Only the night stays behind the rain — and since 0.26.0 every area that is switched off
static bool vor_regen(const uint8_t *d, int y) {
  if (!A->regen_hinter || !A->sonne || !d) return false;
  const int da = sonne_min(d, 2), du = sonne_min(d, 3);
  if (sonne_min(d, 0) < 0 || sonne_min(d, 1) < 0 || da < 0 || du < 0) return false;   // like himmel(): otherwise no sun position
  const int m = minute_von_zeile(y);
  if (m >= sonne_min(d, 0) && m < sonne_min(d, 1)) return A->s_tag;
  return A->s_daem && m >= da && m < du;
}

static void zeichnen(Layer *l, GContext *ctx) {
  g = ctx;
  time_t now = time(NULL);
  struct tm lokal = *localtime(&now);
  const int jm = lokal.tm_hour * 60 + lokal.tm_min;
  A = &s_th[ist_nacht(jm) ? 1 : 0];
  const int t = heute_index();
  const uint8_t *d = t >= 0 ? s_wetter + t * TAG_LEN : NULL;
  int vmax = 0;                                     // daily rain maximum from the threshold (for "rain at the bottom")
  for (int i = 0; d && i < STUNDEN; i++) if (d[i] != FEHLT && d[i] >= SCHWELLE_Z[A->schwelle] && d[i] > vmax) vmax = d[i];
  if (!(A->sonne && d && himmel(d))) flaeche(0, 0, 200, 228, C_GRUND);
  int hr[STUNDEN] = { 0 };                          // rain height per column, for "rain in front of the vertical line"
  for (int i = 0; i < STUNDEN; i++) {
    const int x0 = 12 * i;
    if (A->saeulen) flaeche(x0, 0, SAEULE_B, 228, C_GEIST);
    if (!d) continue;
    if (d[i] != FEHLT) {
      int h = regen_px(d[i], vmax);
      if (h > 228) h = 228;
      if (h) flaeche(x0, 228 - h, SAEULE_B, h, C_REGEN);
      hr[i] = h;
    }
  }
  for (int y = 0; y < 228; y++)                     // day and twilight in front of the rain (0.25.1)
    if (vor_regen(d, y)) himmel_zeile(y, sonne_min(d, 0), sonne_min(d, 1), sonne_min(d, 2), sonne_min(d, 3));
  for (int i = 0; d && A->luftdruck && !A->druckvoll && i < STUNDEN; i++)   // baro dashed; columns do not overlap, order does not matter
    if (d[STUNDEN + i] != FEHLT) flaeche(12 * i, druck_y(d[STUNDEN + i]), SAEULE_B, A->dicke_d, C_DRUCK);
  if (d && A->luftdruck && A->druckvoll) {        // baro continuous: line through the hourly values (column centre), horizontal at the edges
    int px = -1, py = 0;
    for (int i = 0; i < STUNDEN; i++) {
      if (d[STUNDEN + i] == FEHLT) continue;
      const int x = 12 * i + 3, y = druck_y(d[STUNDEN + i]);
      linie(px < 0 ? 0 : px, px < 0 ? y : py, x, y, A->dicke_d, C_DRUCK);
      px = x; py = y;
    }
    if (px >= 0) linie(px, py, 199, py, A->dicke_d, C_DRUCK);
  }

  // Bars: time across the full width; one half per block (x 0–99 / 100–199), rows 1 and 5 only when switched on
  static const int16_t RY[4] = { Y_AUF, Y_DATUM, Y_TEMP, Y_UNTER }, B0[4] = { 0, D_OBEN, B_UNTEN, T_UNTEN }, B1[4] = { D_OBEN, B_OBEN, T_UNTEN, 228 };
  const bool an[4] = { A->zeile1, true, true, A->zeile5 };
  if (A->balken & 256) flaeche(0, B_OBEN, 200, B_UNTEN - B_OBEN, C_BALKEN);
  for (int r = 0; r < 4; r++)
    for (int sei = 0; sei < 2; sei++)
      if (an[r] && (A->balken >> (2 * r + sei) & 1)) flaeche(100 * sei, B0[r], 100, B1[r] - B0[r], farbe(F_BLOCK_B[2 * r + sei]));

  // Time lines (since 0.16.0) above all bars, right behind the digits: horizontal first, then vertical.
  // Since 0.19.0 as a list of rectangles: optionally a frame around all pieces first, then the faces — so a cross gets one outline
  GRect lr[64]; int nh = 0, nv = 0;
  if (d && A->sonne && A->streifen)                 // sunrise and sunset stripes (0.26.0), below the time lines
    for (int i = 0; i < 2; i++) {
      const int m = sonne_min(d, i);
      if (m < 0) continue;
      const int ys = zeile_von_minute(m) - (A->dicke_s - 1) / 2;
      const GColor c = farbe(i ? F_S_UNTER : F_S_AUF);
      if (A->streifen_voll) flaeche(0, ys, 200, A->dicke_s, c);
      else for (int x = 0; x < 200; x += 8) flaeche(x, ys, 4, A->dicke_s, c);
    }
  if (A->tageslinie) {                              // horizontal, centred; solid or dashed (4 on, 4 off)
    const int yl = zeile_von_minute(jm) - (A->dicke_h - 1) / 2;
    if (A->voll_h) lr[nh++] = GRect(0, yl, 200, A->dicke_h);
    else for (int x = 0; x < 200; x += 8) lr[nh++] = GRect(x, yl, 4, A->dicke_h);
  }
  const int xj = (jm - 240) / 5;                  // 12 px per hour, 04:00 at the left border
  const bool senkrecht = A->zeitmarke && jm >= 240 && xj <= 198;
  const int l0 = xj - (A->dicke_v - 1) / 2, l1 = l0 + A->dicke_v;
  if (senkrecht) {                                  // vertical, centred; dashed or solid
    if (A->voll_v) lr[nh + nv++] = GRect(l0, 0, A->dicke_v, 228);
    else for (int y = 0; y < 228; y += 8) lr[nh + nv++] = GRect(l0, y, A->dicke_v, 4);
  }
  if (A->rahmen_z)
    for (int i = 0; i < nh + nv; i++)
      flaeche(lr[i].origin.x - 1, lr[i].origin.y - 1, lr[i].size.w + 2, lr[i].size.h + 2, farbe(F_RAHMEN_Z));
  for (int i = 0; i < nh + nv; i++)
    flaeche(lr[i].origin.x, lr[i].origin.y, lr[i].size.w, lr[i].size.h, i < nh ? farbe(F_TLINIE) : C_JETZT);
  if (senkrecht && A->regen_vorn) {               // rain cuts through the line (and frame): drawn again on top, but not over bars
    const int r0 = A->rahmen_z ? l0 - 1 : l0, r1 = A->rahmen_z ? l1 + 1 : l1;
    for (int i = 0; i < STUNDEN; i++)
      for (int x = r0 > 12 * i ? r0 : 12 * i; x < (r1 < 12 * i + SAEULE_B ? r1 : 12 * i + SAEULE_B); x++) {
        if (x < 0 || x >= 200) continue;
        int y0 = -1;                                // draw vertical runs without bars
        for (int y = 228 - hr[i]; y <= 228; y++) {
          const bool frei = y < 228 && !unter_balken(x, y) && !vor_regen(d, y);
          if (frei && y0 < 0) y0 = y;
          if (!frei && y0 >= 0) { flaeche(x, y0, 1, y - y0, C_REGEN); y0 = -1; }
        }
      }
  }

  char z[24];   // 4 digits; room for the compiler, which assumes int ranges
  snprintf(z, sizeof z, "%02d%02d", lokal.tm_hour, lokal.tm_min);
  zeile(z, Y_ZEIT, C_ZIFFER, C_ZIFFER);
  for (int r = 0; r < 4; r++) {
    if (!an[r]) continue;
    for (int sei = 0; sei < 2; sei++) {
      const int k = 2 * r + sei, w = A->block[k], x = SPALTE[2 * sei];
      const GColor c = farbe(F_BLOCK_Z[k]);
      if (w == W_TKURVE || w == W_BKURVE || w == W_BARO_HPA) { block_bild(w, t, jm, now, x, RY[r], c); continue; }
      if (ist_zelle(w)) {                             // symbols per cell; a single one sits centred in the block
        const int s1 = w == W_LEER ? -1 : zell_symbol(w, t, jm, now), w2 = A->zweit[k];
        if (w2 == W_LEER) { if (s1 >= 0) symbol(s1, x + (ZB + SPALTE[1] - SYM_GROESSE) / 2, RY[r], c); continue; }
        const int s2 = zell_symbol(w2, t, jm, now);
        if (s1 >= 0) symbol(s1, x, RY[r], c);
        if (s2 >= 0) symbol(s2, SPALTE[2 * sei + 1], RY[r], c);
        continue;
      }
      char b2[2];
      if (block_zellen(A->block[k], &lokal, d, b2)) minus_bei_eins(SPALTE[2 * sei], RY[r], c);
      ziffer(b2[0], SPALTE[2 * sei], RY[r], c);
      ziffer(b2[1], SPALTE[2 * sei + 1], RY[r], c);
    }
  }
}

// ---------- Phone ----------
static bool braucht_wetter(time_t now) { return heute_index() != 0 || now - s_stand >= ABRUF_S; }

static void anfragen(time_t now) {
  if (!connection_service_peek_pebble_app_connection()) return;   // do not ask without the phone; reconnecting asks right away
  if (now - s_letzte_anfrage < s_warte_s) return;
  DictionaryIterator *it;
  if (app_message_outbox_begin(&it) != APP_MSG_OK) return;
  dict_write_int32(it, MESSAGE_KEY_ANFRAGE, 1);
  if (app_message_outbox_send() == APP_MSG_OK) s_letzte_anfrage = now;
}

static void handy_verbindung(bool da) {
  if (da) { s_letzte_anfrage = 0; s_warte_s = WIEDERHOLEN_S; if (braucht_wetter(time(NULL))) anfragen(time(NULL)); }
}

static void empfangen(DictionaryIterator *it, void *ctx) {
  Tuple *t;
  if (dict_find(it, MESSAGE_KEY_BEREIT)) {         // phone script started: ask right away if needed
    s_letzte_anfrage = 0;
    if (braucht_wetter(time(NULL))) anfragen(time(NULL));
  }
  if ((t = dict_find(it, MESSAGE_KEY_FEHLER))) {
    s_fehler = t->value->int32;
    s_warte_s = s_fehler >= 3 ? SERVER_S : WIEDERHOLEN_S;
    APP_LOG(APP_LOG_LEVEL_WARNING, "Phone reports error %d", (int)s_fehler);
  }
  if ((t = dict_find(it, MESSAGE_KEY_WETTER)) && t->length == WETTER_LEN) {
    memcpy(s_wetter, t->value->data, WETTER_LEN);
    s_hat_wetter = true;
    s_fehler = 0; s_warte_s = WIEDERHOLEN_S;
    persist_write_data(PK_WETTER, s_wetter, WETTER_LEN);
  }
  if ((t = dict_find(it, MESSAGE_KEY_TAG))) { s_tag = t->value->int32; persist_write_int(PK_TAG, s_tag); }
  if ((t = dict_find(it, MESSAGE_KEY_STAND))) { s_stand = t->value->int32; persist_write_int(PK_STAND, s_stand); }
  for (int n = 0; n < 2; n++) {                    // day and night: colours and options
    bool neu = false;
    if ((t = dict_find(it, n ? MESSAGE_KEY_FARBEN_N : MESSAGE_KEY_FARBEN)) && t->length == F_ANZAHL) {
      for (int i = 0; i < F_ANZAHL; i++) s_th[n].farbe[i] = t->value->data[i] & 0x3F;
      neu = true;
    }
    if ((t = dict_find(it, n ? MESSAGE_KEY_OPTIONEN_N : MESSAGE_KEY_OPTIONEN))) { optionen_setzen(&s_th[n], t->value->int32); neu = true; }
    if ((t = dict_find(it, n ? MESSAGE_KEY_LINIEN_N : MESSAGE_KEY_LINIEN)) && t->length >= 2) {   // width 1–20 px, frame
      s_th[n].rahmen_z = t->length >= 3 && (t->value->data[2] & 1);
      s_th[n].dicke_v = t->value->data[0] < 1 ? 1 : t->value->data[0] > 20 ? 20 : t->value->data[0];
      s_th[n].dicke_h = t->value->data[1] < 1 ? 1 : t->value->data[1] > 20 ? 20 : t->value->data[1];
      if (t->length >= 4) s_th[n].dicke_s = t->value->data[3] < 1 ? 1 : t->value->data[3] > 20 ? 20 : t->value->data[3];
      neu = true;
    }
    if ((t = dict_find(it, n ? MESSAGE_KEY_BLOECKE_N : MESSAGE_KEY_BLOECKE)) && t->length == 8) {
      for (int i = 0; i < 8; i++) s_th[n].block[i] = w_gueltig(t->value->data[i]) ? t->value->data[i] : W_LEER;
      neu = true;
    }
    if ((t = dict_find(it, n ? MESSAGE_KEY_ZELLEN_N : MESSAGE_KEY_ZELLEN)) && t->length == 8) {
      for (int i = 0; i < 8; i++) s_th[n].zweit[i] = ist_zelle(t->value->data[i]) ? t->value->data[i] : W_LEER;
      neu = true;
    }
    if ((t = dict_find(it, n ? MESSAGE_KEY_SCHALTER_N : MESSAGE_KEY_SCHALTER))) {   // 0.24.0: switches as bits, room for more
      const int32_t v = t->value->int32;
      s_th[n].saeulen = v & 1; s_th[n].regen_hinter = v >> 1 & 1;
      s_th[n].s_tag = v >> 2 & 1; s_th[n].s_daem = v >> 3 & 1; s_th[n].s_nacht = v >> 4 & 1;
      s_th[n].streifen = v >> 5 & 1; s_th[n].streifen_voll = v >> 6 & 1;
      neu = true;
    }
    if (neu) persist_write_data(n ? PK_THEMA_NACHT : PK_THEMA_TAG, &s_th[n], sizeof(Thema));
  }
  if ((t = dict_find(it, MESSAGE_KEY_NACHTMODUS))) { s_nachtmodus = t->value->int32 != 0; persist_write_int(PK_NACHTMODUS, s_nachtmodus); }
  layer_mark_dirty(s_layer);
}

static void laden(void) {
  for (int n = 0; n < 2; n++) {
    thema_std(&s_th[n]);
    const int k = n ? PK_THEMA_NACHT : PK_THEMA_TAG;
    if (persist_exists(k) && persist_read_data(k, &s_th[n], sizeof(Thema)) != (int)sizeof(Thema)) thema_std(&s_th[n]);
  }
  if (persist_exists(PK_NACHTMODUS)) s_nachtmodus = persist_read_int(PK_NACHTMODUS) != 0;
  for (int k = 5; k < 20; k++) persist_delete(k);  // single keys until 0.10.0
  if (!persist_exists(PK_FORMAT) || persist_read_int(PK_FORMAT) != FORMAT) {
    persist_delete(PK_WETTER); persist_delete(PK_TAG); persist_delete(PK_STAND);
    persist_write_int(PK_FORMAT, FORMAT);
    return;
  }
  if (persist_exists(PK_WETTER) && persist_read_data(PK_WETTER, s_wetter, WETTER_LEN) == WETTER_LEN) s_hat_wetter = true;
  if (persist_exists(PK_TAG)) s_tag = persist_read_int(PK_TAG);
  if (persist_exists(PK_STAND)) s_stand = persist_read_int(PK_STAND);
}

static void tick(struct tm *t, TimeUnits u) {
  const time_t now = time(NULL);
  if (braucht_wetter(now)) anfragen(now);
  layer_mark_dirty(s_layer);
}

static void fenster_laden(Window *w) {
  Layer *root = window_get_root_layer(w);
  s_layer = layer_create(layer_get_bounds(root));
  layer_set_update_proc(s_layer, zeichnen);
  layer_add_child(root, s_layer);
}

static void fenster_entladen(Window *w) { layer_destroy(s_layer); }

static void init(void) {
  laden();
  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_set_window_handlers(s_window, (WindowHandlers){ .load = fenster_laden, .unload = fenster_entladen });
  window_stack_push(s_window, false);
  app_message_register_inbox_received(empfangen);
  app_message_open(384, 64);                        // weather 184 bytes + TAG + STAND (0.22.0; 256 before)
  tick_timer_service_subscribe(MINUTE_UNIT, tick);
  connection_service_subscribe((ConnectionHandlers){ .pebble_app_connection_handler = handy_verbindung });
}

static void deinit(void) {
  connection_service_unsubscribe();
  tick_timer_service_unsubscribe();
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
  return 0;
}
