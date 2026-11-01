import {
  type ComponentPropsWithRef,
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { createSheetController, type SheetController } from '../core/controller'
import type { Detent } from '../core/math'
import { structuralCss } from '../core/styles'
import { closedByEscape, closeWatcher, isTopSheet, pushSheet, removeSheet, reportProgress, type StackEntry } from './stack'
import { useStyle } from './use-style'

/** Why the sheet is asking to open or close. */
export type OpenChangeReason = 'trigger' | 'close-button' | 'escape' | 'back' | 'outside-press' | 'swipe'

export interface OpenChangeDetails {
  reason: OpenChangeReason
}

interface SheetContextValue {
  open: boolean
  mounted: boolean
  setOpen: (open: boolean, reason: OpenChangeReason) => void
  /** Escape / outside press: closes a dismissible sheet, otherwise drops it to its lowest detent. */
  requestDismiss: (reason: OpenChangeReason) => void
  modal: boolean
  dismissible: boolean
  closeOnBack: boolean
  fullscreen: boolean
  recede: boolean
  detents: readonly Detent[]
  initialDetent: Detent | undefined
  detent: Detent | undefined
  guard: boolean
  onDetentChange: ((d: Detent) => void) | undefined
  debug: ((m: string) => void) | undefined
  onClosed: () => void
  controller: RefObject<SheetController | null>
  /** Element focused before the sheet opened; focus returns here after close. */
  returnFocus: RefObject<HTMLElement | null>
  rootEl: RefObject<HTMLDivElement | null>
  sheetEl: RefObject<HTMLElement | null>
  titleId: string
  descriptionId: string
  /** A <Description> is mounted (aria-describedby must not point at a missing element). */
  hasDescription: boolean
  setHasDescription: (has: boolean) => void
}

const SheetContext = createContext<SheetContextValue | null>(null)

function useSheet(part: string) {
  const ctx = useContext(SheetContext)
  if (!ctx) throw new Error(`<Sheet.${part}> must be used inside <Sheet.Root>`)
  return ctx
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node)
      else if (ref) (ref as React.RefObject<T | null>).current = node
    }
  }
}

// ---------------------------------------------------------------------------

export interface RootProps {
  children?: ReactNode
  open?: boolean
  defaultOpen?: boolean
  /** Called when the user opens or closes the sheet (not when the `open` prop changes). */
  onOpenChange?: (open: boolean, details: OpenChangeDetails) => void
  /**
   * Partial detents; `full` is always included. Default `[]`: the sheet opens straight to full (fit to short content).
   * Each is a fraction of the available height (0.5) or a CSS length of visible sheet ('76px', '40dvh').
   */
  detents?: readonly Detent[]
  /**
   * Modal (default): a backdrop, the rest of the page inert, page scroll locked, focus moved into the sheet.
   * Non-modal: the page stays visible and usable around the sheet; taps outside it go to the page.
   */
  modal?: boolean
  /**
   * Whether a swipe down, Escape or an outside press can close the sheet (default true). When false they drop it
   * to its lowest detent instead; `open={false}` and `<Sheet.Close>` still close it.
   */
  dismissible?: boolean
  /**
   * Android back closes the sheet (the top one when stacked), like a native sheet; on a sheet that isn't
   * dismissible it drops to the lowest detent. Default: true for modal sheets, false for non-modal ones.
   * Uses `CloseWatcher` (Chrome, Firefox), so no history entries are added and URLs are never touched.
   * Browsers without it (Safari) ignore this. The browser may let back navigate instead when the page
   * hasn't been interacted with since the sheet opened (its anti-trap rule).
   */
  closeOnBack?: boolean
  /**
   * The full detent reaches the very top of the screen (no gap above the sheet). Sets `data-ybs-fullscreen` on the
   * root; `/styled` then squares off the corners as the sheet arrives at the top and pads the header by the top
   * safe area. Headless: pad your header with `env(safe-area-inset-top)` yourself.
   */
  fullscreen?: boolean
  /**
   * The page behind recedes while this modal sheet is open, like iOS. Mark your app's wrapper with
   * `data-ybs-background`; `/styled` scales it back and rounds its top corners. Headless: style
   * `html[data-ybs-recede] [data-ybs-background]` with `--ybs-recede` (0..1) and `--ybs-scroll-y`.
   * While receding, `position: fixed` elements inside the wrapper are positioned against it.
   */
  recede?: boolean
  /** Detent to open at. Default: the smallest usable partial detent, else `full`. */
  initialDetent?: Detent
  /** Controlled resting detent. Changing it moves the sheet. */
  detent?: Detent
  onDetentChange?: (detent: Detent) => void
  /** Stop momentum at the full line, as native does. Default true. */
  guard?: boolean
  /** Receives the controller's internal decision log (for device testing). */
  debug?: (message: string) => void
}

