import { type Detent, type Stop, buildStops, easeAccelerate, easeDecelerate, nearestStop, project, resolveStop, stopAt } from './math'

/**
 * Sheet controller. Framework-agnostic; React (or anything) renders the DOM,
 * this drives it. See CLAUDE.md for why it is shaped like this.
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
  /** Stop momentum at the `full` line (default true). */
  guard?: boolean
  /** Called when the sheet comes to rest at a detent. */
  onDetentChange?: (detent: Detent) => void
  /** Called once the sheet has fully closed (scrolled to 0). */
  onClosed?: () => void
  /** Progress 0 (closed) .. 1 (full), on every scroll. Used to drive stacked-sheet effects. */
  /** progress 0..1 closed -> full; cover 0..1 = share of the available height the sheet covers. */
  onProgress?: (progress: number, cover: number) => void
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
const KEYBOARD_THRESHOLD = 120
const MAX_RETARGETS = 3
/** A resize this soon after a user scroll event is mid-gesture or mid-momentum: don't re-target. */
const USER_SCROLL_QUIET = 100
const VELOCITY_WINDOW_MS = 80
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
let htmlLocks = 0
let htmlPrev = ''
function lockHtml() {
  if (htmlLocks++ === 0) {
    htmlPrev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
  }
}
function unlockHtml() {
  if (htmlLocks > 0 && --htmlLocks === 0) document.documentElement.style.overflow = htmlPrev
}

