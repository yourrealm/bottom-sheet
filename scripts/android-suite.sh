#!/usr/bin/env bash
# On-device gesture suite for the playground (Android, adb).
# Usage: scripts/android-suite.sh [runs=3] [browsers="com.android.chrome org.mozilla.firefox"]
# Needs: playground dev server on :5180, `adb reverse tcp:5180 tcp:5180`, phone unlocked.
# Swipe coordinates are for a 1080x2340 screen.
set -euo pipefail
RUNS=${1:-3}
BROWSERS=${2:-"com.android.chrome org.mozilla.firefox"}
LOG="$(dirname "$0")/../apps/demo/.logs/device.log"
mkdir -p "$(dirname "$LOG")"; : > "$LOG"

NONCE=$(date +%s) # unique URL per invocation: Firefox reuses an open tab for an identical URL (stale page)
for B in $BROWSERS; do for i in $(seq 1 "$RUNS"); do
  adb shell am start -a android.intent.action.VIEW -p "$B" -d "'http://localhost:5180/?open=1&n=$NONCE&run=$B-$i#/lab'" >/dev/null; sleep 4
  adb shell input swipe 540 2000 540 200 2500; sleep 1.5   # T1 slow drag up from medium: expands, then scrolls content
  adb shell input swipe 540 1800 540 400 800;  sleep 1.5   #    deeper into content
  adb shell input swipe 540 600 540 1900 80;   sleep 2.5   # T3 fling down from content: guard stops at full
  adb shell input swipe 540 1500 540 1000 600; sleep 1.5   #    a bit into content
  adb shell input swipe 540 700 540 1900 2500; sleep 2     # T2 slow drag down: content top, then sheet follows
  adb shell input swipe 540 1900 540 1300 60;  sleep 2     # T4 fling up from medium: guard stops at full
  adb shell input swipe 540 1000 540 2100 60;  sleep 2     # T5 fling down: closes
done; done


sleep 1 # let the last batched log lines reach the file
python3 "$(dirname "$0")/summarize-device-log.py" "$LOG"
