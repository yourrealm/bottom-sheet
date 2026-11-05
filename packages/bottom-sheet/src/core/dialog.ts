import type { Detent } from './math'
import { easeAccelerate, easeDecelerate } from './math'
import { softEdge } from './soft-edge'
import { lockHtml, unlockHtml, type SheetController, type SheetControllerOptions, type SheetElements } from './controller'

/**
 * Dialog presentation (`dialog` on Root, wide screens with a mouse): the same parts shown as a centred dialog.
 *
 * None of the sheet's scroll machinery applies: there is no travel, so no snapping, detents, momentum guard, wheel
 * stepping or drags. The scroller is a plain overlay (`[data-ybs-dialog]` in styles.css) and the sheet scrolls its
 * own content (a second scroller is fine here: the one-scroller design exists for touch handoff, which a mouse and
 * wheel don't need).
 *
 * Open and close animate `--ybs-progress` 0 -> 1 per frame (the backdrop already follows it, and the stack reads it
 * for the sheet below), and styles map it to a fade and a slight scale. Reversible mid-way, instant with reduced motion.
 */
const OPEN_MS = 220
const CLOSE_MS = 160

export function createDialogController(els: SheetElements, options: SheetControllerOptions): SheetController {
  const { root, scroller, sheet } = els
  const dbg = (m: string) => options.debug?.(m)
  const modal = options.modal ?? true

  let isOpen = false
  let closing = false
  let destroyed = false
  let htmlLocked = false
  let progress = 0
  let raf = 0

  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

  function paint(p: number) {
    progress = p
    root.style.setProperty('--ybs-progress', String(p))
    // Only while not fully shown: the fade and scale (styles.css) leave no transform on a dialog at rest, which would
    // make it the containing block of position: fixed popups inside it.
    root.toggleAttribute('data-ybs-fade', p < 1)
    // cover 0: a dialog never recedes the page behind it (that is a sheet covering the screen).
    options.onProgress?.(p, 0)
  }

  function animate(to: 0 | 1, done: () => void) {
    cancelAnimationFrame(raf)
    const from = progress
    // Scaled by the distance left, so a reversal half-way takes half the time.
    const ms = reducedMotion() ? 0 : (to === 1 ? OPEN_MS : CLOSE_MS) * Math.abs(to - from)
    const ease = to === 1 ? easeDecelerate : easeAccelerate
    if (ms === 0) {
      root.removeAttribute('data-ybs-glide') // a cancelled animation's
      paint(to)
      done()
      return
    }
    root.setAttribute('data-ybs-glide', '')
    let t0: number | null = null
    const step = (now: number) => {
      if (destroyed) return
      t0 ??= now
      const k = Math.min((now - t0) / ms, 1)
      paint(from + (to - from) * ease(k))
      if (k < 1) raf = requestAnimationFrame(step)
      else {
        root.removeAttribute('data-ybs-glide')
        done()
      }
    }
    raf = requestAnimationFrame(step)
  }

  // ---- lines: header divider while content is scrolled under it, footer line while more is below ----
  let scrolled = false
  let more = false
  /** The sheet's layout size (no transform) for a shadow layer behind it (/styled's dialog shadow). */
  function syncBox() {
    root.style.setProperty('--ybs-dialog-box-w', `${sheet.offsetWidth}px`)
    root.style.setProperty('--ybs-dialog-box-h', `${sheet.offsetHeight}px`)
  }

  function syncLines() {
    softEdge(root, sheet, sheet.getBoundingClientRect().bottom)
    const s = sheet.scrollTop > 1
    if (s !== scrolled) root.toggleAttribute('data-ybs-scrolled', (scrolled = s))
    const m = sheet.scrollHeight - sheet.clientHeight - sheet.scrollTop > 2
    if (m !== more) root.toggleAttribute('data-ybs-more', (more = m))
  }

  // ---- outside press: a press that starts AND ends outside the dialog (a text selection dragged out of it doesn't count) ----
  let pressOutside: number | null = null
  const isOutside = (t: EventTarget | null) => t instanceof Element && !t.closest('[data-ybs-sheet]')
  function onPointerDown(e: PointerEvent) {
    pressOutside = e.button === 0 && isOutside(e.target) ? e.pointerId : null
  }
  function onPointerUp(e: PointerEvent) {
    const p = pressOutside
    pressOutside = null
    if (p === e.pointerId && isOutside(e.target) && isOpen && !closing) options.onOutsideTap?.()
  }

  // ---- visual viewport: the overlay follows it (keyboard, pinch zoom), like the sheet ----
  let pageY = 0
  function syncViewport() {
    const vv = window.visualViewport
    if (!vv || !isOpen) return
    root.style.setProperty('--ybs-vv-top', `${vv.offsetTop}px`)
    root.style.setProperty('--ybs-vv-h', `${vv.height}px`)
    // Not while closing: the page is the app's again (a link in the dialog may have navigated and scrolled it).
    if (modal && !closing && Math.abs(window.scrollY - pageY) > 0.5) window.scrollTo(0, pageY)
  }
  const onWindowScroll = () => syncViewport()

  // The sheet's own box stops changing once it reaches its max-height, so watch its parts too (content growing or
  // shrinking inside a full-height dialog changes whether there is more below), and parts added later.
  const ro = new ResizeObserver(() => {
    if (!isOpen) return
    syncBox()
    syncLines()
  })
  const observeParts = () => {
    for (const el of Array.from(sheet.children)) ro.observe(el)
  }
  const mo = new MutationObserver(observeParts)
  function finishClose() {
    dbg('dialog closed')
    isOpen = false
    closing = false
    if (htmlLocked) unlockHtml()
    htmlLocked = false
    options.onClosed?.()
  }

  sheet.addEventListener('scroll', syncLines, { passive: true })
  scroller.addEventListener('pointerdown', onPointerDown, true)
  scroller.addEventListener('pointerup', onPointerUp, true)
  window.visualViewport?.addEventListener('resize', syncViewport)
  window.visualViewport?.addEventListener('scroll', syncViewport)
  window.addEventListener('scroll', onWindowScroll, { passive: true })
  ro.observe(sheet)
  observeParts()
  mo.observe(sheet, { childList: true })

  return {
    get detent(): Detent | null {
      return isOpen && !closing && progress === 1 ? 'full' : null
    },
    open() {
      closing = false
      if (!isOpen) {
        isOpen = true
        pageY = window.scrollY
        if (modal && !htmlLocked) {
          lockHtml()
          htmlLocked = true
        }
        syncViewport()
        paint(0)
        syncBox()
        syncLines()
      }
      dbg('dialog open')
      // onDetentChange is not called: a dialog has no detents, and reporting 'full' would leak into the sheet
      // presentation of an app that keeps `detent` in state.
      animate(1, () => dbg('dialog shown'))
    },
    snapTo() {},
    collapse() {},
    setDetents() {},
    setDismissible() {},
    close() {
      if (!isOpen || closing) return
      closing = true
      dbg('dialog close')
      animate(0, () => {
        if (closing) finishClose()
      })
    },
    destroy() {
      destroyed = true
      isOpen = false
      cancelAnimationFrame(raf)
      if (htmlLocked) unlockHtml()
      htmlLocked = false
      ro.disconnect()
      mo.disconnect()
      root.removeAttribute('data-ybs-glide')
      sheet.removeEventListener('scroll', syncLines)
      scroller.removeEventListener('pointerdown', onPointerDown, true)
      scroller.removeEventListener('pointerup', onPointerUp, true)
      window.visualViewport?.removeEventListener('resize', syncViewport)
      window.visualViewport?.removeEventListener('scroll', syncViewport)
      window.removeEventListener('scroll', onWindowScroll)
    },
  }
}
