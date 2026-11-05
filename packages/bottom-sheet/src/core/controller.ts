import { type Detent, type Stop, buildStops, easeAccelerate, easeDecelerate, nearestStop, project, resolveStop, stopAt } from './math'

/**
 * Sheet controller. Framework-agnostic; React (or anything) renders the DOM, this drives it.
 *
 * DOM contract:
 *   root      fixed layer; receives CSS vars and state attributes
 *   scroller  the ONE native scroll container (sheet travel + content)
 *   markers   empty element inside the scroller's track (React leaves it alone);
 *             detent snap markers are inserted here
 *   sheet     the panel; snap area for `full`
 *
 * scrollTop is the only source of truth for the sheet position:
 *   0 = closed, H*f = partial detent f, full = min(H, sheet height), > full = content scrolled.
 *
 * Touch input is never handled in JS. JS only:
 *   - stops momentum from crossing the `full` line (native does this),
 *   - re-targets detents when the layout changes,
 *   - follows the visual viewport (keyboard),
 *   - mouse-drags on [data-ybs-drag] elements, and any-pointer drags there while the content is scrolled,
 *   - performs programmatic moves.
 */

export interface SheetControllerOptions {
  /** Partial detents: fractions of the available height (0.5) or CSS lengths ('76px'). `full` is always added. */
  detents: readonly Detent[]
  /** Whether a swipe down can close the sheet (default true). When false, the lowest detent is the floor. */
  dismissible?: boolean
  /** Modal sheets lock the page scroll (default true). Non-modal sheets leave the page alone. */
  modal?: boolean
  /** Called when the sheet comes to rest at a detent. Never 'closed': closing is reported by onClosed. */
  onDetentChange?: (detent: Detent) => void
  /** Called once the sheet has fully closed (scrolled to 0). */
  onClosed?: () => void
  /** On every scroll: progress 0 (closed) .. 1 (full), and cover 0..1, the share of the available height the sheet covers. */
  onProgress?: (progress: number, cover: number) => void
  /** A tap (no drag) on the sheet layer outside the sheet: above it, or beside it when it is narrower than the screen. */
  onOutsideTap?: () => void
  /** Whether this sheet is the active (top) one; inactive sheets ignore the keyboard. Default always. */
  isActive?: () => boolean
  /** Internal decision log, for testing on devices. */
  debug?: (message: string) => void
}

export interface SheetElements {
  root: HTMLElement
  scroller: HTMLElement
  markers: HTMLElement
  sheet: HTMLElement
}

export interface SheetController {
  open(detent?: Detent): void
  snapTo(detent: Detent): void
  close(): void
  /** Go to the lowest resting detent above closed. */
  collapse(): void
  setDetents(detents: readonly Detent[]): void
  setDismissible(dismissible: boolean): void
  /** Current resting detent, or null while moving / inside content. */
  readonly detent: Detent | null
  destroy(): void
}

/** scrollTop at or below this counts as closed (browsers settle on sub-pixel values, e.g. 1.02 in Firefox). */
const CLOSED_TOLERANCE = 2
const LOCK_QUIET_MS = 150
/** A fling can outlive a short quiet window and resume when overflow is restored (seen on Chrome and Firefox Android). */
const LOCK_MIN_MS = 800
const WHEEL_GESTURE_GAP_MS = 250
/**
 * Wheel friction for closing (issue #3): a wheel step that would close the sheet pulls it down with resistance
 * instead, and closes on the WHEEL_CLOSE_NOTCHES-th notch-sized event or once this much scroll has added up (a
 * trackpad swipe).
 * Short of that it springs back after WHEEL_PULL_RELEASE_MS without wheel events. Notches: Chrome/Edge on
 * Windows/Linux 100-120px (smaller under browser zoom: 100px is 33 at 300%); Firefox on macOS 19px for a slow notch,
 * 57-95 when scrolling faster (measured on the maintainer's mouse, 2026-11-05: 30 needed a fast third notch).
 * A small trackpad nudge sends single-digit deltas, so it doesn't count as notches and springs back.
 */
const WHEEL_CLOSE_PX = 150
const WHEEL_NOTCH_PX = 15
/** Three: two closed too easily with a mouse (maintainer, 2026-11-05). */
const WHEEL_CLOSE_NOTCHES = 3
const WHEEL_PULL_MAX = 56
const WHEEL_PULL_RELEASE_MS = 400
const KEYBOARD_THRESHOLD = 120
const MAX_RETARGETS = 3
/** A resize this soon after a user scroll event is mid-gesture or mid-momentum: don't re-target. */
const USER_SCROLL_QUIET = 100
const VELOCITY_WINDOW_MS = 80
/** A touch that starts this soon after a scroll event lands on moving content: it only stops the scroll. */
const MOVING_MS = 100
/** A press is a tap while it moves less than this (px) and, on touch, ends within TAP_MS. */
const TAP_SLOP = 10
const TAP_MS = 500
/** The click a dropped press would produce follows within this. */
const CLICK_AFTER_MS = 1000
/**
 * Arriving at closed closes the sheet only if we moved it there or the user touched, wheeled, dragged or pressed a
 * key within this long. Any other scroll (the browser scrolling a focused element into view, an app's
 * scrollIntoView, a test runner) that snaps to closed is undone. Long enough for a fling to finish.
 */
const STRAY_MS = 3000
const INPUT_EVENTS = ['touchstart', 'touchend', 'wheel', 'pointerdown', 'pointerup', 'keydown'] as const
/**
 * Programmatic moves (open, close, snapTo, wheel steps, keyboard) are animated here, not by the browser's smooth
 * scroll: that took 660-770ms on a phone (Chrome/Firefox Android, measured 2026-11-01) and varies by browser.
 * Platform guidance for a sheet: ~400ms decelerating in, ~30% faster accelerating out.
 */