/** Full only, like iOS (`[.large()]`), Base UI and Vaul. Partial detents are opt-in. */
const DEFAULT_DETENTS: readonly Detent[] = []

export function Root(props: RootProps) {
  const {
    children,
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    detents = DEFAULT_DETENTS,
    initialDetent,
    detent,
    onDetentChange,
    guard = true,
    modal = true,
    dismissible = true,
    closeOnBack = modal,
    fullscreen = false,
    recede = false,
    debug,
  } = props
  const [openState, setOpenState] = useState(defaultOpen)
  const open = openProp ?? openState
  const [mounted, setMounted] = useState(open)
  const controller = useRef<SheetController | null>(null)
  const rootEl = useRef<HTMLDivElement | null>(null)
  const sheetEl = useRef<HTMLElement | null>(null)
  const id = useId()
  const [hasDescription, setHasDescription] = useState(false)

  const setOpen = useCallback(
    (next: boolean, reason: OpenChangeReason) => {
      if (openProp === undefined) setOpenState(next)
      onOpenChange?.(next, { reason })
    },
    [openProp, onOpenChange],
  )
  const requestDismiss = useCallback(
    (reason: OpenChangeReason) => {
      if (dismissible) setOpen(false, reason)
      else controller.current?.collapse()
    },
    [dismissible, setOpen],
  )

  // Open -> mount; close -> animate out via the controller, unmount when closed.
  // Re-opening while the close animation runs reverses it.
  const closing = useRef(false)
  const debugRef = useRef(debug)
  debugRef.current = debug
  const returnFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open && !mounted) {
      returnFocus.current = modal ? (document.activeElement as HTMLElement | null) : null
      setMounted(true)
    }
    if (open && mounted && closing.current) {
      closing.current = false
      controller.current?.open(initialDetent)
    }
    if (!open && mounted) {
      closing.current = true
      if (controller.current) controller.current.close()
      else setMounted(false)
    }
  }, [open, mounted, initialDetent, modal])

  const onClosed = useCallback(() => {
    debugRef.current?.(`onClosed (open=${open}, mounted=${mounted})`)
    closing.current = false
    setMounted(false)
    if (open) setOpen(false, 'swipe') // closed by a gesture
  }, [open, mounted, setOpen])

  const value = useMemo<SheetContextValue>(
    () => ({
      open,
      mounted,
      setOpen,
      requestDismiss,
      modal,
      dismissible,
      closeOnBack,
      fullscreen,
      recede,
      detents,
      initialDetent,
      detent,
      guard,
      onDetentChange,
      debug,
      onClosed,
      controller,
      returnFocus,
      rootEl,
      sheetEl,
      titleId: `${id}-title`,
      descriptionId: `${id}-description`,
      hasDescription,
      setHasDescription,
    }),
    [open, mounted, setOpen, requestDismiss, modal, dismissible, closeOnBack, fullscreen, recede, detents, initialDetent, detent, guard, onDetentChange, debug, onClosed, id, hasDescription],
  )

  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>
}

// ---------------------------------------------------------------------------

export function Trigger(props: ComponentPropsWithRef<'button'>) {
  const ctx = useSheet('Trigger')
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={ctx.open}
      {...props}
      onClick={(e) => {
        props.onClick?.(e)
        if (!e.defaultPrevented) ctx.setOpen(true, 'trigger')
      }}
    />
  )
}

export function Close(props: ComponentPropsWithRef<'button'>) {
  const ctx = useSheet('Close')
  return (
    <button
      type="button"
      {...props}
      onClick={(e) => {
        props.onClick?.(e)
        if (!e.defaultPrevented) ctx.setOpen(false, 'close-button')
      }}
    />
  )
}

// ---------------------------------------------------------------------------

export interface PortalProps {
  children?: ReactNode
  /** Where to render. Default document.body. */
  container?: HTMLElement | null
}

