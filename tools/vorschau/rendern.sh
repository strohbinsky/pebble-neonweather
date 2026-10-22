#!/bin/zsh
# Compiles main.c against the API mock and renders a preview as PNG (double size).
#   tools/vorschau/rendern.sh <out.png> [unix time]   — environment as described in vorschau.c
set -e
DIR="${0:A:h}"
cc -O1 -Wall -Wextra -Wno-unused-parameter -Wno-unused-function -I "$DIR" -o /tmp/neonweather-vorschau "$DIR/vorschau.c"
TZ="${TZ:-Europe/Berlin}" /tmp/neonweather-vorschau "${2:-$(date +%s)}" /tmp/neonweather-vorschau.raw
python3 "$DIR/png.py" /tmp/neonweather-vorschau.raw "$1"
