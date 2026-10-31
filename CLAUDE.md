# bottom-sheet

The most native-feeling bottom sheet for the mobile web. React first. MIT.
Published as `@yourrealm/bottom-sheet` (headless) and `@yourrealm/bottom-sheet/styled` (preset). It will be consumed via npm by
`../dapuzzler` (Vite, React 19, Tailwind v4, shadcn/Base UI) and `../shopping/web` (Vite, React 19). Neither app uses SSR.

## Repo layout
```
packages/bottom-sheet/          the library (tsdown → dist/, ESM only)
  src/core/math.ts              pure detent math + velocity projection (unit-tested: math.test.ts)
  src/core/controller.ts        framework-agnostic controller; ALL the behaviour lives here
  src/core/styles.ts            structural CSS (mechanics only, [data-ybs-*] selectors), injected at runtime
  src/react/sheet.tsx           headless compound parts: Root/Trigger/Close/Portal/Backdrop/View/Content/Header/Handle/Title/Description
  src/styled/                   preset look (classes .ybs-*, tokens --ybs-*) + all-in-one <BottomSheet>
apps/demo/                Vite app for device testing (port 5180), POSTs debug lines to .logs/device.log
spikes/01-single-scroller/      the original plain-HTML spike (reference)
scripts/android-suite.sh        on-device gesture suite (adb), prints PASS/CHECK per run
```
Commands: `pnpm dev` (playground), `pnpm test`, `pnpm typecheck`, `pnpm build`.
In the workspace, package `exports` point at `src/` (no build needed for the playground); `publishConfig.exports` points at `dist/`.
The peer dependency is React >= 19 (parts use ref-as-prop). Styles are injected with `useInsertionEffect` (`<style data-ybs-style>`, prepended
so consumer/Tailwind classes win), so consumers need no CSS import.

## Core idea (validated by spike 01)

Native sheets (iOS `UISheetPresentationController`, Android `BottomSheetBehavior` / Compose `ModalBottomSheet`)
treat sheet travel and content scroll as **one gesture with one arbiter**: dragging up at a low detent expands
the sheet, then scrolls the content in the same touch; dragging down scrolls the content to its top, then moves the sheet;
release velocity goes to whichever one owns the gesture at that moment.

Web sheets get this wrong because they put a JS-dragged container around a separate `overflow:auto` box. The
browser can't hand a gesture between native scroll and JS mid-touch. Silk, Velvet UI and pure-web-bottom-sheet
use native scroll-snap for the sheet travel, but still nest a **second** scroller for the content, so they inherit
the same handoff gap.

**Our architecture: one native scroller holds both the sheet travel and the content.**

```
.scroller  (position:fixed, overflow-y:auto, scroll-snap-type:y mandatory, overscroll-behavior:contain)
  .spacer  height H, transparent, touch-action:none, click = dismiss   scrollTop 0   = closed
  .marker  1px, scroll-snap-align:start, at each partial detent        scrollTop d_i = detent i
  .sheet   scroll-snap-align:start (end when shorter than H)          scrollTop full = min(H, sheet height)
    .header  position:sticky; top:0
    content  (no own scroller; scrolls freely because .sheet is a snap area larger than the snapport)
```

`scrollTop` is the only source of truth for sheet position. Native momentum, rubber-banding and velocity come
from the OS.

### Stopping momentum at full: CSS first
`[data-ybs-sheet] { scroll-snap-stop: always }` makes the browser itself refuse to let a fling skip the full position,
in both directions (a content fling stops at the content top; a sheet fling stops at full). Verified natively, with the JS
guard never firing, on Chrome Android, Firefox Android and the iOS 26.4 sim (2026-10-31). This replaced the JS guard as the
primary mechanism because the guard's `overflow` toggle made **Firefox Android swallow the next touch** (it treated it as a
"stop the fling" tap: the first fling down from full after a clamp did nothing, the second worked).

### Required JS (keep it minimal; it never drives the gesture)
- **Momentum guard at the full line (fallback only, 2px tolerance):** if the finger was released on one side of `full` and momentum crosses
  it, stop at `full`. This matches native: a content fling stops at the content top, and a sheet fling stops at full.
  A live finger may cross freely. Wheel/trackpad: the anchor is the gesture start (gap > 250ms = new gesture).
