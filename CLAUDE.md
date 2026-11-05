# bottom-sheet

The most native-feeling bottom sheet for the mobile web. React first. MIT.
Published as `@yourrealm/bottom-sheet` (headless) and `@yourrealm/bottom-sheet/styled` (preset). It will be consumed via npm by
`../dapuzzler` (Vite, React 19, Tailwind v4, shadcn/Base UI) and `../shopping/web` (Vite, React 19). Neither app uses SSR.

## Repo layout
```
packages/bottom-sheet/          the library (tsdown → dist/, ESM only)
  src/core/math.ts              pure detent math + velocity projection (unit-tested: math.test.ts)
  src/core/controller.ts        framework-agnostic controller; ALL the behaviour lives here
  src/styles.css                structural CSS (mechanics only, [data-ybs-*] selectors), a file the app imports
  src/styled.css                imports styles.css and adds the preset look
  src/react/sheet.tsx           headless compound parts: Root/Trigger/Close/Portal/Backdrop/View/Content/Header/Handle/Title/Description
  src/styled/                   preset parts (classes .ybs-*, tokens --ybs-*) + all-in-one <BottomSheet>
apps/demo/                Vite app for device testing (port 5180), POSTs debug lines to .logs/device.log
spikes/01-single-scroller/      the original plain-HTML spike (reference)
scripts/android-suite.sh        on-device gesture suite (adb), prints PASS/CHECK per run
```
Commands: `pnpm dev` (playground), `pnpm test`, `pnpm typecheck`, `pnpm build`.
In the workspace, package `exports` point at `src/` (no build needed for the playground); `publishConfig.exports` points at `dist/`.
**Publishing:** `pnpm -F @yourrealm/bottom-sheet release` (or `pack:check` to inspect the tarball). It copies the repo
README/LICENSE into the package, builds, and publishes. Only pnpm applies `publishConfig.exports`, so
`scripts/prepack.mjs` refuses npm/yarn. The maintainer's pnpm has `ignore-scripts=true`, so lifecycle hooks
(`prepack`) don't run; that's why the explicit scripts exist.
The peer dependency is React >= 19 (parts use ref-as-prop).
**CSS is a file the app imports**, `@yourrealm/bottom-sheet/styles.css` (headless) or `styled.css` (preset, imports
styles.css), before Tailwind. It's a plain stylesheet, so a strict CSP (no `style-src 'unsafe-inline'`) works; the
build copies `src/*.css` to `dist/` (`scripts/build-css.mjs`), and `sideEffects: ["*.css"]` keeps bundlers from dropping
the import. Everything is in `@layer ybs`, ordered by `@layer ybs-defaults, theme, base, ybs, components, utilities;` (Tailwind v4's
names): unlayered consumer CSS and Tailwind utilities win, and preflight (in `base`) can't wipe the preset. The order
statement only counts if the file comes first. Each file sets a marker on :root (`--ybs-css-core` / `--ybs-css-styled`);
opening a sheet without it logs a console error naming the import (`src/react/css-check.ts`). Tests: "Tailwind v4
layers", "works under a strict CSP", "opening a sheet without its CSS logs an error".

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
  Skipped within 100ms of a user scroll event (`USER_SCROLL_QUIET`): during a fling or a content scroll, `current` is
  where the sheet last rested, and pinning to it yanked the sheet back when content changed height mid-fling.
  Test: "content that changes height mid-scroll". Device suite after this change (2026-11-01): 3/3 Chrome + 3/3 Firefox Android PASS; again after fullscreen/floating/recede/detached drag: 6/6.
- **Close** when `scrollend` lands at 0 (debounce fallback when `onscrollend` is missing).
- **Wheel/trackpad steps detents.** With mandatory snapping, a small wheel delta at a partial detent snaps straight back,
  so the wheel looked dead on desktop (reported on the Comments demo). Now: while below full, or at full and scrolling up,
  each wheel *gesture* (events < 250ms apart) is `preventDefault`ed and steps exactly one detent. At full scrolling down, or
  inside the content, the wheel scrolls natively. A gesture that started in the content stops at the content top and never
  moves the sheet. Touch never produces wheel events.
