// Loader of the settings page (0.34.0). The page script travels compressed (raw deflate, Base64; tools/seite_erzeugen.py
// packs it at build time) — the page shrinks from about 126 KB to a third. Here it is unpacked and run as a script.
// Inflate after RFC 1951, like puff.c by Mark Adler: stored, fixed and dynamic Huffman blocks. Plain ES5, no TextDecoder.
function entpacken(b64) {
  var s = atob(b64), d = [], o = [], p = 0, bb = 0, bc = 0, i;
  for (i = 0; i < s.length; i++) d.push(s.charCodeAt(i));
  function bits(n) {                              // n bits, lowest first
    while (bc < n) { bb |= d[p++] << bc; bc += 8; }
    var v = bb & ((1 << n) - 1);
    bb >>>= n; bc -= n;
    return v;
  }
  function tabelle(len, n) {                      // canonical Huffman code: count per length, symbols sorted by code
    var anz = [], sym = [], offs = [0, 0], k;
    for (k = 0; k < 16; k++) anz[k] = 0;
    for (k = 0; k < n; k++) anz[len[k]]++;
    anz[0] = 0;
    for (k = 1; k < 16; k++) offs[k + 1] = offs[k] + anz[k];
    for (k = 0; k < n; k++) if (len[k]) sym[offs[len[k]]++] = k;
    return [anz, sym];
  }
  function symbol(t) {                            // one symbol, bit by bit along the code lengths
    var code = 0, first = 0, index = 0, l, c;
    for (l = 1; l < 16; l++) {
      code |= bits(1); c = t[0][l];
      if (code - c < first) return t[1][index + code - first];
      index += c; first = (first + c) << 1; code <<= 1;
    }
    throw new Error("bad code");
  }
  var LB = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LE = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DB = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193,
            12289, 16385, 24577];
  var DE = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var ORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  var letzter, art, lt, dt, l, n, v, r, x, y;
  do {
    letzter = bits(1); art = bits(2);
    if (art === 0) {                              // stored: to the byte boundary, length, copy
      bb = 0; bc = 0; n = d[p] | d[p + 1] << 8; p += 4;
      while (n--) o.push(d[p++]);
      continue;
    }
    if (art === 1) {                              // fixed codes
      l = []; for (i = 0; i < 288; i++) l[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
      lt = tabelle(l, 288);
      l = []; for (i = 0; i < 30; i++) l[i] = 5;
      dt = tabelle(l, 30);
    } else {                                      // dynamic codes: code lengths coded themselves
      var hl = bits(5) + 257, hd = bits(5) + 1, hc = bits(4) + 4, cl = [];
      for (i = 0; i < 19; i++) cl[i] = 0;
      for (i = 0; i < hc; i++) cl[ORD[i]] = bits(3);
      var ct = tabelle(cl, 19);
      l = [];
      while (l.length < hl + hd) {
        x = symbol(ct);
        if (x < 16) { l.push(x); continue; }
        v = 0;
        if (x === 16) { v = l[l.length - 1]; r = 3 + bits(2); } else if (x === 17) r = 3 + bits(3); else r = 11 + bits(7);
        while (r--) l.push(v);
      }
      lt = tabelle(l.slice(0, hl), hl); dt = tabelle(l.slice(hl), hd);
    }
    for (;;) {
      x = symbol(lt);
      if (x < 256) { o.push(x); continue; }
      if (x === 256) break;
      x -= 257; n = LB[x] + bits(LE[x]);
      y = symbol(dt); y = DB[y] + bits(DE[y]);
      while (n--) o.push(o[o.length - y]);
    }
  } while (!letzter);
  var t = "";
  for (i = 0; i < o.length; i += 8192) t += String.fromCharCode.apply(null, o.slice(i, i + 8192));
  return decodeURIComponent(escape(t));           // bytes → UTF-8
}
function starten(b64) { var sk = document.createElement("script"); sk.text = entpacken(b64); document.body.appendChild(sk); }