/** Fixed layer. Mounted while open or animating closed. A modal sheet makes the rest of the page inert. */
export function Portal({ children, container }: PortalProps) {
  const ctx = useSheet('Portal')
  useStyle('core', structuralCss)

  // Modal: everything outside the sheet is inert, so focus can't leave and screen readers see only the
  // dialog. Non-modal sheets skip that but still join the stack (Escape order, stacked sheets on top).
  const dismissRef = useRef(ctx.requestDismiss)
  dismissRef.current = ctx.requestDismiss
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const entryRef = useRef<StackEntry | null>(null)
  useEffect(() => {
    const root = ctx.rootEl.current
    if (!ctx.mounted || !root) return
    const parent = root.parentElement
    if (!parent) return
    // Stack: Escape goes to the top sheet only; the sheet below can recede.
    const entry: StackEntry = { root, close: () => dismissRef.current('escape'), recede: ctx.recede && ctx.modal }
    entryRef.current = entry
    pushSheet(entry)
    return () => {
      removeSheet(entry)
      entryRef.current = null
    }
  }, [ctx.mounted, ctx.rootEl, ctx.modal, ctx.recede])

  // The page is inert only while the sheet is open, not while it animates closed: as soon as it starts
  // closing, the page (or the sheet below) takes input and focus again, like a native dialog. Otherwise
  // focus can't return, and a key pressed during the close animation still lands in the sheet.
  const blocking = ctx.mounted && ctx.open && ctx.modal
  useEffect(() => {
    const root = ctx.rootEl.current
    const parent = root?.parentElement
    if (!blocking || !root || !parent) return
    const touched: Element[] = []
    for (const el of Array.from(parent.children)) {
      if (el === root || el.hasAttribute('inert') || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue
      el.setAttribute('inert', '')
      touched.push(el)
    }
    const dbg = (m: string) => ctxRef.current.debug?.(m)
    dbg(`portal mount: inert ${touched.length} siblings, ${parent.querySelectorAll(':scope > [data-ybs-root][inert]').length} sheet roots inert`)
    return () => {
      for (const el of touched) el.removeAttribute('inert')
      dbg(`portal unmount: restored ${touched.length}, still-inert sheet roots ${parent.querySelectorAll(':scope > [data-ybs-root][inert]').length}`)
      // Restore focus only after lifting inert: while the page is inert, focus() is a no-op.
      const back = ctx.returnFocus.current
      ctx.returnFocus.current = null
      if (back?.isConnected) back.focus({ preventScroll: true })
    }
  }, [blocking, ctx.rootEl, ctx.returnFocus])

  // A sheet animating closed still catches taps on its own layer (it is not made inert): a touch tap closes it on
  // pointerup, before the browser's click, and that click must land on this overlay (which ignores it), not fall
  // through to whatever is underneath, e.g. a row in the sheet below (reported 2026-11-01). Keyboard focus is
  // already back on the page (see `blocking` above), and the close takes ~280ms.

  // Android back: one CloseWatcher per open sheet. The browser sends back (and Escape) to the newest one,
  // which is the top sheet. It's dropped as soon as the sheet starts closing, so a back press during the
  // close animation goes to the sheet below. A watcher fires once; `rearm` makes a new one when the sheet
  // stays open (not dismissible, or the app kept it open).
  const [rearm, setRearm] = useState(0)
  const listenForBack = ctx.mounted && ctx.open && ctx.closeOnBack
  useEffect(() => {
    if (entryRef.current) entryRef.current.closing = !ctx.open
  }, [ctx.open, ctx.mounted])
  useEffect(() => {
    const Watcher = closeWatcher()
    const entry = entryRef.current
    if (!listenForBack || !Watcher || !entry) return
    const watcher = new Watcher()
    watcher.onclose = () => {
      entry.watcher = null
      ctxRef.current.debug?.(`close watcher: ${closedByEscape() ? 'escape' : 'back'}`)
      dismissRef.current(closedByEscape() ? 'escape' : 'back')
      setRearm((n) => n + 1)
    }
    entry.watcher = watcher
    return () => {
      if (entry.watcher === watcher) entry.watcher = null
      watcher.destroy()
    }
  }, [listenForBack, rearm, ctx.modal]) // modal: the stack entry is rebuilt

  if (!ctx.mounted || typeof document === 'undefined') return null
  return createPortal(
    <div
      data-ybs-root=""
      data-ybs-modeless={ctx.modal ? undefined : ''}
      data-ybs-fullscreen={ctx.fullscreen ? '' : undefined}
      ref={ctx.rootEl}
    >
      {children}
    </div>,
    container ?? document.body,
  )
}

// ---------------------------------------------------------------------------

export function Backdrop(props: ComponentPropsWithRef<'div'>) {
  const ctx = useSheet('Backdrop')
  return (
    <div
      data-ybs-backdrop=""
      aria-hidden="true"
      {...props}
      onClick={(e) => {
        props.onClick?.(e)
        if (!e.defaultPrevented) ctx.requestDismiss('outside-press')
      }}
    />
  )
}

// ---------------------------------------------------------------------------

export interface ViewProps {
  children?: ReactNode
  className?: string
  /** className for the bleed layer (sheet colour under the visual viewport). */
  bleedClassName?: string
}

/** The single native scroller: spacer (closed area), detent markers, and the sheet (Sheet.Content). */
export function View({ children, className, bleedClassName }: ViewProps) {
  const ctx = useSheet('View')
  const scroller = useRef<HTMLDivElement>(null)
  const markers = useRef<HTMLDivElement>(null)
  // Latest callbacks without recreating the controller.
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  useLayoutEffect(() => {
    // Ancestor refs are attached AFTER descendant layout effects run, so read the
    // portal root from the DOM rather than ctx.rootEl.
    const root = scroller.current?.closest<HTMLElement>('[data-ybs-root]') ?? null
    const sheet = ctx.sheetEl.current
    if (!root || !scroller.current || !markers.current || !sheet) {
      throw new Error('<Sheet.View> needs <Sheet.Content> inside it, inside <Sheet.Portal>')
    }
    const c = createSheetController(
      { root, scroller: scroller.current, markers: markers.current, sheet },
      {
        detents: ctx.detents,
        guard: ctx.guard,
        modal: ctx.modal,
        dismissible: ctx.dismissible,
        onDetentChange: (d) => ctxRef.current.onDetentChange?.(d),
        onClosed: () => ctxRef.current.onClosed(),
        onProgress: (p, cover) => reportProgress(root, p, cover),
        // Above the sheet (the spacer), or beside it when it is narrower than the screen (max-width on desktop).
        onOutsideTap: () => ctxRef.current.requestDismiss('outside-press'),
        isActive: () => isTopSheet(root),
        debug: (m) => ctxRef.current.debug?.(m),
      },
    )
    ctx.controller.current = c
    c.open(ctx.detent ?? ctx.initialDetent)
    // A non-modal sheet doesn't take focus from the page (move it yourself if it should).
    if (ctx.modal) sheet.focus({ preventScroll: true })
    return () => {
      c.destroy()
      ctx.controller.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once per mount
  }, [])

  useEffect(() => {
    ctx.controller.current?.setDetents(ctx.detents)
  }, [ctx.detents, ctx.controller])

  useEffect(() => {
    ctx.controller.current?.setDismissible(ctx.dismissible)
  }, [ctx.dismissible, ctx.controller])

  useEffect(() => {
    const c = ctx.controller.current
    if (c && ctx.detent !== undefined && ctx.open && c.detent !== ctx.detent) c.snapTo(ctx.detent)
  }, [ctx.detent, ctx.open, ctx.controller])

  return (
    <>
      <div data-ybs-bleed="" aria-hidden="true" className={bleedClassName} />
      <div
        data-ybs-scroller=""
        ref={scroller}
        className={className}
        // Taps outside the sheet, and which presses may click, are decided in the controller (one place).
      >
        <div data-ybs-track="">
          <div data-ybs-spacer="" aria-hidden="true" />
          <div data-ybs-markers="" ref={markers} />
          {children}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

export function Content({ ref, ...props }: ComponentPropsWithRef<'section'>) {
  const ctx = useSheet('Content')
  return (
    <section
      data-ybs-sheet=""
      role="dialog"
      aria-modal={ctx.modal}
      aria-labelledby={ctx.titleId}
      aria-describedby={ctx.hasDescription ? ctx.descriptionId : undefined}
      tabIndex={-1}
      {...props}
      ref={mergeRefs(ref, ctx.sheetEl)}
    />
  )
}

/** Sticky top part of the sheet. Mouse-draggable on desktop. */
export function Header(props: ComponentPropsWithRef<'div'>) {
  return <div data-ybs-header="" data-ybs-drag="" {...props} />
}

/** Visual grabber. Decorative; dragging works on the whole Header. */
export function Handle(props: ComponentPropsWithRef<'div'>) {
  return <div data-ybs-handle="" aria-hidden="true" {...props} />
}

export function Title(props: ComponentPropsWithRef<'h2'>) {
  const ctx = useSheet('Title')
  return <h2 id={ctx.titleId} {...props} />
}

export function Description(props: ComponentPropsWithRef<'p'>) {
  const ctx = useSheet('Description')
  const { setHasDescription } = ctx
  useLayoutEffect(() => {
    setHasDescription(true)
    return () => setHasDescription(false)
  }, [setHasDescription])
  return <p id={ctx.descriptionId} {...props} />
}