- **A wheel scroll lands at the content top** (2026-11-05, maintainer in Chrome: "just when I expect it to move to the
  next detent it snaps back up"). Browsers animate wheel scrolling, so the content overshot full by ~30px, the guard
  pinned it back (visible snap) and its 800ms hold swallowed the next notches. Now `onWheel` tracks where the
  gesture's native scroll is heading (`wheelAim`, clamped to the scroll range); when an event would take it past
  full, it's cancelled and `glide(true)` slides to full (`LAND_MS` 180, decelerate, snap off). The rest of that
  gesture is swallowed; the next one steps the sheet. The guard stays as the fallback (touch, other scrollers).
  Also fixed: a gesture anchored exactly at full belonged to neither side, so full -> content -> back up in one
  motion ran down the detents and closed (the guard now re-anchors it on the side it moves to first). Test:
  "one wheel gesture from full into the content and back stops at full".
- **Closing by wheel has friction** (issue #3, 2026-11-05): a step that would close instead starts a "pull" (snap off
  via `data-ybs-drag`): the sheet follows a damped share of the scroll (at most 56px) and closes on the third
  notch-sized event (two felt too easy on the maintainer's mouse) (>= 15px, or a line/page delta) or 150px added up (a trackpad swipe); with no wheel for 400ms
  it springs back. A single 1px nudge used to close a single-detent sheet. Steps between detents are unchanged.
  Notch size 15px: Firefox on macOS sends a slow notch as one 19px event (57-95 faster; measured with the
  maintainer's mouse, 30px took three notches), and Chrome's 100px shrinks under browser zoom. Chromium's mobile
  emulation also divides deltas by the dpr (tests multiply by `devicePixelRatio`). Any other move cancels a pull (`cancelPull` in
  `scrollToDetent`, touch, pointer, destroy). Tests: "wheel steps detents…", "wheel friction…".

Reference: `spikes/01-single-scroller/index.html` (plain HTML, debug HUD, option toggles via URL query).

### Programmatic moves glide (our own animation, not smooth scroll)
Open, close, snapTo, wheel steps and the keyboard move animate scrollTop per frame (`glide()` in the controller):
~400ms Material 3 emphasized-decelerate moving up, ~280ms emphasized-accelerate moving down, instant with reduced
motion. Snapping is off while it runs (`[data-ybs-glide]`), each frame aims at the target's current position (layout
changes are followed), and touch/wheel/mouse-drag stop it. Why: native `scrollTo({behavior:'smooth'})` measured
660-770ms on the maintainer's phone (Chrome 660-680, Firefox 760-770, from scrollTo to scrollend), fixed per browser.
Research summary (agent, 2026-11-01): no study measures sheet timing; platform guidance is 350-450ms in, ~30% faster out.
Opening no longer waits two frames (that was for Chrome dropping a smooth scrollTo on a new scroller).
Tests: "glide (programmatic moves)". Device suite with the glide and the press arbiter (2026-11-01): 3/3 Chrome + 3/3 Firefox Android PASS. Again after both pre-release review rounds (`ed4300c`): 3/3 + 3/3 PASS.
- Seen once, not reproduced (2026-11-01): a Chrome Android tab where touch scrolling of the sheet stopped working
  (touches arrived, programmatic scrollTop worked). That tab had gone lab sheet -> closed -> Comments sheet glide-open
  during an interrupted device-suite run. Watch for it.

### Only the user (or we) can close by scrolling
Arriving at closed closes the sheet only after our own move there or user input on the sheet (touch, wheel, pointer,
key) within 3s (`STRAY_MS`). Any other scroll that snaps to closed (the browser revealing a focused element, an app's
scrollIntoView, a test runner) goes back to the resting detent. Found via dapuzzler's toss test: Playwright's
scroll-into-view landed nearer the closed snap point and the picker closed before the click (flaky under load).
Test: "a scroll to closed without user input goes back instead of closing".

### Presses: one arbiter in the controller
Which presses count as taps and whether their click activates is decided in one place (`onPressStart/Move/End` +
`onClickCapture`, native capture listeners on the scroller). The click is dropped when:
- a touch started on content that was still moving (scroll event < 100ms before): native lists only stop. Chrome and
  Firefox Android sent the click in our snap scroller (a fling-stopping tap on the 1000-rows list opened a row);
- the press became a drag (> 10px, or the header drag, which starts at 4px);
- it was a tap outside the sheet: that dismisses on pointerup (`onOutsideTap`), not on click, because after a swipe
  on the spacer (touch-action: none) Chrome Android spends the next tap stopping an invisible fling and sends no click.
The closing layer is not inert, so the click after a closing tap lands on it (dropped), not on a row below.
Device-verified on Chrome Android (2026-11-01): fling+tap, row tap, overlay tap over a row, swipe+tap. Replaced three
separate mechanisms (window click swallow, View pointer handlers, a click-drop flag) that had started to interact.

### Lessons from the React package (not in the spike)
- **Ref order:** React attaches an ancestor's ref *after* its descendants' layout effects run. `View` therefore finds the portal
  root with `scroller.closest('[data-ybs-root]')`, not from a ref.
- **StrictMode** mounts, destroys and remounts the controller, which produces a stray `scrollend` at 0. `open()` sets
  `target`/`programmatic` synchronously, so that stray event is retargeted instead of being read as "closed".
- **Chrome Android dropped a smooth `scrollTo`** on a scroller created the frame before. That's moot since the glide sets
  `scrollTop` per frame itself (no two-rAF wait, no watchdog any more).
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
  80ms of samples), then glide there. Re-enable snap on `scrollend`.
- If the release lands inside the content (`top > full`), don't snap.
- ✅ Chrome desktop (driven with fast synthetic drags: a flick up goes to full, a flick down closes). Slow-drag feel and Firefox desktop
  are untested.

### Header drag while the content is scrolled ("detached drag", any pointer)
In one scroller, dragging the sticky header down would scroll the content back to its top before the sheet moves (reported
on the Comments demo: "trying to close via the handle just scrolls up"). Native moves the whole sheet and keeps the content offset.
- While `scrollTop > full`, the controller sets `data-ybs-scrolled`; the header (`[data-ybs-drag]`) then gets `touch-action: none`.
- A pointer drag there (touch or mouse) moves the scroller with `transform` (content scrollTop pinned), painting progress /
  `--ybs-visible` itself (`paint(st, drop)`). Release: velocity projection → nearest stop. `full` springs back (content
  offset kept); anything else animates the drop there, then in one frame removes the transform and sets `scrollTop` to that
  detent (the content returns to its top; invisible when closing).
- Header controls still work: no preventDefault/capture until 4px of movement, and the click after a real drag is swallowed.
- Device (2026-11-01): Chrome + Firefox Android: a small drag springs back with the offset kept, a fling closes. Tests:
  "header drag while the content is scrolled".

### Closing releases the page at once
A modal sheet's siblings are inert only while it is open (`blocking` in Portal), not while it animates closed: as soon as
closing starts, inert is lifted and focus returns to the trigger. The closing sheet itself is NOT inert: a touch tap
closes on pointerup, before the click, and that click must land on the closing overlay (which ignores it), not fall
through to a row of the sheet below (tried and reverted 2026-11-01). Once `close()` runs, no input stops it (the
controller's `closing` flag): a touch doesn't stop the glide, and a wheel or header drag is ignored. Wherever it comes
to rest short of closed while closing (a finger kept dragging after the glide reached 0, a header drag already running
when `close()` came), it carries on to closed once the finger lifts. A wheel used to step a closing sheet back up, and a
touch could leave it at a detent, both on screen with `open=false` and impossible to close normally.
Reopening during the close moves focus into the sheet again (the page was released and re-made inert), and
`returnFocus` is kept until unmount so the final close restores it.
A header drag listens for its release on the window: a mouse that left the header before its first move released
elsewhere, `touching` stayed set, and every later close waited for a finger forever (an invisible layer over the page).
A new mouse press ends a mouse drag whose release was missed (not a second finger: that aborted a touch drag), the
mouse header drag also ends on `lostpointercapture`, and any new press clears the arbiter's "drop the next click" window. Test: "a tap on the overlay of a stacked sheet…". Found porting dapuzzler: a key pressed right after Escape still landed in the sheet (the toss picker
reopened on Space). Test: "the page takes focus and input back as soon as the sheet starts closing".

### Stacked sheets (`src/react/stack.ts`)
- A sheet opened from inside another sheet renders its own portal root (later in `<body>`, so on top). Its Portal makes
  everything else inert (siblings of its root and of each ancestor up to `<body>`, so `Portal container` works too),
  including the sheet below. `inert` is **counted per element** (`holdInert`/`releaseInert` in `stack.ts`): the page
  stays inert until the last modal sheet lets go, whichever closes first; elements the app made inert are left alone.
- A module-level stack of open sheets handles: **Escape closes only the top sheet** (one document listener, not one per
  sheet); the sheet directly below gets `data-ybs-covered` and `--ybs-covered` (0..1, following the upper sheet's progress)
  so `/styled` can scale it back like iOS; **only the top sheet reacts to the keyboard** (`isActive` option).
- Don't toggle `overflow` on a covered sheet (Firefox re-snaps on overflow changes); `inert` already blocks it.
- **Opened together** (issue #4, 2026-11-05): a parent and a nested sheet opening in the same render ran the inner
  one's effects first (React runs children first), so it joined the stack, the DOM (`<body>` order = paint order) and
  took focus before its parent and ended up under it. `Root` reads the parent `SheetContext`; a sheet whose parent is
  opening but not yet on the stack (`stacked`, set by the parent's Portal after `pushSheet`) doesn't mount until it is.
  A parent that isn't open doesn't hold it. The hold is its own context (`HoldNestedContext`), so nested closed sheets
  don't re-render on every parent context change. Tests: "a parent and a nested sheet opened together…" (state
  change, on load). Reviewed by a fresh agent: three levels at once, headless child outside the Portal, non-modal
  parent, StrictMode all fine. Left as is: on load (no user activation) the browser groups the two CloseWatchers, so
  one Escape/back closes both (not a regression; re-arming would fight the anti-trap rule; README says so).
- Demo: Stacked settings (three levels: Settings → Appearance → Accent colour, plus a controlled Language sheet;
  "Change language" / `?open=language` opens Settings and Language together).

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
- When the keyboard opens (`innerHeight - vv.height * vv.scale > 120`; the scale keeps pinch-zoom out of it), go to the
  largest detent, as native does, but only while the sheet is below full: with the content scrolled, the focused field
  is already in view, and going to `full` scrolled the content back to its top (a field low in a long form vanished).
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
slow mouse-drag feel, page scale-back (the page behind a sheet),
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
  A programmatic close (`open={false}`) temporarily re-adds `closed` (the controller's `closing` flag).
- `onDetentChange` never reports `'closed'` (closing is `onOpenChange`), so `detent={d} onDetentChange={setD}`
  round-trips; it used to, and a controlled sheet then reopened at closed and closed again at once.
- **Escape only acts on a non-modal sheet while focus is inside it** (`takesEscape` in `stack.ts`). Otherwise typing in
  an unrelated field and pressing Escape collapsed the solved sheet. Escape goes to the topmost sheet that takes it
  (`escapeTarget`). The browser still routes Escape to the newest CloseWatcher, so every Escape sets `escapePressed`
  (else that watcher read it as back), and a watcher whose sheet doesn't take it hands it to `escapeTarget()`.
  Escape during IME composition is ignored.
- **Firefox Android leaves a swipe below the floor** (rested at 46px and 39px under a 76px peek, no snap up). The
  controller now treats "resting below the lowest detent" like "resting at closed" for a sheet that can't be dismissed
  (`belowFloor`, on scrollend and on finger lift) and scrolls back up to the floor. Chrome snaps natively.
- Device results (2026-11-01, gesture sequence: drag header to the peek, tap the board through it, fling up to full,
  fling down to the peek, fling down at the peek): Chrome Android ✅, Firefox Android ✅ (after the fix above),
  never an `onOpenChange`. A real iPhone is still untested.

## Page sheet and fullscreen (demo `#/notes`, `?fullscreen=1`)
- `fullscreen` (core): `--ybs-inset: 0` and the sheet gets `min-height: calc(var(--ybs-vv-h) - var(--ybs-inset))`, so full
  covers the screen even with short content (no fit-content). `min-height: 100%` does NOT work there (doesn't resolve).
  `/styled`: corner radius follows `--ybs-at-top` (0 below 90% progress, 1 at full), header padded by the top safe area.
- `/styled`: `variant="page"` = `recede` + `width="full"` + the min-height (it opens at full because the default
  detents are `[]`; detents passed explicitly still apply). `width="full"` keeps header/body
  full width (a narrower header showed corner seams) and centres their content with `padding-inline: max(16px, (100% - --ybs-content-width) / 2)`.
  `leading`/`trailing` render a 3-column `.ybs-bar` grid with the title centred.
- Device (2026-11-01): Chrome + Firefox Android, page and fullscreen open at full and a header swipe closes.

## Floating (iOS 26 style, `/styled` `floating`; on in the Places demo, `?floating=0` to compare)
- Paint-only: a `clip-path: inset(... round ...)` on the sheet, never a width/margin change (that would reflow while
  moving and shift snap positions). The controller sets `--ybs-visible` (on-screen sheet px = min(scrollTop, full));
  `100% - visible` is the part below the screen, so the clip's bottom edge sits a gap above the screen edge.
  `--ybs-float` is 1 below 75% progress and 0 at full; the gap and bottom corners scale with it (they slide off-screen).
- Side spacing adds `--ybs-float-gap` (header padding, `--ybs-body-inset`), fixed rather than following the float, so
  text isn't 8px from the visible edge at a peek (2026-11-02). Not with `width="full"`.
- The clip also stops hits in the gap (test: "floating: inset with a gap at the peek"). It clips the sheet's own box-shadow.
- Device (2026-11-01): Chrome + Firefox Android render it and drag from the peek to full.

## Page behind recedes (`recede`, default on for `/styled` `variant="page"`; demo `#/notes`)
- Opt-in wrapper (`data-ybs-background`), like Vaul. `src/react/stack.ts`: the lowest open modal sheet with `recede`
  sets `data-ybs-recede`, `--ybs-recede` and `--ybs-scroll-y` on <html>. `--ybs-recede` is **coverage** (visible sheet / H,
  from the controller's `onProgress(progress, cover)`), not progress: a short fit-content sheet at "full" covers half the
  screen and must not recede the page. `/styled` maps it so nothing happens below 60% coverage.
- The attribute is removed when the sheet closes: a transform on the wrapper re-bases its fixed elements, so it must not linger.
- `/styled`: scale 0.93 from the top of the screen (`transform-origin` uses `--ybs-scroll-y`), down by safe area + 10px,
  top corners rounded via `clip-path` (overflow/border-radius would sit at the document top when scrolled). html/body
  go black with `!important`: our layer otherwise loses to the app's own unlayered body background.
- Page sheets use a 22px top inset (receded page top is at +10px), so a strip of the receded page shows above, like iOS.
- Device (2026-11-01): renders in Chrome + Firefox Android.

## Android back closes the top sheet (`closeOnBack`, default = `modal`)
- One `CloseWatcher` per open sheet (Portal effect; `src/react/stack.ts` holds it on the stack entry). The browser
  routes back and Escape to the newest watcher = the top sheet. No history entries, so no router/URL interference
  (rejected: pushState + popstate, which re-runs router loaders and leaves stray entries).
- The watcher is dropped as soon as the sheet starts closing, and re-armed after it fires if the sheet stays open
  (not dismissible). Our own Escape listener skips a top sheet that has a watcher (the browser sends Escape to it;
  `closedByEscape()` tells the reasons apart); for a top sheet without one it cancels the keydown, which also stops
  the browser from closing a watcher further down.
- Device results (2026-11-01): Chrome Android ✅ (Settings → Appearance, back, back: closes top then bottom, reason `back`).
  Firefox Android: an early test had the back button bypass `CloseWatcher` and leave the page; the maintainer later
  confirmed back works well in Firefox Android too ✅.
- Browsers apply an anti-trap rule: watchers created without a user activation since the last one are grouped, so
  a sheet opened on a timer may close together with the one below, or back may leave the page.
- Tests: "back button (CloseWatcher)", "a non-modal sheet leaves back…", "without CloseWatcher (Safari today)…".
  All three Playwright browsers expose `CloseWatcher`; the last test deletes it.

## dapuzzler trial (2026-11-01, local only, nothing committed there)
Packed tarball unpacked into `../dapuzzler/node_modules/@yourrealm/bottom-sheet` (no package.json/lock change; `deno install`
removes it). All three sheets ported: `ui/sheet.tsx` (wrapper with dapuzzler's look, `header` prop), the solved sheet, What's new, and the toss setup picker (was a Dialog styled as a
sheet). Its e2e suite passes 22/22; Chrome Android: solved sheet peek/fling/chevron/tap-through, picker scroll + header-drag close.
Lessons: a non-modal sheet doesn't move focus, so an app that relied on initial focus (Enter = New board) needs
`initialFocus` (added for this; dapuzzler still has its two-rAF effect until it installs from npm); and don't put `touch-action` utilities on Header (Tailwind's utilities layer beats
`ybs`, which would disable the detached drag).

## Product decisions
- **`modal` is read when the sheet opens** (2026-11-01): Root snapshots it on mount (the page lock, inert, focus and
  Escape are set up for one or the other); a change applies from the next open. `closeOnBack` defaults from that value.
- **Keys never close the sheet** (2026-11-01): ArrowUp/PageUp/Home/Shift+Space at or below full are cancelled (not in
  fields, not Space on buttons); content above full still scrolls with keys. Escape is the keyboard close.
- **Late content** (2026-11-01): a sheet that opens with no height (headless, no header, lazy content) waits in
  `onScrollEnd` instead of settling at closed, and the ResizeObserver glides it open when the content arrives.
  Demo: `#/lab?late=1` (also `&container=1` for `Portal container`).
- **Packaging** (2026-11-01): the build adds `'use client'` to every chunk (Next.js App Router), a top-level `types`
  for old `moduleResolution: node10`, `/styled` re-exports the prop types, and `Sheet.View` passes its props to the scroller.
  The controller and the `guard` option are internal (not exported, no prop).
- **`initialFocus`** (2026-11-01), mirroring Base UI's (`boolean | ref | (openType) => …`), on `Sheet.Content` and
  `BottomSheet`. The open type is the page's last input (pointerdown's pointerType, or keyboard). dapuzzler's solved
  sheet needs it (Enter = New board on desktop). Known flaky under full-suite load: "header drag … a flick down closes
  the sheet" on firefox-desktop and once on webkit-mobile (mouse-flick velocity); passes alone. Also "a tap on the overlay of a stacked sheet…" on webkit-mobile.
- **`/styled` theme follows `color-scheme`** (2026-11-01): tokens use `light-dark()`, so an app's own theme switch (which
  sets `color-scheme`, like dapuzzler or next-themes) drives the sheet; `prefers-color-scheme` alone gave a dark sheet
  on a light-themed app. Apps with no `color-scheme` get light. Body side padding `--ybs-body-padding` (16px) matches
  the header; the demo uses it as-is and only edge-to-edge sheets (lab, share) set it to 0 (`.edge`).
- **Default detents `[]`** (decided 2026-11-01): a sheet opens at full unless it asks for partial detents, like iOS
  (`[.large()]`), Base UI and Vaul. The old default `[0.5]` opened dapuzzler's picker half-way, cutting off its content.
- **Lines only when something is behind them** (2026-11-02, from the dapuzzler/shopping feedback: body content sat
  flush on an always-on header divider): `/styled` draws the header divider only with `data-ybs-scrolled`, and the
  footer line only with `data-ybs-more` (controller: sheet taller than the screen and not scrolled to its end, live
  sizes, 2px slack because Chrome Android rests at 1255.2 of 1256). A sheet that fits never gets `data-ybs-more`, so
  a short sheet doesn't flash a footer line while gliding open.
- **`'header'` detent** (2026-11-02): a peek of exactly the header (measured while the header isn't stuck; `/styled`
  floating adds its gap via `--ybs-header-detent-offset`). Replaced the demo's `'76px'`, which showed ~20px of body.
- **Footer** (2026-11-02): `footer` prop / `Sheet.Footer`, `position: sticky; bottom: 0` in the one scroller, so it
  sits at the screen bottom at partial detents too. Takes the safe area from the sheet. Excluded from the iOS
  non-modal `position: relative` rule.
- **Edge** (2026-11-02): `BottomSheet.Edge` / `StyledSheet.Edge` pull content to the sheet edges with
  `--ybs-body-inset`. The sheet is `container-type: inline-size` so the full-width inset (`100cqw`) resolves at any
  depth. Everything a `BottomSheet` user needs hangs off `BottomSheet` (`.Edge`, `.Close`).
- **Names** (2026-11-02, for 0.2.0): `BottomSheet` (finished, the default) / `StyledSheet` (its styled parts, from
  `/styled`) / `Sheet` (headless parts, from the root). The styled parts used to be a second `Sheet`, which led
  shopping's agent to them instead of `BottomSheet`. No alias for the old name, so agents can't find the old path.
- **`onExitComplete`** (2026-11-02, Framer Motion's name): fires in Root when `mounted` goes true -> false, so after
  the portal is gone, whichever path closed it. README "Closing animates" tells apps to keep the sheet rendered
  (shopping unmounted with `{open && …}` and lost the animation silently). Test: "onExitComplete fires once…".
- **Close button** (2026-11-02): `/styled` `closeButton` (visible ✕, off by default, in `trailing` or a
  `.ybs-title-row`) and otherwise a screen-reader-only `Sheet.Close` in the header of every dismissible sheet (shows on
  keyboard focus): VoiceOver can't swipe or tap the backdrop (reasoned, not tested on a device). The ✕ strokes with
  `--ybs-muted` directly, since app button resets (`button { color: inherit }`) beat our layer. `closeLabel` localizes.
- **A `'header'` peek catches flings** (2026-11-02, maintainer felt it on the phone): its marker gets
  `data-ybs-catch` -> `scroll-snap-stop: always`, so a flick from full or half lands on the peek; a flick from the peek
  closes (unless `dismissible={false}`). Other partial detents stay passable: stopping at every detent made a half
  height a speed bump (flick from full stopped at half instead of closing). Like Material's collapsed state.
- **`'header+footer'` detent** (issue #5, 2026-11-05, for Venga's "Create with AI" chat): header bottom + the footer's
  `offsetHeight` (ignores the footer's translate, includes its safe-area padding), so the composer pins right under
  the header and the body is covered. Same not-stuck rule for the header part, same `data-ybs-catch`, `'header'`
  without a footer. The footer is observed by the controller's ResizeObserver (a composer growing a line), and that
  observer now paints `--ybs-visible` itself when it re-pins: waiting for the scroll event left the footer off the
  header for a frame. Demo `#/assistant` (chat over a live event page, non-modal, not dismissible). Tests:
  "'header+footer' detent (chat over a page)". Demo lesson: don't `scrollIntoView` inside the sheet (it moves the
  sheet: one scroller), and Chromium's `scrollIntoView` now returns a Promise (an effect returning it breaks React).
- **Footer vs a low peek** (2026-11-02): at a peek lower than header + footer, the footer translates down under the
  header (`--ybs-header-h`, set by the controller, plus `--ybs-visible`); it used to pin over the title.
- **`eyebrow` and `--ybs-title-size`** (2026-11-02, shopping lost its "Section" label above the title): the eyebrow
  renders inside `Sheet.Title` (block span + a hidden ", ") so it fits all three header layouts and is part of the
  dialog's name ("Gamla stan , Share photo" in Chromium's tree; reads the same).
- Device suite after the 2026-11-02 changes (footer, `data-ybs-more`, `'header'` detent, edge, close buttons, rename):
  3/3 Chrome + 3/3 Firefox Android PASS, again after the peek catch. By hand (maintainer) in Chrome + Firefox Android and the
  iOS 26 sim (iPhone 17 Pro): footer line, header peek, edge, close button, eyebrow, floating peek + footer, Comments + keyboard.
- **0.2.1 feedback round** (2026-11-02): dapuzzler's "'header' drops out of the stops" was Vite's dep pre-bundle
  serving 0.1.0 (it can't read deno.lock, so it never re-bundled); not our bug. From shopping: no `.ybs-body` without
  children and `.ybs-header + .ybs-footer` trims to one 16px gap (confirm sheet, demo `#/confirm`); dark sheet
  `#2c2c2e` and a 60% dark backdrop (the dark difference lives in `--ybs-backdrop`'s alpha, max 0.6), since dark app
  pages dimmed 40% came out at the old sheet colour; no font-family (the app's font); eyebrow all caps 12px.
- **README for agents** (2026-11-02, from shopping's feedback): three-way table under "Use" (BottomSheet first),
  token table, "Closing animates", "Stacked sheets", "Replacing a `<dialog>`", "Testing" (real Escape key presses).
- **Dialog on desktop** (2026-11-03, `dialog` on Root: `true` = `DIALOG_QUERY` `(min-width: 768px) and (hover: hover)
  and (pointer: fine)`, or a media query string). **Default on for `BottomSheet`** (maintainer's call before 0.3.0,
  like SwiftUI's `.sheet` on iPad), off for the headless parts (their look isn't ready for it); the default lives in
  `/styled` (`DefaultsContext` in `react/defaults.ts`, internal). Test: "with no Provider: …" (`?provider=0`). A separate controller (`src/core/dialog.ts`, same `SheetController`
  interface) because the sheet's scroll machinery has nothing to do there: no snap, detents, guard, wheel steps or
  drags. The scroller becomes a non-scrolling flex overlay, spacer/markers/bleed/handle are hidden, and the sheet
  scrolls its own content (a second scroller is fine: one scroller exists for touch handoff). Open/close animate
  `--ybs-progress` per frame (220ms in, 160ms out, scaled by distance left so a reversal is quick); structural CSS
  maps it to opacity + scale(0.96..1), so headless dialogs animate too. `onProgress(p, 0)`: a dialog never recedes the
  page. No `onDetentChange` (reporting 'full' would leak into an app's `detent` state for the sheet). Decided when it
  opens, like `modal`; modal only. Outside press = pointerdown AND pointerup outside the sheet (a text selection
  dragged out doesn't close). `/styled`: ✕ by default when dismissible and no leading/trailing; `variant="page"` is
  a 48rem dialog. `usePresentation()` exposes it. App-wide: `<Sheet.Provider dialog>` / `<BottomSheet.Provider dialog>`
  (a context of defaults; the sheet's own prop wins). The demo wraps the app in it (`?dialog=0` or the home switch
  turns it off; `#/lab?nodialog=1` opts one sheet out). Classic scrollbars: the dialog is clipped with
  `clip-path: inset(0 round var(--ybs-dialog-radius))` (Chrome/Safari don't round a scroller's own scrollbar), so its
  shadow is a `drop-shadow` filter on the overlay. Demo `#/floating`: Maps-style non-modal floating panel.
  Device suite with all of it (2026-11-03): 3/3 Chrome + 3/3 Firefox Android PASS. Demo lesson: the hash router must
  `scrollTo(0, 0)` on route change; a scroll kept from the overview left Firefox Android's toolbar hidden on a page one
  screen tall (100dvh grew past the layout viewport) and fixed elements below the screen. Sheets were unaffected. Tests: "dialog on desktop (dialog prop)", firefox-desktop at 1280x800.
  Playwright's Firefox stops a wheel that overshoots the top a few px short under any sticky header (plain page too).
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
  because Firefox reuses an open tab for an identical URL (a stale page with old code). Log lines carry `?run=` as the tab id.
- **Map demos** (`#/places`, `#/floating`) use a real map: MapLibre GL + OpenFreeMap tiles (OSM data, no key; styles
  `liberty`/`dark` by `prefers-color-scheme`), lazy-loaded from `apps/demo/src/real-map.tsx` (~290 KB gz + worker).
  Automated browsers (`navigator.webdriver`) and `?map=fake` get the drawn stand-in, so e2e needs no network/WebGL;
  `?map=real` forces the real one. Pins are DOM `.pin` buttons in MapLibre markers either way.
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
