#!/usr/bin/env bash
# iOS Simulator gesture suite for the playground (Safari, idb). The iOS counterpart of android-suite.sh.
# Usage: scripts/ios-suite.sh [runs=3]
# Needs: playground dev server on :5180 (`pnpm dev`), a booted iPhone simulator, idb, and the software keyboard
# (the simulator connects the Mac's keyboard by default: press Cmd+K once in Simulator). Never type with
# `idb ui text`: it sends hardware key events and the simulator flips back to the hardware keyboard.
# Scenarios per run:
#   flick  #/lab: a fast swipe down on the header closes the sheet, and nothing reopens it (VEN-3953 nav menu).
#   login  #/lab?login=1: tap the phone input (software keyboard up), tap Continue, shorter step 2 swaps in.
#          The sheet must stay open (VEN-3953 login sheet).
# Simulator flicks aren't real finger flicks (WebKit's turn-back bounce on a real iPhone didn't reproduce here),
# so the flick scenario is a regression check, not proof for a device.
set -euo pipefail
RUNS=${1:-3}
UDID=$(xcrun simctl list devices booted | grep -Eo '[0-9A-F-]{36}' | head -1)
[ -n "$UDID" ] || { echo "no booted simulator"; exit 1; }
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/../apps/demo/.logs/device.log"
mkdir -p "$(dirname "$LOG")"; : > "$LOG"
NONCE=$(date +%s)
open_url() { xcrun simctl openurl "$UDID" "$1"; }
# Last "login: layout" line of a run: "input=x,y continue=x,y" in CSS px of the visual viewport.
layout() { grep " $1 " "$LOG" | grep 'login: layout' | tail -1 || true; }
# Page origin on screen (points): Safari's status bar + top inset. CSS px = points at zoom 1.
TOP=${YBS_IOS_TOP:-62}

for i in $(seq 1 "$RUNS"); do
  RUN="ios-flick-$NONCE-$i"
  open_url "http://localhost:5180/?open=1&run=$RUN#/lab"; sleep 4
  idb ui swipe --udid "$UDID" --duration 0.08 200 470 200 760   # fling down from the 0.5 header: closes
  sleep 4

  RUN="ios-login-$NONCE-$i"
  open_url "http://localhost:5180/?login=1&run=$RUN#/lab"; sleep 4
  L=$(layout "$RUN"); IN=$(sed -E 's/.*input=([0-9]+),([0-9]+).*/\1 \2/' <<<"$L")
  read -r X Y <<<"$IN"; idb ui tap --udid "$UDID" "$X" $((Y + TOP)); sleep 2.5   # focus: keyboard up
  L=$(layout "$RUN"); C=$(sed -E 's/.*continue=([0-9]+),([0-9]+).*/\1 \2/' <<<"$L")
  read -r X Y <<<"$C"; idb ui tap --udid "$UDID" "$X" $((Y + TOP)); sleep 4      # Continue: step 2 after 300ms
done

sleep 1
python3 - "$LOG" <<'PY'
import collections, sys
runs = collections.OrderedDict()
for line in open(sys.argv[1]):
    p = line.rstrip("\n").split(" ", 3)
    if len(p) == 4 and p[1].startswith("ios-"):
        runs.setdefault(p[1], []).append(p[3])
for run, ev in runs.items():
    bad = [e for e in ev if "without user input" in e and "flick" in run]
    if "-flick-" in run:
        ok = any("onOpenChange false" in e for e in ev) and not bad
        note = ""
    else:
        hs = [int(e.split("vvH=")[1].split()[0]) for e in ev if e.startswith("login: layout")]
        keyboard = len(hs) > 1 and min(hs) < hs[0] - 120
        # Without the software keyboard it's still a check (the content swap clamps scrollTop there too), just not
        # the exact VEN-3953 setup.
        ok = any("step 2" in e for e in ev) and not any("onOpenChange false" in e for e in ev)
        note = "" if keyboard else " (hardware keyboard: press Cmd+K in Simulator for the software one)"
    keep = [e for e in ev if any(k in e for k in ("release", "onOpenChange", "step 2", "without user input", "flick turned", "moved off", "resting between", "finishClose"))]
    print(("PASS " if ok else "CHECK"), run + note, "|", " | ".join(keep))
PY
