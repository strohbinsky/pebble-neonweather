// Renders the display of main.c with test values into a raw file (200x228 RGB); png.py turns it into a PNG.
// Run: TZ=Europe/Berlin vorschau <unix time> <out.raw>
// Environment: WETTER=<file as sent by the phone: 184 bytes, or 88 without hourly values (before 0.22.0)>, TAG=YYYYMMDD (default: today),
// ALTER=<s since the last fetch> (default 600), UHR=<settings file, see uhr_laden()>, single settings further down in main()
#define main pebble_main
#include "../../src/c/main.c"
#undef main
uint8_t FB[228][200][3];
time_t FAKE_NOW;
Tuple *MOCK_TUPEL[32];
static TupleValue s_werte[32];
static Tuple s_tupel[32];

// UHR file (since 0.27.0): one message key per line, "FARBEN 0,17,27,…" (byte list) or "OPTIONEN 160194816" (number), i.e. exactly
// what logik.anUhr() hands to the watch. It goes through empfangen() in main.c — the same path as a real message from the phone.
static const struct { const char *name; int key; bool liste; } SCHLUESSEL[] = {
  { "FARBEN", MESSAGE_KEY_FARBEN, true }, { "FARBEN_N", MESSAGE_KEY_FARBEN_N, true },
  { "OPTIONEN", MESSAGE_KEY_OPTIONEN, false }, { "OPTIONEN_N", MESSAGE_KEY_OPTIONEN_N, false },
  { "BLOECKE", MESSAGE_KEY_BLOECKE, true }, { "BLOECKE_N", MESSAGE_KEY_BLOECKE_N, true },
  { "LINIEN", MESSAGE_KEY_LINIEN, true }, { "LINIEN_N", MESSAGE_KEY_LINIEN_N, true },
  { "ZELLEN", MESSAGE_KEY_ZELLEN, true }, { "ZELLEN_N", MESSAGE_KEY_ZELLEN_N, true },
  { "SCHALTER", MESSAGE_KEY_SCHALTER, false }, { "SCHALTER_N", MESSAGE_KEY_SCHALTER_N, false },
  { "NACHTMODUS", MESSAGE_KEY_NACHTMODUS, false } };
static void uhr_laden(const char *pfad) {
  static char zeile[4096];
  char name[32];
  FILE *f = fopen(pfad, "r");
  if (!f) { fprintf(stderr, "UHR: %s not found\n", pfad); return; }
  while (fscanf(f, "%31s %4095s", name, zeile) == 2) {
    for (size_t i = 0; i < sizeof SCHLUESSEL / sizeof SCHLUESSEL[0]; i++) {
      if (strcmp(name, SCHLUESSEL[i].name)) continue;
      const int k = SCHLUESSEL[i].key;
      Tuple *t = &s_tupel[k];
      t->value = &s_werte[k]; t->length = 0;
      if (SCHLUESSEL[i].liste) {
        char *e = zeile, *weiter;
        while (*e && t->length < 256) {
          const long v = strtol(e, &weiter, 10);
          if (weiter == e) break;
          t->value->data[t->length++] = (uint8_t)v; e = weiter;
          if (*e == ',') e++;
        }
      } else { t->value->int32 = (int32_t)strtol(zeile, NULL, 10); t->length = 4; }
      MOCK_TUPEL[k] = t;
    }
  }
  fclose(f);
  empfangen(NULL, NULL);
}