- **Stopping momentum:** set `overflow:hidden`, pin `scrollTop`, and **hold until there have been no scroll events for 150ms** or a new
  touch/wheel gesture starts, with a minimum hold of 800ms. One frame is not enough: Firefox Android's fling keeps running after it.
- **Re-snap on resize:** browsers don't re-snap when snap positions move (the URL bar showing or hiding mid-animation).
  Track the current (named) detent and re-target it in a ResizeObserver.
- **Close** when `scrollend` lands at 0 (debounce fallback when `onscrollend` is missing).
- **Wheel/trackpad steps detents.** With mandatory snapping, a small wheel delta at a partial detent snaps straight back,
  so the wheel looked dead on desktop (reported on the Comments demo). Now: while below full, or at full and scrolling up,
  each wheel *gesture* (events < 250ms apart) is `preventDefault`ed and steps exactly one detent. At full scrolling down, or
  inside the content, the wheel scrolls natively. A gesture that started in the content stops at the content top and never
  moves the sheet. Touch never produces wheel events.

Reference: `spikes/01-single-scroller/index.html` (plain HTML, debug HUD, option toggles via URL query).

### Lessons from the React package (not in the spike)
- **Ref order:** React attaches an ancestor's ref *after* its descendants' layout effects run. `View` therefore finds the portal
  root with `scroller.closest('[data-ybs-root]')`, not from a ref.
- **StrictMode** mounts, destroys and remounts the controller, which produces a stray `scrollend` at 0. `open()` sets
  `target`/`programmatic` synchronously, so that stray event is retargeted instead of being read as "closed".
- **Chrome Android drops a smooth `scrollTo`** on a scroller created the frame before. Opening waits two rAFs, and a 150ms
  **watchdog** re-issues any programmatic move that never started (skipped in hidden tabs).
- **The momentum lock needs a minimum hold of 800ms** (plus 150ms of quiet), still released at once by touch/wheel/drag. Otherwise
  a fling outlives the quiet window and resumes when overflow is restored (seen on Chrome too: full → drifted to medium).
- **iOS fires no `scrollend`** for the pinned `scrollTop` under `overflow:hidden`. `unlock()` runs the settle check itself
  (idempotent), otherwise `onDetentChange('full')` after a guard stop would never fire.
- `onDetentChange` is deduped against the last *emitted* detent (layout changes during open briefly put the sheet between stops).
- After unlocking, re-pin with `scrollTop = pinned`: Firefox otherwise re-snaps to the snap target it chose when the fling
  started (`closed`), which closed the sheet the instant the lock released.
- **Closing must survive a touch.** If a finger is down when the sheet settles at closed, `scrollend` arrives while
  touching and can't finish the close. Re-check on touch end, or the sheet stays mounted, invisible over the page, with
  everything below inert (the Firefox "wedged page" report, 2026-10-31). Closed means `scrollTop <= 2`: Firefox settles at
  values like 1.02. Regression test: "a touch held while the sheet finishes closing".
