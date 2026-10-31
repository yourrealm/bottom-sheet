"""Summarise apps/demo/.logs/device.log per device run.

Line format (see apps/demo/src/debug.ts): "<browser> <run-id> <seconds> <scenario>: <message>".
A run PASSes when the momentum guard fired at least once, the sheet ended closed, and nothing drifted
after a lock was released.
"""
import collections
import re
import sys

runs: "collections.OrderedDict[str, list[str]]" = collections.OrderedDict()
for line in open(sys.argv[1]):
    parts = line.rstrip("\n").split(" ", 3)
    if len(parts) < 4:
        continue
    _browser, run, t, msg = parts
    msg = re.sub(r"^[a-z]+: ", "", msg)
    if re.match(r"(release|clamp|onDetentChange|onOpenChange|watchdog|unlock|drift)", msg):
        runs.setdefault(run, []).append(f"{t} {msg.split(' (')[0]}")

for run, ev in runs.items():
    # Two stops at full (content fling and sheet fling), by scroll-snap-stop or the JS guard.
    ok = (
        sum(e.endswith("onDetentChange full") for e in ev) >= 2
        and ev[-1].endswith("onOpenChange false")
        and not any("drift" in e for e in ev)
    )
    print("PASS " if ok else "CHECK", run, "|", " | ".join(ev))