int main(int argc, char **argv) {
  FAKE_NOW = atol(argv[1]);
  FILE *f = getenv("WETTER") ? fopen(getenv("WETTER"), "rb") : NULL;
  memset(s_wetter, FEHLT, WETTER_LEN);                       // hourly values are missing unless the file has them
  for (int d = 0; d < 2; d++) memset(s_wetter + 2 * TAG_LEN + d * ERW_LEN, 0x80, 24);   // temperature: -128
  if (f && fread(s_wetter, 1, WETTER_LEN, f) >= 2 * TAG_LEN) s_hat_wetter = true;
  if (f) fclose(f);
  s_tag = getenv("TAG") ? atoi(getenv("TAG")) : tag_von(localtime(&FAKE_NOW));
  s_stand = FAKE_NOW - (getenv("ALTER") ? atoi(getenv("ALTER")) : 600);
  laden();
  // Day: FARBEN, OPTIONEN (number) or one by one DRUCKLAGE, BALKEN, REGENUNTEN, REGENAUS, REGENVOLL, OHNE_ZEITMARKE, OHNE_LUFTDRUCK,
  // SONNE, TAGESLINIE, OHNE_VERLAUF.
  // Night: NACHTMODUS=1, NACHT_FARBEN, NACHT_OPTIONEN (otherwise like the day)
  for (int n = 0; n < 2; n++) {
    char *e = getenv(n ? "NACHT_FARBEN" : "FARBEN");
    for (int i = 0; e && i < F_ANZAHL && *e; i++) { s_th[n].farbe[i] = farb_code((int32_t)strtol(e, &e, 16)); if (*e == ',') e++; }
    if (getenv(n ? "NACHT_OPTIONEN" : "OPTIONEN")) optionen_setzen(&s_th[n], atoi(getenv(n ? "NACHT_OPTIONEN" : "OPTIONEN")));
  }
  if (getenv("DRUCKLAGE")) s_th[0].drucklage = atoi(getenv("DRUCKLAGE")) & 3;
  if (getenv("BALKEN")) s_th[0].balken = atoi(getenv("BALKEN")) & 511;   // bits 0–7 blocks, 8 time
  if (getenv("REGENUNTEN")) s_th[0].regenlage = 1;
  if (getenv("REGENAUS")) s_th[0].regenlage = 2;
  if (getenv("REGENVOLL")) s_th[0].regenvoll = true;
  if (getenv("SCHWELLE")) s_th[0].schwelle = atoi(getenv("SCHWELLE")) % 5;
  if (getenv("ZEILE1")) s_th[0].zeile1 = true;
  if (getenv("ZEILE5")) s_th[0].zeile5 = true;
  if (getenv("BLOECKE")) { char *e = getenv("BLOECKE"); for (int i = 0; i < 8 && *e; i++) { s_th[0].block[i] = strtol(e, &e, 10); if (*e == ',') e++; } }
  if (getenv("ZELLEN")) { char *e = getenv("ZELLEN"); for (int i = 0; i < 8 && *e; i++) { s_th[0].zweit[i] = strtol(e, &e, 10); if (*e == ',') e++; } }
  if (getenv("OHNE_SAEULEN")) s_th[0].saeulen = false;
  if (getenv("REGEN_HINTER")) s_th[0].regen_hinter = true;
  if (getenv("OHNE_TAG")) s_th[0].s_tag = false;
  if (getenv("OHNE_DAEMMERUNG")) s_th[0].s_daem = false;
  if (getenv("OHNE_NACHT")) s_th[0].s_nacht = false;
  if (getenv("STREIFEN")) s_th[0].streifen = true;
  if (getenv("STREIFEN_STRICH")) s_th[0].streifen_voll = false;
  if (getenv("DICKE_S")) s_th[0].dicke_s = atoi(getenv("DICKE_S"));
  if (getenv("DRUCKVOLL")) s_th[0].druckvoll = true;
  if (getenv("DICKE_V")) s_th[0].dicke_v = atoi(getenv("DICKE_V"));
  if (getenv("DICKE_H")) s_th[0].dicke_h = atoi(getenv("DICKE_H"));
  if (getenv("DICKE_D")) s_th[0].dicke_d = atoi(getenv("DICKE_D"));
  if (getenv("VOLL_V")) s_th[0].voll_v = true;
  if (getenv("STRICH_H")) s_th[0].voll_h = false;
  if (getenv("OHNE_DURCHSTICH")) s_th[0].regen_vorn = false;
  if (getenv("REGEN_REL")) s_th[0].regen_rel = true;
  if (getenv("RAHMEN")) s_th[0].rahmen_z = true;
  if (getenv("OHNE_ZEITMARKE")) s_th[0].zeitmarke = false;
  if (getenv("OHNE_LUFTDRUCK")) s_th[0].luftdruck = false;
  if (getenv("SONNE")) s_th[0].sonne = true;
  if (getenv("TAGESLINIE")) s_th[0].tageslinie = true;
  if (getenv("OHNE_VERLAUF")) s_th[0].verlauf = false;
  if (getenv("UHR")) uhr_laden(getenv("UHR"));
  else {
    if (!getenv("NACHT_FARBEN") && !getenv("NACHT_OPTIONEN")) s_th[1] = s_th[0];
    s_nachtmodus = getenv("NACHTMODUS") != NULL;
  }
  zeichnen(NULL, NULL);
  FILE *o = fopen(argv[2], "wb"); fwrite(FB, 1, sizeof FB, o); fclose(o);
  return 0;
}