const GLIDE_UP_MS = 400
const GLIDE_DOWN_MS = 280

// The page scroll lock is shared by all open modal sheets: save the page's value on the first lock, restore it on
// the last release. Per-sheet save/restore broke when stacked sheets closed together (the upper one restored the
// lower one's 'hidden' after the lower one had already put the original back).
// A page with a classic (space-taking) scrollbar keeps its gutter, so the layout doesn't shift sideways.
let htmlLocks = 0
let htmlPrev = { overflow: '', gutter: '' }
export function lockHtml() {
  if (htmlLocks++ === 0) {
    const html = document.documentElement
    htmlPrev = { overflow: html.style.overflow, gutter: html.style.scrollbarGutter }
    if (window.innerWidth - html.clientWidth > 0) html.style.scrollbarGutter = 'stable'
    html.style.overflow = 'hidden'
  }
}
export function unlockHtml() {
  if (htmlLocks > 0 && --htmlLocks === 0) {
    const html = document.documentElement
    html.style.overflow = htmlPrev.overflow
    html.style.scrollbarGutter = htmlPrev.gutter
  }
}

export function createSheetController(els: SheetElements, options: SheetControllerOptions): SheetController {
  const { root, scroller, sheet } = els
  const markerHost = els.markers
  const dbg = (m: string) => options.debug?.(m)
  const modal = options.modal ?? true
  let requested = [...options.detents]
  let dismissible = options.dismissible ?? true
  // close() was called and the sheet is on its way out. Input doesn't stop it (a wheel or drag would otherwise leave
  // a sheet the app already considers closed on screen), and a non-dismissible sheet gets `closed` back as a stop.
  let closing = false
  const closable = () => dismissible || closing

  // layout
  let H = 0
  let full = 0
  let sheetH = 0
  let stops: Stop[] = []
  const markers = new Map<Detent, HTMLElement>()
  const closedMarker = makeMarker()
  closedMarker.style.top = '0px'
  markerHost.append(closedMarker)
  // Resolves CSS-length detents ('76px', '40dvh', 'min(...)') to pixels.
  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'position:absolute;top:0;left:0;width:0;visibility:hidden;pointer-events:none'
  markerHost.append(probe)

  // state
  let isOpen = false
  let destroyed = false
  let touching = false
  let anchor: number | null = null // scrollTop at finger release / wheel gesture start
  let programmatic = false
  let target: Detent | null = null // destination of a programmatic move
  let current: Detent | null = null // resting detent
  /** Last scroll event the user caused (finger, momentum, wheel): not ours, not the momentum lock's pin. */
  let lastUserScroll = -Infinity
  let emitted: Detent | null = null // last detent reported to onDetentChange
  let retries = 0
  let lock: number | null = null
  let unlockTimer: ReturnType<typeof setTimeout> | undefined
  let scrollEndTimer: ReturnType<typeof setTimeout> | undefined
  let lastWheel = 0
  let pageY = 0
  let keyboard = false
  let htmlLocked = false
  const releaseHtml = () => {
    if (htmlLocked) unlockHtml()
    htmlLocked = false
  }

  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
  /** Where a detent would sit (px), whether or not it is usable in this layout. */
  function rawTop(d: Detent): number {
    if (d === 'closed') return 0
    if (d === 'full') return full
    if (typeof d === 'number') return H * d
    probe.style.height = isPeek(d) ? `calc(${peekPx(d)}px + var(--ybs-header-detent-offset, 0px))` : d
    return probe.getBoundingClientRect().height
  }
  /** The measured peeks: a minimised state that shows the header (and the footer under it). */
  const isPeek = (d: Detent) => d === 'header' || d === 'header+footer'
  const peekPx = (d: Detent) => headerBottom() + (d === 'header+footer' ? footerHeight() : 0)
  /**
   * The `'header+footer'` detent adds the footer's height (it pins right under the header there, see the footer's
   * translate in styles.css). offsetHeight ignores that translate and includes the safe-area padding. Observed, so a
   * composer that grows a line re-measures even when the sheet's own height doesn't change.
   */
  function footerHeight(): number {
    const footer = sheet.querySelector<HTMLElement>('[data-ybs-footer]')
    if (!footer) return 0
    ro.observe(footer)
    return footer.offsetHeight
  }
  /**
   * The `'header'` detent: how far the header reaches into the sheet (its bottom edge), so the peek shows exactly
   * the header. Measured only while the header isn't stuck (content scrolled moves a sticky header down the sheet);
   * otherwise the last measurement is kept. Styles can add to it with --ybs-header-detent-offset (/styled's floating
   * adds its bottom gap).
   */
  let headerPx = 0
  function headerBottom(): number {
    const header = sheet.querySelector<HTMLElement>('[data-ybs-header]')
    if (!header) return 0
    if (scroller.scrollTop <= full + 1) {
      const box = sheet.getBoundingClientRect()
      const scale = sheet.offsetHeight > 0 ? box.height / sheet.offsetHeight : 1 // a covered sheet is scaled down
      headerPx = (header.getBoundingClientRect().bottom - box.top) / (scale || 1)
    }
    return headerPx
  }
  const resolve = (d: Detent) => resolveStop(d, rawTop(d), stops)
  const pos = (d: Detent) => resolve(d).top
  /** The lowest resting detent that isn't closed; also where open() goes by default. */
  const floor = () => stops.find((s) => s.detent !== 'closed')!.detent

  function makeMarker() {
    const m = document.createElement('div')
    m.setAttribute('data-ybs-marker', '')
    m.setAttribute('aria-hidden', 'true')
    return m
  }

  function layout() {
    H = scroller.clientHeight
    sheetH = sheet.offsetHeight
    full = Math.min(H, sheetH)
    const partials = requested.filter((d) => d !== 'closed' && d !== 'full').map((d) => ({ detent: d, top: rawTop(d) }))
    stops = buildStops(partials, full, closable())
    root.style.setProperty('--ybs-h', `${H}px`)
    // How far the header reaches into the sheet: the footer stays tucked under it while the sheet is too low to show both.
    root.style.setProperty('--ybs-header-h', `${headerBottom()}px`)
    // The bleed (the sheet's colour behind the keyboard) is a sibling of the sheet, so a color-scheme set on the sheet
    // alone (one sheet forced dark) wouldn't reach it. Copy it over.
    const bleed = root.querySelector<HTMLElement>('[data-ybs-bleed]')
    if (bleed) bleed.style.colorScheme = getComputedStyle(sheet).colorScheme
    root.toggleAttribute('data-ybs-fit', sheetH < H)
    // No snap point at 0 for a sheet that can't be dismissed: a swipe down settles on the lowest detent natively.
    closedMarker.hidden = !closable()

    for (const [d, m] of markers) {
      if (!requested.includes(d)) {
        m.remove()
        markers.delete(d)
      }
    }
    for (const p of partials) {
      let m = markers.get(p.detent)
      if (!m) {
        m = makeMarker()
        closedMarker.after(m)
        markers.set(p.detent, m)
      }
      m.style.top = `${p.top}px`
      // A header peek is a minimised state: a fling down from above lands on it instead of running past to closed.
      m.toggleAttribute('data-ybs-catch', isPeek(p.detent))
      m.hidden = !stops.some((s) => s.detent === p.detent)
    }
  }

  function scrollToDetent(d: Detent) {
    cancelPull()
    target = resolve(d).detent
    dbg(`scrollTo ${String(target)} (${Math.round(pos(target))})`)
    programmatic = true
    anchor = null
    retries = 0
    unlock()
    // Already there (e.g. a mouse drag released exactly on a detent, or at 0): nothing moves, so settle now.
    // Otherwise the drag stays in `settle` (snap off), or a close never finishes.
    if (Math.abs(scroller.scrollTop - pos(target)) < 1) {
      stopGlide()
      requestAnimationFrame(onScrollEnd)
      return
    }
    glide()
  }

  // ---- glide: our own animation of scrollTop toward `target` ----
  // Snapping is off while it runs ([data-ybs-glide]); each frame aims at the target's current position, so a
  // layout change mid-way (keyboard, URL bar, content) is followed. A touch, wheel or mouse drag stops it.
  let gliding = false
  let glideRaf = 0
  function glide() {
    stopGlide()
    if (target == null) return
    const from = scroller.scrollTop
    const up = pos(target) > from
    const ms = reducedMotion() ? 0 : up ? GLIDE_UP_MS : GLIDE_DOWN_MS
    if (ms === 0) {
      scroller.scrollTop = pos(target)
      requestAnimationFrame(onScrollEnd)
      return
    }
    const ease = up ? easeDecelerate : easeAccelerate
    gliding = true
    root.setAttribute('data-ybs-glide', '')
    let t0: number | null = null
    const step = (now: number) => {
      if (destroyed || !gliding || target == null) return
      t0 ??= now
      const k = Math.min((now - t0) / ms, 1)
      scroller.scrollTop = from + (pos(target) - from) * ease(k)
      if (k < 1) glideRaf = requestAnimationFrame(step)
      else {
        stopGlide()
        onScrollEnd()
      }
    }
    glideRaf = requestAnimationFrame(step)
  }
  function stopGlide() {
    if (!gliding) return
    gliding = false
    cancelAnimationFrame(glideRaf)
    root.removeAttribute('data-ybs-glide')
  }

  // ---- momentum lock ----
  // One frame of overflow:hidden is not enough: Firefox Android's fling keeps
  // running after it. Pin and hold until the fling has gone quiet.
  let lockedAt = 0
  function clamp(top: number) {
    dbg(`clamp @${Math.round(scroller.scrollTop)} -> ${Math.round(top)} (anchor ${anchor == null ? '-' : Math.round(anchor)})`)
    lock = top
    lockedAt = performance.now()
    scroller.style.overflowY = 'hidden'
    scroller.scrollTop = top
    armUnlock()
    anchor = top
  }
  function armUnlock() {
    clearTimeout(unlockTimer)
    const minLeft = LOCK_MIN_MS - (performance.now() - lockedAt)
    unlockTimer = setTimeout(unlock, Math.max(LOCK_QUIET_MS, minLeft))
  }
  function unlock() {
    if (lock == null) return
    const pinned = lock
    lock = null
    scroller.style.overflowY = ''
    // Firefox remembers the snap target chosen when the fling started (e.g.
    // `closed`) and re-snaps to it when overflow is restored. An explicit
    // programmatic scroll to the pinned position replaces that target.
    scroller.scrollTop = pinned
    dbg(`unlock @${Math.round(scroller.scrollTop)}`)
    // iOS fires no scrollend for the pinned scrollTop under overflow:hidden, so
    // settle here (idempotent if a real scrollend also arrives).
    requestAnimationFrame(() => {
      if (lock != null || touching || programmatic) return
      const st = scroller.scrollTop
      if (Math.abs(st - pinned) > 2) dbg(`drift after unlock: ${Math.round(pinned)} -> ${Math.round(st)}`)
      onScrollEnd()
    })
  }

  // ---- scroll ----
  /**
   * Paint the position vars. `drop` is how far a header drag has pulled the whole sheet down while its content
   * stays scrolled (see detachedDrag).
   */
  let scrolled = false
  let more = false
  function paint(st: number, drop = 0) {
    const shown = Math.max(Math.min(st, full) - drop, 0)
    const progress = full > 0 ? Math.min(Math.max(shown / full, 0), 1) : 0
    root.style.setProperty('--ybs-progress', String(progress))
    // During a detached drag the clip math in /styled needs the screen bottom in sheet coordinates, which is st.
    root.style.setProperty('--ybs-visible', `${drop > 0 ? st : Math.min(st, full)}px`)
    options.onProgress?.(progress, H > 0 ? shown / H : 0)
    root.style.setProperty('--ybs-bleed', st > 4 && drop === 0 ? '1' : '0')
    // Content scrolled: a header drag moves the whole sheet (touch-action off on the header, see styles).
    const s = st > full + 1
    if (s !== scrolled) {
      scrolled = s
      root.toggleAttribute('data-ybs-scrolled', s)
    }
    // Content hidden below the screen (behind a sticky footer): the sheet is taller than the screen and not scrolled
    // to its end. A sheet that fits never sets it, so a short sheet doesn't flash a footer line while it glides open.
    // Live sizes (the URL bar changes them without a resize of the sheet), and 2px of slack: Chrome Android rests at
    // fractional positions just short of the end (1255.2 of 1256).
    const m = sheetH > H + 1 && st < scroller.scrollHeight - scroller.clientHeight - 2
    if (m !== more) {
      more = m
      root.toggleAttribute('data-ybs-more', m)
    }
  }

  function onScroll() {
    const st = scroller.scrollTop
    lastScrollAt = performance.now()
    if (!programmatic && lock == null) lastUserScroll = performance.now()
    if (!detached) paint(st)

    if (lock != null && !touching) {
      if (Math.abs(st - lock) > 0.5) scroller.scrollTop = lock
      armUnlock()
    } else if (!touching && !programmatic && anchor != null) {
      // scroll-snap-stop normally stops momentum at full natively; this only catches a real overshoot
      // (2px tolerance: snap-stop lands on full with sub-pixel rounding).
      if ((anchor > full + 2 && st < full - 2) || (anchor < full - 2 && st > full + 2)) clamp(full)
    }

    if (!('onscrollend' in window)) {
      clearTimeout(scrollEndTimer)
      scrollEndTimer = setTimeout(onScrollEnd, 120)
    }
  }

  function onScrollEnd() {
    if (destroyed || gliding || pull) return // a glide settles itself when it ends; a wheel pull ends itself
    // Opened with no height yet (lazy content, no header): `full` is 0, so it "arrived" at closed. Wait for the
    // content; the ResizeObserver glides to the target once it has height.
    if (isOpen && !closing && full < 1 && programmatic) return
    const st = scroller.scrollTop
    dbg(`scrollend @${Math.round(st)} prog=${programmatic} target=${String(target)} lock=${String(lock)}`)

    // The browser may re-snap after a layout change and hijack a programmatic
    // move (Chrome Android, keyboard resize in two steps). Re-issue it.
    if (programmatic && target != null && !touching) {
      const to = pos(target)
      if (Math.abs(st - to) > 2 && retries++ < MAX_RETARGETS) {
        glide()
        return
      }
    }
    retries = 0
    if (root.getAttribute('data-ybs-drag') === 'settle') root.removeAttribute('data-ybs-drag')

    // Closing on purpose, but a finger (or a drag) stopped short of closed: carry on closing once it lets go.
    if (closing && isOpen && !belowFloor(st)) {
      if (touching) dbg('closing: waiting for the finger to lift')
      else scrollToDetent('closed')
      return
    }

    // Something other than the user or us scrolled the sheet down to closed (e.g. a scrollIntoView landing nearer the
    // closed snap point, seen in Playwright): go back to where it rested instead of closing.
    if (isOpen && !closing && !programmatic && !touching && belowFloor(st) && performance.now() - lastInputAt > STRAY_MS) {
      const back = current && current !== 'closed' ? current : floor()
      dbg(`scrolled to closed without user input: back to ${String(back)}`)
      scrollToDetent(back)
      return
    }

    const now = stopAt(st, stops)?.detent ?? null
    programmatic = false
    target = null
    current = now
    if (now != null && now !== 'closed' && now !== emitted && isOpen) {
      emitted = now
      options.onDetentChange?.(now)
    }
    if (isOpen && belowFloor(st)) {
      if (touching) dbg(`at closed, waiting for the finger to lift (st=${st.toFixed(2)})`)
      else settleAtClosed()
    }
  }

  /**
   * Resting where only closing makes sense: at 0, or, for a sheet that can't be dismissed, anywhere below its
   * lowest detent. Firefox Android leaves a swipe there (46px under a 76px floor) instead of snapping up to it.
   */
  function belowFloor(st: number) {
    return st <= CLOSED_TOLERANCE || (!closable() && st < pos(floor()) - CLOSED_TOLERANCE)
  }

  /** Resting at 0: close, or for a sheet that can't be dismissed, go back up to its floor. */
  function settleAtClosed() {
    if (closable()) finishClose()
    else {
      dbg('not dismissible: back to the lowest detent')
      scrollToDetent(floor())
    }
  }

  // ---- gestures ----
  // ---- presses: the one place that decides whether a press is a tap, and whether its click activates ----
  // - Touch on content that is still moving (a scroll event in the last MOVING_MS): it only stops the scroll, like
  //   native lists. Chrome and Firefox Android sent the click in our snap scroller (a fling-stopping tap opened a row).
  // - A press that became a drag (header drag, mouse drag, any move past TAP_SLOP): not a press of what's under it.
  // - A tap outside the sheet: onOutsideTap, decided on pointerup rather than click. After a swipe on the spacer
  //   (touch-action: none) Chrome Android spends the next tap stopping an invisible fling and sends no click.
  // In each case the click that follows is dropped. The closing layer keeps taking pointer events, so that click
  // lands here instead of on what's underneath (a row of the sheet below).
  let lastScrollAt = -Infinity
  /** Last touch, wheel, pointer or key input on the sheet: scrolls after it are the user's (see STRAY_MS). */
  let lastInputAt = -Infinity
  const onInput = () => (lastInputAt = performance.now())
  type Press = { id: number; x: number; y: number; t: number; touch: boolean; moving: boolean; outside: boolean; dragged: boolean }
  let press: Press | null = null
  let dropClickUntil = 0
  const isOutside = (el: EventTarget | null) => el instanceof Element && !el.closest('[data-ybs-sheet]')
  function onPressStart(e: PointerEvent) {
    // A new press: the click of an earlier dropped press (a drag with touch-action: none sends none) isn't coming.
    dropClickUntil = 0
    const touch = e.pointerType !== 'mouse'
    // A mouse drag whose release we never saw (touch pointers are captured implicitly; a second finger must not end one).
    if (!touch) endDrag?.()
    if (!touch && e.button !== 0) return void (press = null) // right/middle click: not a tap
    const now = performance.now()
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, t: now, touch, moving: touch && now - lastScrollAt < MOVING_MS, outside: isOutside(e.target), dragged: false }
  }
  function onPressMove(e: PointerEvent) {
    if (press?.id === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP) press.dragged = true
  }
  /** For drags that start below TAP_SLOP (the header drag starts at 4px). */
  const markDragged = () => {
    if (press) press.dragged = true
  }
  function onPressEnd(e: PointerEvent) {
    const p = press
    press = null
    if (!p || p.id !== e.pointerId) return
    const now = performance.now()
    if (p.moving || p.dragged) {
      if (p.moving) dbg('tap stopped the scroll: click dropped')
      dropClickUntil = now + CLICK_AFTER_MS
      return
    }
    if (p.outside && (!p.touch || now - p.t < TAP_MS)) {
      dropClickUntil = now + CLICK_AFTER_MS
      options.onOutsideTap?.()
    }
  }
  const onPressCancel = () => (press = null) // the browser took it as a scroll; no click follows
  function onClickCapture(e: MouseEvent) {
    if (performance.now() > dropClickUntil) return
    dropClickUntil = 0
    e.preventDefault()
    e.stopPropagation()
  }

  function onTouchStart() {
    cancelPull()
    touching = true
    anchor = null
    // A sheet on its way to closed finishes closing under a finger (it was closed on purpose; the closing layer
    // still takes touches). The finger-lift check below completes the close. Any other glide stops where it is.
    if (closing) return
    stopGlide()
    programmatic = false
    unlock()
  }
  function onTouchEnd(e: TouchEvent) {
    if (e.touches.length) return
    touching = false
    anchor = scroller.scrollTop
    dbg(`release @${Math.round(anchor)}`)
    // A touch while the sheet settles at closed makes its scrollend arrive with a finger down, so it
    // can't finish closing then. Re-check once the finger lifts; otherwise the sheet stays mounted,
    // invisible, over the page (observed on Firefox Android: the "wedged page" report).
    requestAnimationFrame(() => {
      if (touching || !isOpen || destroyed) return
      if (closing && !gliding && !belowFloor(scroller.scrollTop)) {
        dbg('finger lifted while closing: carry on')
        scrollToDetent('closed')
      } else if (!programmatic && belowFloor(scroller.scrollTop)) {
        dbg('finger lifted at closed')
        settleAtClosed()
      }
    })
  }
  // Wheel/trackpad. With mandatory snapping, a small wheel delta at a partial detent just snaps back,
  // so the wheel looks dead. Native rule instead (iOS: scrolling expands the sheet first): while the
  // sheet is below full, or at full and scrolling up, each wheel *gesture* steps one detent. At full
  // and scrolling down (or inside the content), the wheel scrolls the content natively.
  let wheelStepped = false
  function onWheel(e: WheelEvent) {
    if (e.ctrlKey) return // pinch-zoom
    // Shift+wheel scrolls sideways (a photo strip). Chrome on Windows/Linux reports it as deltaY with shiftKey and
    // scrolls horizontally itself; stepping a detent here would cancel that and move the sheet instead.
    if (e.shiftKey) return
    if (closing) return void e.preventDefault() // closing on purpose: the wheel doesn't bring it back
    if (pull) return pullMore(e)
    const t = performance.now()
    const newGesture = t - lastWheel > WHEEL_GESTURE_GAP_MS
    lastWheel = t
    const st = scroller.scrollTop
    const dy = e.deltaY
    const inSheetTravel = st < full - 1 || (st <= full + 1 && dy < 0)
    if (newGesture) {
      stopGlide()
      unlock()
      anchor = st
      programmatic = false
      wheelStepped = false
    }
    // A gesture that started inside the content stops at the content top (native snap-stop / guard);
    // it never goes on to move the sheet.
    const startedInContent = anchor != null && anchor > full + 1
    if (!inSheetTravel || dy === 0 || Math.abs(e.deltaX) > Math.abs(dy)) return
    e.preventDefault()
    if (startedInContent) return // reached the content top: stop here, don't move the sheet
    if (wheelStepped) return // one step per gesture (trackpads send long event streams)
    wheelStepped = true
    const here = nearestStop(target != null ? pos(target) : st, stops)
    const i = stops.indexOf(here)
    const next = stops[Math.min(Math.max(i + (dy > 0 ? 1 : -1), 0), stops.length - 1)]!.detent
    dbg(`wheel step ${String(here.detent)} -> ${String(next)}`)
    if (next === 'closed' && here.detent !== 'closed') return startPull(here.detent, e)
    if (next !== here.detent) scrollToDetent(next)
  }

  // A wheel pull towards closed (see WHEEL_CLOSE_PX): the sheet follows a damped share of the scroll, snap off.
  let pull: { base: Detent; sum: number; notches: number; drop: number; raf: number; timer: ReturnType<typeof setTimeout> } | null = null
  const wheelPx = (e: WheelEvent) => e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1)
  function startPull(base: Detent, e: WheelEvent) {
    stopGlide()
    unlock()
    target = null
    programmatic = false
    root.setAttribute('data-ybs-drag', 'active')
    pull = { base, sum: 0, notches: 0, drop: 0, raf: 0, timer: setTimeout(() => {}) }
    dbg(`wheel pull from ${String(base)}`)
    pullMore(e)
  }
  function pullMore(e: WheelEvent) {
    const p = pull!
    e.preventDefault()
    lastWheel = performance.now()
    const px = -wheelPx(e) // towards closed: scrolling up moves the sheet down
    p.sum = Math.max(p.sum + px, 0)
    if (px > 0 && (e.deltaMode !== 0 || px >= WHEEL_NOTCH_PX)) p.notches++
    clearTimeout(p.timer)
    if (p.notches >= WHEEL_CLOSE_NOTCHES || p.sum >= WHEEL_CLOSE_PX) return endPull(true)
    if (p.sum === 0) return endPull(false) // scrolled back up
    p.timer = setTimeout(() => endPull(false), WHEEL_PULL_RELEASE_MS)
    // Rubber band: the first notch shows about half the travel; it never goes past WHEEL_PULL_MAX.
    p.drop = WHEEL_PULL_MAX * (1 - Math.exp(-p.sum / WHEEL_CLOSE_PX * 1.5))
    if (!p.raf) {
      const step = () => {
        if (pull !== p || destroyed) return
        const goal = pos(p.base) - p.drop
        const st = scroller.scrollTop
        scroller.scrollTop = Math.abs(goal - st) < 0.5 ? goal : st + (goal - st) * 0.35
        p.raf = Math.abs(goal - st) < 0.5 ? 0 : requestAnimationFrame(step)
      }
      p.raf = requestAnimationFrame(step)
    }
  }
  /** Drops a wheel pull without moving (another move takes over: close(), a glide, a touch or drag). */
  function cancelPull() {
    if (!pull) return
    clearTimeout(pull.timer)
    cancelAnimationFrame(pull.raf)
    pull = null
    if (root.getAttribute('data-ybs-drag') === 'active') root.removeAttribute('data-ybs-drag')
  }
  /** Ends a wheel pull: close, or spring back to where it started. */
  function endPull(close: boolean) {
    const p = pull
    if (!p) return
    cancelPull()
    dbg(`wheel pull ${close ? 'closes' : 'springs back'}`)
    if (!isOpen || touching || closing) return void root.removeAttribute('data-ybs-drag')
    root.setAttribute('data-ybs-drag', 'settle')
    scrollToDetent(close ? 'closed' : p.base)
  }

  // ---- detached drag: the header pulled down while the content is scrolled ----
  // In the single scroller, dragging the sticky header down would scroll the content back to its top first.
  // Native sheets move the whole sheet instead and keep the content where it is. So, only while the content is
  // scrolled (the header then has touch-action: none), any pointer on [data-ybs-drag] moves the scroller with a
  // transform, and on release the sheet either springs back to full or goes to the projected detent.
  let detached = false
  let dropAnim = 0
  /** Ends a running header drag without a release (a new press arrived first, or destroy). */
  let endDrag: (() => void) | null = null
  function detachedDrag(e: PointerEvent, handle: HTMLElement) {
    // No preventDefault/capture yet: a tap (a button or field in the header) must still work.
    stopGlide()
    unlock()
    cancelAnimationFrame(dropAnim)
    const st0 = scroller.scrollTop
    const y0 = e.clientY
    const samples = [{ t: e.timeStamp, y: e.clientY }]
    let drop = 0
    let started = false
    touching = true
    programmatic = false
    anchor = null
    dbg(`detached drag start @${Math.round(st0)}`)

    const setDrop = (d: number) => {
      drop = d
      scroller.style.transform = d > 0 ? `translate3d(0, ${d}px, 0)` : ''
      paint(st0, d)
    }
    const id = e.pointerId
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      const dy = ev.clientY - y0
      if (!started && Math.abs(dy) < 4) return
      started = true
      detached = true
      markDragged()
      if (handle.isConnected) handle.setPointerCapture(ev.pointerId)
      root.setAttribute('data-ybs-drag', 'active')
      if (scroller.scrollTop !== st0) scroller.scrollTop = st0 // keep the content where it is
      setDrop(Math.max(dy, 0))
      samples.push({ t: ev.timeStamp, y: ev.clientY })
      while (samples.length > 2 && ev.timeStamp - samples[0]!.t > VELOCITY_WINDOW_MS) samples.shift()
    }
    // On the window, not the handle: until the drag captures the pointer (after 4px), a mouse that leaves the
    // header before its first move would release elsewhere, and a missed release leaves `touching` set for good.
    const stop = () => {
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      endDrag = null
      touching = false
      root.removeAttribute('data-ybs-drag')
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      stop()
      if (!started) return
      const a = samples[0]!
      const b = samples[samples.length - 1]!
      const dt = b.t - a.t
      const down = dt > 0 && ev.timeStamp - b.t < 50 ? ((b.y - a.y) / dt) * 1000 : 0 // px/s, positive = down
      const to = nearestStop(project(full - drop, -down), stops).detent
      dbg(`detached drag release drop=${Math.round(drop)} v=${Math.round(down)} -> ${String(to)}`)
      const end = to === 'full' ? 0 : full - pos(to)
      animateDrop(drop, end, setDrop, () => {
        scroller.style.transform = ''
        detached = false
        if (closing) return scrollToDetent('closed') // close() ran during the drag
        if (to === 'full') {
          paint(scroller.scrollTop)
          return
        }
        // Hand back to the scroller in the same frame: the transform goes, scrollTop lands on the detent. The
        // content returns to its top (invisible when closing; a partial detent shows the top of the content).
        target = to
        programmatic = true
        scroller.scrollTop = pos(to)
        paint(scroller.scrollTop)
        if (to === 'closed' || belowFloor(scroller.scrollTop)) settleAtClosed()
        else requestAnimationFrame(onScrollEnd)
      })
    }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    endDrag = () => {
      stop()
      if (!started) return
      scroller.style.transform = ''
      detached = false
      paint(scroller.scrollTop)
    }
  }
  function animateDrop(from: number, to: number, set: (d: number) => void, done: () => void) {
    const ms = reducedMotion() ? 0 : Math.min(380, 180 + Math.abs(to - from) * 0.4)
    const t0 = performance.now()
    const step = () => {
      if (destroyed) return
      const k = ms === 0 ? 1 : Math.min((performance.now() - t0) / ms, 1)
      const eased = 1 - (1 - k) ** 3
      set(from + (to - from) * eased)
      if (k < 1) dropAnim = requestAnimationFrame(step)
      else done()
    }
    dropAnim = requestAnimationFrame(step)
  }

  // Mouse drag on [data-ybs-drag]. Touch uses native scroll, except for the detached drag above.
  function onPointerDown(e: PointerEvent) {
    cancelPull()
    if (e.button !== 0 || !isOpen || detached || closing) return
    const el = e.target as Element | null
    const handle = el?.closest<HTMLElement>('[data-ybs-drag]')
    if (!handle) return
    if (scroller.scrollTop > full + 1) return detachedDrag(e, handle)
    if (el?.closest('input, textarea, select, button, a, [contenteditable]')) return
    if (e.pointerType !== 'mouse') return
    e.preventDefault()
    ;(handle as HTMLElement).setPointerCapture(e.pointerId)
    stopGlide()
    unlock()

    const startTop = scroller.scrollTop
    const y0 = e.clientY
    const maxTop = scroller.scrollHeight - scroller.clientHeight
    const samples = [{ t: e.timeStamp, y: e.clientY }]
    root.setAttribute('data-ybs-drag', 'active')
    touching = true
    programmatic = false
    anchor = null

    const stop = () => {
      handle.removeEventListener('pointermove', move as EventListener)
      handle.removeEventListener('pointerup', up as EventListener)
      handle.removeEventListener('pointercancel', up as EventListener)
      handle.removeEventListener('lostpointercapture', up as EventListener)
      endDrag = null
      touching = false
    }
    const move = (ev: PointerEvent) => {
      scroller.scrollTop = Math.min(Math.max(startTop - (ev.clientY - y0), 0), maxTop)
      samples.push({ t: ev.timeStamp, y: ev.clientY })
      while (samples.length > 2 && ev.timeStamp - samples[0]!.t > VELOCITY_WINDOW_MS) samples.shift()
    }
    // lostpointercapture: the header re-rendered away mid-drag (no pointerup reaches it then).
    const up = (ev: PointerEvent) => {
      stop()
      const top = scroller.scrollTop
      if (closing) return scrollToDetent('closed')
      if (Math.abs(ev.clientY - y0) < 3 || top > full + 1) {
        root.removeAttribute('data-ybs-drag')
        return
      }
      const a = samples[0]!
      const b = samples[samples.length - 1]!
      const dt = b.t - a.t
      const v = dt > 0 && ev.timeStamp - b.t < 50 ? (-(b.y - a.y) / dt) * 1000 : 0
      root.setAttribute('data-ybs-drag', 'settle')
      scrollToDetent(nearestStop(project(top, v), stops).detent)
    }
    handle.addEventListener('pointermove', move as EventListener)
    handle.addEventListener('pointerup', up as EventListener)
    handle.addEventListener('pointercancel', up as EventListener)
    handle.addEventListener('lostpointercapture', up as EventListener)
    endDrag = () => {
      stop()
      root.removeAttribute('data-ybs-drag')
    }
  }

  // ---- keys: scrolling by keyboard never closes the sheet ----
  // With focus in the sheet, ArrowUp/PageUp/Home scroll the scroller up, which at or below full moves the sheet down
  // and can snap it to closed. Native sheets don't close from keys (that's Escape), so stop them there; the content
  // above full still scrolls with keys.
  const KEYS_UP = new Set(['ArrowUp', 'PageUp', 'Home'])
  function onKeyDown(e: KeyboardEvent) {
    const up = KEYS_UP.has(e.key) || (e.key === ' ' && e.shiftKey)
    if (!up || e.defaultPrevented || scroller.scrollTop > full + 1) return
    const el = e.target as Element | null
    if (el?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return
    if (e.key === ' ' && el?.closest('button, a, [role="button"]')) return
    e.preventDefault()
  }

  // ---- visual viewport / keyboard ----
  function syncViewport() {
    const vv = window.visualViewport
    if (!vv || !isOpen) return
    root.style.setProperty('--ybs-vv-top', `${vv.offsetTop}px`)
    root.style.setProperty('--ybs-vv-h', `${vv.height}px`)
    // iOS scrolls the document to reveal a focused input even with
    // html{overflow:hidden}. Undo it so the page behind doesn't jump.
    if (modal && Math.abs(window.scrollY - pageY) > 0.5) window.scrollTo(0, pageY)
    // vv.height * scale: pinch-zoom shrinks vv.height too, but not what it covers in layout pixels.
    const kb = window.innerHeight - vv.height * vv.scale > KEYBOARD_THRESHOLD
    if (kb !== keyboard) {
      keyboard = kb
      root.toggleAttribute('data-ybs-keyboard', kb)
      // Native: the sheet goes to its largest detent while the keyboard is up.
      // Only when the sheet is below full: with the content scrolled, the focused field is in the content already.
      if (kb && !closing && (options.isActive?.() ?? true) && scroller.scrollTop < full - 1 && target !== 'full') {
        requestAnimationFrame(() => {
          if (destroyed || !isOpen || closing) return
          layout()
          if (scroller.scrollTop < full - 1) scrollToDetent('full')
        })
      }
    }
  }
  function onWindowScroll() {
    if (isOpen) syncViewport()
  }

  // ---- resize ----
  const ro = new ResizeObserver(() => {
    if (!isOpen) return
    const wasEmpty = full < 1
    layout()
    // The content got its height after opening (see onScrollEnd): now open.
    if (wasEmpty && full >= 1 && programmatic && target != null && !gliding) return glide()
    dbg(`resize H=${H} full=${full}`)
    // Browsers don't reliably re-snap when snap positions move (URL bar,
    // keyboard, content change). Re-target ourselves.
    if (touching) return
    // Momentum still running (a fling, or content scrolling): `current` is where it last rested, not where it
    // is. Pinning to it would yank the sheet back mid-fling; scrollend settles it instead.
    if (!programmatic && performance.now() - lastUserScroll < USER_SCROLL_QUIET) return
    const d = programmatic ? target : current
    if (d == null) return
    if (gliding) return // the glide aims at the target's current position every frame
    scroller.scrollTop = pos(d)
    // Paint now, not on the scroll event a frame later: a footer that grew a line (a 'header+footer' peek) would sit
    // off the header for that frame.
    if (!detached) paint(scroller.scrollTop)
  })

  function finishClose() {
    dbg('finishClose')
    isOpen = false
    current = null
    emitted = null
    closing = false
    releaseHtml()
    options.onClosed?.()
  }

  // ---- wire up ----
  const passive = { passive: true } as const
  scroller.addEventListener('scroll', onScroll, passive)
  scroller.addEventListener('scrollend', onScrollEnd)
  scroller.addEventListener('touchstart', onTouchStart, passive)
  scroller.addEventListener('pointerdown', onPressStart, true)
  for (const t of INPUT_EVENTS) scroller.addEventListener(t, onInput, { capture: true, passive: true })
  scroller.addEventListener('pointermove', onPressMove, true)
  scroller.addEventListener('pointerup', onPressEnd, true)
  scroller.addEventListener('pointercancel', onPressCancel, true)
  scroller.addEventListener('click', onClickCapture, true)
  scroller.addEventListener('touchend', onTouchEnd, passive)
  scroller.addEventListener('touchcancel', onTouchEnd, passive)
  scroller.addEventListener('wheel', onWheel, { passive: false })
  scroller.addEventListener('keydown', onKeyDown)
  sheet.addEventListener('pointerdown', onPointerDown)
  window.visualViewport?.addEventListener('resize', syncViewport)
  window.visualViewport?.addEventListener('scroll', syncViewport)
  window.addEventListener('scroll', onWindowScroll, passive)
  ro.observe(scroller)
  ro.observe(sheet)

  return {
    get detent() {
      return current
    },
    open(detent) {
      if (detent === 'closed') detent = undefined
      if (isOpen) {
        // already open (e.g. re-opened during the close animation)
        if (closing) {
          closing = false
          layout()
        }
        scrollToDetent(detent ?? floor())
        return
      }
      isOpen = true
      closing = false
      pageY = window.scrollY
      keyboard = false
      if (modal && !htmlLocked) {
        lockHtml()
        htmlLocked = true
      }
      syncViewport()
      layout()
      scroller.scrollTop = 0
      // Set the target synchronously: a stray scrollend at 0 before the open
      // animation starts (seen under React StrictMode) must not read as "closed".
      target = resolve(detent ?? floor()).detent
      programmatic = true
      // Start right away (the glide's first frame paints the sheet at closed, then it moves). The old two-frame
      // wait was for Chrome dropping a smooth scrollTo on a new scroller; the glide sets scrollTop directly.
      scrollToDetent(target)
    },
    snapTo(detent) {
      if (isOpen && !closing) scrollToDetent(detent)
    },
    close() {
      if (!isOpen) return
      if (!closing) {
        closing = true
        if (!dismissible) layout()
      }
      if (scroller.scrollTop <= CLOSED_TOLERANCE) finishClose()
      else scrollToDetent('closed')
    },
    collapse() {
      if (isOpen && !closing) scrollToDetent(floor())
    },
    setDetents(next) {
      requested = [...next]
      if (!isOpen) return
      layout()
      // The detent it rests at is gone: move to the nearest one that's left.
      if (!closing && current != null && !stops.some((s) => s.detent === current)) scrollToDetent(current)
    },
    setDismissible(next) {
      dismissible = next
      if (isOpen) layout()
    },
    destroy() {
      destroyed = true
      isOpen = false
      cancelPull()
      endDrag?.()
      releaseHtml()
      clearTimeout(unlockTimer)
      clearTimeout(scrollEndTimer)
      stopGlide()
      cancelAnimationFrame(dropAnim)
      scroller.style.transform = ''
      ro.disconnect()
      scroller.removeEventListener('scroll', onScroll)
      scroller.removeEventListener('scrollend', onScrollEnd)
      scroller.removeEventListener('touchstart', onTouchStart)
      scroller.removeEventListener('pointerdown', onPressStart, true)
      for (const t of INPUT_EVENTS) scroller.removeEventListener(t, onInput, true)
      scroller.removeEventListener('pointermove', onPressMove, true)
      scroller.removeEventListener('pointerup', onPressEnd, true)
      scroller.removeEventListener('pointercancel', onPressCancel, true)
      scroller.removeEventListener('click', onClickCapture, true)
      scroller.removeEventListener('touchend', onTouchEnd)
      scroller.removeEventListener('touchcancel', onTouchEnd)
      scroller.removeEventListener('wheel', onWheel)
      scroller.removeEventListener('keydown', onKeyDown)
      sheet.removeEventListener('pointerdown', onPointerDown)
      window.visualViewport?.removeEventListener('resize', syncViewport)
      window.visualViewport?.removeEventListener('scroll', syncViewport)
      window.removeEventListener('scroll', onWindowScroll)
      closedMarker.remove()
      probe.remove()
      for (const m of markers.values()) m.remove()
      markers.clear()
    },
  }
}
