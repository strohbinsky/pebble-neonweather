// Minimal mock of the Pebble API to compile main.c on the Mac and render the display as a PNG.
// vorschau.c sets the time and the phone data. Based on Phosphor's tools/vorschau/pebble.h, trimmed.
#pragma once
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <time.h>
typedef struct { int16_t x, y; } GPoint;
typedef struct { int16_t w, h; } GSize;
typedef struct { GPoint origin; GSize size; } GRect;
typedef struct { uint8_t r, g, b; } GColor;
typedef struct GContext GContext;
typedef struct Layer Layer; typedef struct Window Window;
typedef int TimeUnits;
typedef struct { void (*load)(Window *); void (*unload)(Window *); } WindowHandlers;
typedef void (*LayerUpdateProc)(Layer *, GContext *);
enum { SECOND_UNIT = 1, MINUTE_UNIT = 2, APP_MSG_OK = 0, GCornerNone = 0, APP_LOG_LEVEL_WARNING = 1 };
enum { MESSAGE_KEY_BEREIT = 1, MESSAGE_KEY_ANFRAGE, MESSAGE_KEY_WETTER, MESSAGE_KEY_TAG, MESSAGE_KEY_STAND,
       MESSAGE_KEY_FEHLER, MESSAGE_KEY_FARBEN, MESSAGE_KEY_OPTIONEN, MESSAGE_KEY_FARBEN_N, MESSAGE_KEY_OPTIONEN_N,
       MESSAGE_KEY_NACHTMODUS, MESSAGE_KEY_BLOECKE, MESSAGE_KEY_BLOECKE_N, MESSAGE_KEY_LINIEN,
       MESSAGE_KEY_LINIEN_N, MESSAGE_KEY_ZELLEN, MESSAGE_KEY_ZELLEN_N,
       MESSAGE_KEY_SCHALTER, MESSAGE_KEY_SCHALTER_N };
#define GRect(x, y, w, h) ((GRect){{(x), (y)}, {(w), (h)}})
#define GColorFromHEX(v) ((GColor){((v) >> 16) & 255, ((v) >> 8) & 255, (v) & 255})
#define GColorBlack ((GColor){0, 0, 0})
#define APP_LOG(l, ...) (fprintf(stderr, __VA_ARGS__), fputc('\n', stderr))
extern uint8_t FB[228][200][3];
static GColor s_fill;
static inline void px(int x, int y, GColor k) { if (x >= 0 && y >= 0 && x < 200 && y < 228) { FB[y][x][0] = k.r; FB[y][x][1] = k.g; FB[y][x][2] = k.b; } }
static inline void graphics_context_set_fill_color(GContext *c, GColor k) { s_fill = k; }
static GColor s_stroke;
#define GPoint(x, y) ((GPoint){(x), (y)})
static inline void graphics_context_set_stroke_color(GContext *c, GColor k) { s_stroke = k; }
static inline void graphics_draw_pixel(GContext *c, GPoint p) { px(p.x, p.y, s_stroke); }
static inline void graphics_fill_rect(GContext *c, GRect r, int rad, int m) { for (int y = 0; y < r.size.h; y++) for (int x = 0; x < r.size.w; x++) px(r.origin.x + x, r.origin.y + y, s_fill); }
// storage, messages, windows: no effect — except dict_find, which vorschau.c can feed (UHR, since 0.27.0)
static inline bool persist_exists(uint32_t k) { return false; }
static inline int32_t persist_read_int(uint32_t k) { return 0; }
static inline int persist_write_int(uint32_t k, int32_t v) { return 0; }
static inline int persist_delete(uint32_t k) { return 0; }
static inline int persist_read_data(uint32_t k, void *b, size_t n) { return 0; }
static inline int persist_write_data(uint32_t k, const void *b, size_t n) { return 0; }
typedef struct DictionaryIterator DictionaryIterator;
typedef struct { int32_t int32; char cstring[32]; uint8_t data[256]; } TupleValue;
typedef struct { uint16_t length; TupleValue *value; } Tuple;
extern Tuple *MOCK_TUPEL[32];
static inline Tuple *dict_find(DictionaryIterator *it, int k) { return k > 0 && k < 32 ? MOCK_TUPEL[k] : NULL; }
static inline int app_message_outbox_begin(DictionaryIterator **it) { return 1; }
static inline void dict_write_int32(DictionaryIterator *it, int k, int32_t v) {}
static inline int app_message_outbox_send(void) { return 1; }
static inline void app_message_register_inbox_received(void (*h)(DictionaryIterator *, void *)) {}
static inline void app_message_open(int a, int b) {}
static inline GRect layer_get_bounds(Layer *l) { return GRect(0, 0, 200, 228); }
static inline void layer_mark_dirty(Layer *l) {}
static inline Layer *window_get_root_layer(Window *w) { return NULL; }
static inline Layer *layer_create(GRect r) { return NULL; }
static inline void layer_set_update_proc(Layer *l, LayerUpdateProc p) {}
static inline void layer_add_child(Layer *a, Layer *b) {}
static inline void layer_destroy(Layer *l) {}
static inline Window *window_create(void) { return NULL; }
static inline void window_set_background_color(Window *w, GColor c) {}
static inline void window_set_window_handlers(Window *w, WindowHandlers h) {}
static inline void window_stack_push(Window *w, bool a) {}
static inline void window_destroy(Window *w) {}
static inline void tick_timer_service_subscribe(int u, void (*h)(struct tm *, TimeUnits)) {}
static inline void tick_timer_service_unsubscribe(void) {}
typedef struct { void (*pebble_app_connection_handler)(bool); } ConnectionHandlers;
static inline bool connection_service_peek_pebble_app_connection(void) { return true; }
static inline void connection_service_subscribe(ConnectionHandlers h) {}
static inline void connection_service_unsubscribe(void) {}
static inline void app_event_loop(void) {}
extern time_t FAKE_NOW;
#define time(x) (FAKE_NOW)
