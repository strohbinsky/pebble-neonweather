#!/bin/zsh
# Builds the watchface outside the source folder (~/.local/share/neonweather-build) and installs it.
#   tools/bauen.sh            build only
#   tools/bauen.sh emu        build + emery emulator + logs
#   tools/bauen.sh uhr <IP>   build + install via the phone on Wi-Fi (developer connection in the Pebble app)
# The finished app ends up as neonweather.pbw next to the source folder, or in dist/ when the folder is not called "dateien".
set -e
export PATH="$HOME/.local/bin:$PATH"
QUELLE="${0:A:h:h}/"
ZIEL="$HOME/.local/share/neonweather-build"
mkdir -p "$ZIEL"
if [ "${QUELLE:h:t}" = "dateien" ]; then AUSGABE="${QUELLE}../neonweather.pbw"; else AUSGABE="${QUELLE}dist/neonweather.pbw"; fi
python3 "${QUELLE}tools/symbole_erzeugen.py"
python3 "${QUELLE}tools/schrift_erzeugen.py"
python3 "${QUELLE}tools/seite_erzeugen.py"
rsync -a --delete --exclude build --exclude tools --exclude dist --exclude .git "$QUELLE" "$ZIEL/"
cd "$ZIEL"
rm -rf build   # pebble clean is not enough: rsync --delete removes waf's state file and build/ stays stale
pebble build 2>&1 | grep -v "PebblePacket\|Represents" | tail -3
# drop the source map (debug): it contains build paths with the user name of the machine, the watchface does not need it
zip -q -d build/*.pbw pebble-js-app.js.map >/dev/null 2>&1 || true
# guard against personal data (term list outside the repo), if set up on this machine
if [ -x "$HOME/.local/bin/github-sperre" ] && ! "$HOME/.local/bin/github-sperre" build/*.pbw >/dev/null; then
  echo "STOP: github-sperre flags the built app — not copied"
  "$HOME/.local/bin/github-sperre" build/*.pbw
  exit 1
fi
mkdir -p "${AUSGABE:h}"
cp build/*.pbw "$AUSGABE"
case "$1" in
  emu) pebble install --emulator emery --logs ;;
  uhr) pebble install --phone "$2" --logs ;;
esac
