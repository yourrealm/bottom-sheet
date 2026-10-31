import { type Detent, type Stop, buildStops, nearestStop, project, resolveStop, stopAt } from './math'

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
 *   - mouse-drags on [data-ybs-drag] elements,
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
  onProgress?: (progress: number) => void
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
const VELOCITY_WINDOW_MS = 80

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
  let emitted: Detent | null = null // last detent reported to onDetentChange
  let retries = 0
  let lock: number | null = null
  let unlockTimer: ReturnType<typeof setTimeout> | undefined
  let scrollEndTimer: ReturnType<typeof setTimeout> | undefined
  let lastWheel = 0
  let pageY = 0
  let keyboard = false
  let prevHtmlOverflow = ''

  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
  const behavior = (): ScrollBehavior => (reducedMotion() ? 'instant' : 'smooth')
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
    scroller.scrollTo({ top: pos(target), behavior: behavior() })
    armWatchdog()
  }

  // Chrome Android silently drops a smooth scrollTo on a scroller created in
  // the same frame (observed on page load: no scroll, no scrollend). If a
  // programmatic move hasn't started shortly after, issue it again.
  let watchdog: ReturnType<typeof setTimeout> | undefined
  function armWatchdog(attempt = 0) {
    clearTimeout(watchdog)
    const from = scroller.scrollTop
    const want = target
    watchdog = setTimeout(() => {
      if (destroyed || document.hidden || !programmatic || target !== want || want == null || touching) return
      const st = scroller.scrollTop
      if (Math.abs(st - from) < 1 && Math.abs(st - pos(want)) > 2 && attempt < MAX_RETARGETS) {
        dbg(`watchdog: move to ${String(want)} never started, re-issuing`)
        scroller.scrollTo({ top: pos(want), behavior: behavior() })
        armWatchdog(attempt + 1)
      }
    }, 150)
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
  function onScroll() {
    const st = scroller.scrollTop
    const progress = full > 0 ? Math.min(Math.max(st / full, 0), 1) : 0
    root.style.setProperty('--ybs-progress', String(progress))
    options.onProgress?.(progress)
    root.style.setProperty('--ybs-bleed', st > 4 ? '1' : '0')

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
    if (destroyed) return
    const st = scroller.scrollTop
    dbg(`scrollend @${Math.round(st)} prog=${programmatic} target=${String(target)} lock=${String(lock)}`)

    // The browser may re-snap after a layout change and hijack a programmatic
    // move (Chrome Android, keyboard resize in two steps). Re-issue it.
    if (programmatic && target != null && !touching) {
      const to = pos(target)
      if (Math.abs(st - to) > 2 && retries++ < MAX_RETARGETS) {
        scroller.scrollTo({ top: to, behavior: behavior() })
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
    if (isOpen && st <= CLOSED_TOLERANCE) {
      if (touching) dbg(`at closed, waiting for the finger to lift (st=${st.toFixed(2)})`)
      else settleAtClosed()
    }
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
      if (!touching && isOpen && !programmatic && scroller.scrollTop <= CLOSED_TOLERANCE) {
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

  // Mouse drag on [data-ybs-drag] (touch uses native scroll, never this).
  function onPointerDown(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const el = e.target as Element | null
    const handle = el?.closest('[data-ybs-drag]')
    if (!handle || el?.closest('input, textarea, select, button, a, [contenteditable]')) return
    e.preventDefault()
    ;(handle as HTMLElement).setPointerCapture(e.pointerId)
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
    const d = programmatic ? target : current
    if (d == null) return
    if (programmatic) {
      scroller.scrollTo({ top: pos(d), behavior: behavior() })
      armWatchdog()
    } else scroller.scrollTop = pos(d)
  })

  function finishClose() {
    dbg('finishClose')
    isOpen = false
    current = null
    emitted = null
    closingOnPurpose = false
    if (modal) document.documentElement.style.overflow = prevHtmlOverflow
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
      if (modal) {
        prevHtmlOverflow = document.documentElement.style.overflow
        document.documentElement.style.overflow = 'hidden'
      }
      root.setAttribute('data-ybs-open', '')
      syncViewport()
      layout()
      scroller.scrollTop = 0
      // Set the target synchronously: a stray scrollend at 0 before the open
      // animation starts (seen under React StrictMode) must not read as "closed".
      target = resolve(detent ?? defaultDetent()).detent
      programmatic = true
      // Two frames: Chrome drops a smooth scroll on a scroller that was created
      // in the previous frame (the watchdog covers anything slower).
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!destroyed && isOpen && target != null) scrollToDetent(target)
        }),
      )
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
        if (modal) document.documentElement.style.overflow = prevHtmlOverflow
      }
      clearTimeout(unlockTimer)
      clearTimeout(scrollEndTimer)
      clearTimeout(watchdog)
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