- Sticky headers can leave a 1px sliver of the content scrolling underneath visible above them (fractional positions,
  worse on a covered sheet's scale transform). `/styled` covers it with `box-shadow: 0 -2px 0 0 var(--ybs-sheet-bg)`;
  headless users should do the same.
- `useStyle` updates an existing `<style data-ybs-style>` when the CSS changes (hot reload, or two library copies on a page).
- Device results (2026-10-31): `scripts/android-suite.sh` 3/3 Chrome Android + 3/3 Firefox Android PASS; the same sequence in the
  iOS 26.4 sim via idb passes (T1–T5, guard both directions, close). The last two fixes (iOS settle, dedupe) are not yet re-run on Android.
- iOS test artifacts to ignore: swiping down on the closed page triggers Safari pull-to-refresh (a new `load` in the log), and a quick
  idb "fling" that starts near the content top is a live finger crossing `full`, which correctly moves the sheet.

## Spike 01 results
| Test | Firefox Android | Chrome Android | iOS 26.4 Safari (sim, idb) |
|---|---|---|---|
| Drag up from medium → expands → content scrolls, one touch | ✅ | ✅ | ✅ |
| Drag down from content → sheet follows, one touch | ✅ | ✅ | ✅ |
| Content fling down stops at content top (guard) | ✅ (needs held lock) | ✅ | ✅ (1 frame enough) |
| Fling up from medium stops at full (guard) | ✅ | ✅ | ✅ |
| Fling down from medium closes | ✅ | ✅ | ✅ |
| Horizontal scroller inside doesn't move the sheet | ✅ | – | – |

### Short content (spike 01)
- `.sheet` has no min-height. `full = min(H, sheetHeight)`. When the sheet is shorter than H, the sheet snaps with
  `scroll-snap-align: end` (fit-content detent), so its bottom sits at the screen bottom.
- Detents are **named** (`closed`/`medium`/`full`), not indexed, because the set changes with content size. `medium` is
  dropped when it is within 15% of `full`. A ResizeObserver on the sheet re-measures this when content changes.
- ✅ Firefox Android, ✅ iOS sim. iOS rubber-bands above the fit-content top (overscroll to 530, back to 404), which is native behaviour for free.

### Desktop mouse drag (spike 01)
- Touch never uses JS. For `pointerType === 'mouse'` on the header: set `scroll-snap-type: none` (`[data-drag]`),
  move `scrollTop` directly, and on release pick a detent from the projection formula (`d = 0.998`, velocity from the last
  80ms of samples), then `scrollTo` smooth. Re-enable snap on `scrollend`.
- If the release lands inside the content (`top > full`), don't snap.
- ✅ Chrome desktop (driven with fast synthetic drags: a flick up goes to full, a flick down closes). Slow-drag feel and Firefox desktop
  are untested. Known limitation: dragging the header while content is scrolled un-scrolls the content first; native moves the
  sheet with the content offset kept.

### Stacked sheets (`src/react/stack.ts`)
- A sheet opened from inside another sheet renders its own portal root (later in `<body>`, so on top). Its Portal makes all
  siblings inert, including the sheet below. The below sheet's `inert` is removed and focus returns when the top one closes.
- A module-level stack of open sheets handles: **Escape closes only the top sheet** (one document listener, not one per
  sheet); the sheet directly below gets `data-ybs-covered` and `--ybs-covered` (0..1, following the upper sheet's progress)
  so `/styled` can scale it back like iOS; **only the top sheet reacts to the keyboard** (`isActive` option).
- Don't toggle `overflow` on a covered sheet (Firefox re-snaps on overflow changes); `inert` already blocks it.
- Demo: Stacked settings (three levels: Settings → Appearance → Accent colour, plus a controlled Language sheet).

### Many sheets (performance)
A closed sheet is cheap: `Root` is a context, and `Portal` renders `null` until it opens, so no controller, observers or
listeners exist. Measured on the "1000 sheets" demo (production build, desktop Chromium with Pixel 7 emulation, 5 runs each):
1000 rows render in ~12ms without sheets and ~21ms with a `<BottomSheet>` per row (~9µs per closed sheet). Expect a few
times that on phones. `?bare=1` on that demo renders the same rows without sheets, for comparison on devices. Guidance: put
expensive sheet content in a component (it only renders when open); for "tap a row to see details", one sheet whose content
follows the selected row is lighter still.

### Keyboard (spike 01)
The overlay layer (backdrop, scroller, bleed) is positioned from `visualViewport` (`--vv-top`, `--vv-h`), not
from the layout viewport. Without that, iOS pans fixed elements off-screen, and Android (resizes-visual by default) leaves
the sheet behind the keyboard.
- iOS also scrolls the **document** to reveal a focused input, even with `html{overflow:hidden}` (observed: 90 to 246pt).
  Record `scrollY` on open and restore it on vv/window scroll.
- When the keyboard opens (`innerHeight - vv.height > 120`), go to the largest detent, as native does.
- A white `.bleed` layer under the visual viewport continues the sheet colour behind the keyboard and the iOS 26
  translucent toolbar. Otherwise the page shows through the gap.
- Chrome Android resizes in two steps and **does** re-snap on that layout change, which hijacks our smooth scroll to
  full. A programmatic move therefore keeps its target and re-issues it on `scrollend` (up to 3 retries).
- Results: Firefox Android ✅, Chrome Android ✅ (after retarget), iOS 26.4 sim ✅ (the pan and page-scroll undo work, the bleed
  fills behind the keyboard, and dismissing the keyboard keeps the sheet at full and the page at its original scroll).
- iOS 26 `vv.height` excludes the floating accessory bar, so the sheet ends about 44pt above it. That's acceptable and the bleed covers it.
- Simulator caveat: `idb ui text` sends hardware key events, which flips the simulator back to hardware-keyboard mode
  (the on-screen keyboard is then hidden until Cmd+K). Only tap in keyboard tests.

Still open: iOS on a real device (momentum feel, rubber-band at the top), Firefox desktop,
slow mouse-drag feel, header drag while content is scrolled, page scale-back (the page behind a sheet),
screen-reader pass (the modal currently uses inert siblings + focus on open/restore + Escape).

## Persistent (non-modal) sheets
Built for dapuzzler's solved sheet (`../dapuzzler/src/components/game/solved-sheet.tsx`); demo `#/persistent`.
- **`modal={false}`**: root gets `data-ybs-modeless`; the scroller (and so spacer, markers) is `pointer-events: none`,
  the sheet `auto`. Taps outside go to the page; a touch on the sheet still scrolls the scroller (its scroll
  container). No inert siblings, no html scroll lock, no page-scroll undo, no focus move or restore, `aria-modal=false`,
  no backdrop in `/styled`. It still joins the stack (Escape order; a modal opened on top covers it).
- **iOS Safari needs a scroll container under the finger**: with the scroller `pointer-events:none`, a drag on the
  sheet did nothing in the iOS 26.4 sim (taps passed through fine). Fix (WebKit touch only, `@supports
  (-webkit-touch-callout: none)`): every direct child of the sheet is a horizontal scroller with 1px of overflow
  (an absolutely positioned `::after`, so side padding can't absorb it). The vertical drag then chains to the sheet
  scroller. Verified in the sim: header drag down/up, fling to the peek, fling at the peek stays.
  Consequence: direct children of a non-modal sheet get `overflow-x: scroll; overflow-y: hidden` on iOS, so put
  sticky elements at the top level (like Header), not inside a wrapper.
- **CSS-length detents** (`'76px'`, `'40dvh'`, `min()`): resolved by a hidden probe element in the markers host on every
  layout. Detent math works on resolved `Stop {detent, top}` lists (`buildStops`, `nearestStop`, `stopAt`, `resolveStop`).
- **`dismissible={false}`**: `closed` is left out of the stops and its snap marker hidden, so a swipe down settles on
  the lowest detent natively; settling at 0 anyway scrolls back to it. Escape / outside press call `collapse()`.
  A programmatic close (`open={false}`) temporarily re-adds `closed` (`closingOnPurpose`).
- `onDetentChange` still reports `'closed'` while closing; apps mapping detents to state must ignore it (the demo
  first reopened itself by mapping it to "peek").
- Not yet run on the Android device suite (phone was away) or a real iPhone.

## Product decisions
- **Packages:** headless core (`@yourrealm/bottom-sheet`) plus one polished preset on a separate import path (`/styled`).
  Parts must stay className/Tailwind friendly. A shadcn-registry variant may come later for dapuzzler.
- **License:** MIT.
- **Targets:** Android Chrome and **Firefox** (the maintainer uses both) are first-class, as is iOS Safari 18+. Desktop is secondary but must work
  (wheel/trackpad, keyboard, Escape).
- **Scope order:** modal sheet with detents first, structured so a non-modal sheet is a config change, not a rewrite.
  Stacked sheets and page scale-back come later.
- Don't assume Chromium-only APIs. For example, `scrollsnapchange` is Chrome-only, and scroll-driven animations need a flag in Firefox,
  so always ship a JS fallback (scroll → CSS var).

## Native behaviour reference
- iOS: detents medium/large/custom; `prefersScrollingExpandsWhenScrolledToEdge` (default: scrolling expands first);
  `largestUndimmedDetentIdentifier` (no dim and the page stays interactive at or below it); rubber-band above the largest detent.
- Android: nested scroll. Upward deltas go to the sheet first (pre-scroll); downward deltas go to the content first, with the leftover to the sheet
  (post-scroll); an upward fling below expanded is consumed by the sheet.
- Detent choice from velocity (WWDC18 "Designing Fluid Interfaces"): `projected = pos + (v/1000) * d/(1-d)`, `d=0.998`,
  then the nearest detent. Only relevant for programmatic or JS-driven motion; native snap handles user flings.
- Springs: critically damped by default; SwiftUI `.spring()` ≈ response 0.55, damping 0.825. Animations must be interruptible.

## Known web traps (seen in other libraries' issue trackers)
- iOS keyboard (the #1 complaint everywhere): no `interactive-widget` support in Safari; use `visualViewport`.
- Body scroll lock causes jumps back to the top, and the `scrollbar-gutter` shift breaks Safari transitions. Prefer the fixed full-viewport scroller
  with `overscroll-behavior: contain` over locking the body.
- iOS 26 floating toolbar leaves a gap under fixed elements.
- Safari 26: `scrollBy()` ignores snap (WebKit bug 316084). Use `scrollTo`.
- Pointer velocity on 120Hz input; whole-gesture-average velocity feels wrong.

## Testing
- **Demo site:** https://yourrealm.github.io/bottom-sheet/ (GitHub Pages, deployed by `.github/workflows/pages.yml` on push to
  main). CI (`ci.yml`) runs typecheck, unit tests, build and Playwright.
- **Playwright** (`pnpm e2e`, `apps/demo/e2e`): Chromium (Pixel 7) and WebKit (iPhone 15) with touch emulation, Firefox desktop.
  Chromium also gets real touch-scroll gestures via CDP `Input.synthesizeScrollGesture`. Tests read `window.__ybs.events`.
  One wheel event per "gesture" in tests: Playwright's wheel calls can land more than 250ms apart.
- **Device suite:** `scripts/android-suite.sh [runs] [browsers]` → `scripts/summarize-device-log.py`. URLs carry a nonce,
  because Firefox reuses an open tab for an identical URL (a stale page with old injected CSS). Log lines carry `?run=` as the tab id.
- Playground: `pnpm dev` (port 5180). The spike can be served with `python3 -m http.server 5173 --bind 0.0.0.0` from `spikes/`.
- **Reading device behaviour as text:** pass `debug` to `Sheet.Root`/`BottomSheet`. The playground forwards those lines (plus
  onDetentChange/onOpenChange) to `apps/demo/.logs/device.log`, prefixed with browser and tab id; hidden tabs don't log.
  Prefer this over screenshots. `scripts/android-suite.sh` runs the gesture suite and summarises it per run.
- Chrome Android can be inspected live: `adb forward tcp:9222 localabstract:chrome_devtools_remote`, then a small CDP
  `Runtime.evaluate` over `ws://localhost:9222/devtools/page/<id>` (list pages at `localhost:9222/json`). Firefox release builds
  don't forward console output to logcat.
- Each `am start` opens a **new tab** on the phone, and stale tabs keep running (Vite reloads them). Mind that when reading logs.
- Android (the maintainer's phone): `adb reverse tcp:5180 tcp:5180` (5173 for the spike), then
  `adb shell am start -a android.intent.action.VIEW -p org.mozilla.firefox -d '<url>'` (or `com.android.chrome`).
  Drive gestures with `adb shell input swipe x1 y1 x2 y2 <ms>` (short ms = fling, long = drag) and read the HUD via
  `adb exec-out screencap -p`. The screen is 1080x2340 at about 2.6 dpr.
- iOS: Xcode simulator (`xcrun simctl openurl booted <url>`, `xcrun simctl io booted screenshot <ABSOLUTE path>`).
  Drive touch with `idb ui swipe --udid <id> --duration <s> x1 y1 x2 y2` and `idb ui tap` (points, 402x874).
  Keep swipes above y≈780, or they hit the Safari toolbar and open the tab switcher. The simulator has a hardware keyboard
  connected, so it shows no software keyboard until Cmd+K is pressed in the Simulator app. A real iPhone is needed before calling iOS done.

## Research sources and clean room
Silk (`@silk-hq/components`) and Velvet UI (`@velvetui/react`) are proprietary. Their unpacked npm bundles are in
`.research/` (gitignored) for reference. **Only subagents read them, and they explain the technique back in prose; never copy their code into this repo.**
pure-web-bottom-sheet (MIT, viliket) is the closest open-source prior art (scroll-snap + scroll-driven animations).