export function createSheetController(els: SheetElements, options: SheetControllerOptions): SheetController {
  const { root, scroller, sheet } = els
  const markerHost = els.markers
  const guard = options.guard ?? true
  const dbg = (m: string) => options.debug?.(m)
  const modal = options.modal ?? true
  let requested = [...options.detents]
  let dismissible = options.dismissible ?? true
  // A programmatic close() of a non-dismissible sheet still needs `closed` as a stop.
  let closingOnPurpose = false
  const closable = () => dismissible || closingOnPurpose

  // layout
  let H = 0
  let full = 0
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
    probe.style.height = d
    return probe.getBoundingClientRect().height
  }
  const resolve = (d: Detent) => resolveStop(d, rawTop(d), stops)
  const pos = (d: Detent) => resolve(d).top
  /** The lowest resting detent that isn't closed. */
  const floor = () => stops.find((s) => s.detent !== 'closed')!.detent
  /** Where open() goes by default: the smallest usable partial detent, else full. */
  const defaultDetent = () => floor()

  function makeMarker() {
    const m = document.createElement('div')
    m.setAttribute('data-ybs-marker', '')
    m.setAttribute('aria-hidden', 'true')
    return m
  }

  function layout() {
    H = scroller.clientHeight
    const sheetH = sheet.offsetHeight
    full = Math.min(H, sheetH)
    const partials = requested.filter((d) => d !== 'closed' && d !== 'full').map((d) => ({ detent: d, top: rawTop(d) }))
    stops = buildStops(partials, full, closable())
    root.style.setProperty('--ybs-h', `${H}px`)
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
      m.hidden = !stops.some((s) => s.detent === p.detent)
    }
  }

  function scrollToDetent(d: Detent) {
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
  }

  function onScroll() {
    const st = scroller.scrollTop
    if (!programmatic && lock == null) lastUserScroll = performance.now()
    if (!detached) paint(st)

    if (lock != null && !touching) {
      if (Math.abs(st - lock) > 0.5) scroller.scrollTop = lock
      armUnlock()
    } else if (guard && !touching && !programmatic && anchor != null) {
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
    if (destroyed || gliding) return // a glide settles itself when it ends
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

    const now = stopAt(st, stops)?.detent ?? null
    programmatic = false
    target = null
    current = now
    if (now != null && now !== emitted && isOpen) {
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
  function onTouchStart() {
    stopGlide()
    touching = true
    anchor = null
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
      if (!touching && isOpen && !programmatic && belowFloor(scroller.scrollTop)) {
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
    if (next !== here.detent) scrollToDetent(next)
  }

  // ---- detached drag: the header pulled down while the content is scrolled ----
  // In the single scroller, dragging the sticky header down would scroll the content back to its top first.
  // Native sheets move the whole sheet instead and keep the content where it is. So, only while the content is
  // scrolled (the header then has touch-action: none), any pointer on [data-ybs-drag] moves the scroller with a
  // transform, and on release the sheet either springs back to full or goes to the projected detent.
  let detached = false
  let dropAnim = 0
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
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - y0
      if (!started && Math.abs(dy) < 4) return
      started = true
      detached = true
      handle.setPointerCapture(ev.pointerId)
      root.setAttribute('data-ybs-drag', 'active')
      if (scroller.scrollTop !== st0) scroller.scrollTop = st0 // keep the content where it is
      setDrop(Math.max(dy, 0))
      samples.push({ t: ev.timeStamp, y: ev.clientY })
      while (samples.length > 2 && ev.timeStamp - samples[0]!.t > VELOCITY_WINDOW_MS) samples.shift()
    }
    const up = (ev: PointerEvent) => {
      handle.removeEventListener('pointermove', move as EventListener)
      handle.removeEventListener('pointerup', up as EventListener)
      handle.removeEventListener('pointercancel', up as EventListener)
      touching = false
      root.removeAttribute('data-ybs-drag')
      if (!started) return
      swallowClick()
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
    handle.addEventListener('pointermove', move as EventListener)
    handle.addEventListener('pointerup', up as EventListener)
    handle.addEventListener('pointercancel', up as EventListener)
  }
  /** A drag that started on a button must not also press it. */
  function swallowClick() {
    const stop = (ev: Event) => {
      ev.stopPropagation()
      ev.preventDefault()
    }
    window.addEventListener('click', stop, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 400)
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
    if (e.button !== 0 || !isOpen || detached) return
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

    const move = (ev: PointerEvent) => {
      scroller.scrollTop = Math.min(Math.max(startTop - (ev.clientY - y0), 0), maxTop)
      samples.push({ t: ev.timeStamp, y: ev.clientY })
      while (samples.length > 2 && ev.timeStamp - samples[0]!.t > VELOCITY_WINDOW_MS) samples.shift()
    }
    const up = (ev: PointerEvent) => {
      handle.removeEventListener('pointermove', move as EventListener)
      handle.removeEventListener('pointerup', up as EventListener)
      handle.removeEventListener('pointercancel', up as EventListener)
      touching = false
      const top = scroller.scrollTop
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
    const kb = window.innerHeight - vv.height > KEYBOARD_THRESHOLD
    if (kb !== keyboard) {
      keyboard = kb
      root.toggleAttribute('data-ybs-keyboard', kb)
      // Native: the sheet goes to its largest detent while the keyboard is up.
      if (kb && (options.isActive?.() ?? true) && current !== 'full' && target !== 'full') {
        requestAnimationFrame(() => {
          layout()
          scrollToDetent('full')
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
    layout()
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
  })

  function finishClose() {
    dbg('finishClose')
    isOpen = false
    current = null
    emitted = null
    closingOnPurpose = false
    releaseHtml()
    root.removeAttribute('data-ybs-open')
    options.onClosed?.()
  }

  // ---- wire up ----
  const passive = { passive: true } as const
  scroller.addEventListener('scroll', onScroll, passive)
  scroller.addEventListener('scrollend', onScrollEnd)
  scroller.addEventListener('touchstart', onTouchStart, passive)
  scroller.addEventListener('touchend', onTouchEnd, passive)
  scroller.addEventListener('touchcancel', onTouchEnd, passive)
  scroller.addEventListener('wheel', onWheel, { passive: false })
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
      if (isOpen) {
        // already open (e.g. re-opened during the close animation)
        if (closingOnPurpose) {
          closingOnPurpose = false
          layout()
        }
        scrollToDetent(detent ?? defaultDetent())
        return
      }
      isOpen = true
      closingOnPurpose = false
      pageY = window.scrollY
      keyboard = false
      if (modal && !htmlLocked) {
        lockHtml()
        htmlLocked = true
      }
      root.setAttribute('data-ybs-open', '')
      syncViewport()
      layout()
      scroller.scrollTop = 0
      // Set the target synchronously: a stray scrollend at 0 before the open
      // animation starts (seen under React StrictMode) must not read as "closed".
      target = resolve(detent ?? defaultDetent()).detent
      programmatic = true
      // Start right away (the glide's first frame paints the sheet at closed, then it moves). The old two-frame
      // wait was for Chrome dropping a smooth scrollTo on a new scroller; the glide sets scrollTop directly.
      scrollToDetent(target)
    },
    snapTo(detent) {
      if (isOpen) scrollToDetent(detent)
    },
    close() {
      if (!isOpen) return
      if (!closingOnPurpose && !dismissible) {
        closingOnPurpose = true
        layout()
      }
      if (scroller.scrollTop <= CLOSED_TOLERANCE) finishClose()
      else scrollToDetent('closed')
    },
    collapse() {
      if (isOpen) scrollToDetent(floor())
    },
    setDetents(next) {
      requested = [...next]
      if (isOpen) layout()
    },
    setDismissible(next) {
      dismissible = next
      if (isOpen) layout()
    },
    destroy() {
      destroyed = true
      if (isOpen) {
        isOpen = false
      }
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
      scroller.removeEventListener('touchend', onTouchEnd)
      scroller.removeEventListener('touchcancel', onTouchEnd)
      scroller.removeEventListener('wheel', onWheel)
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
