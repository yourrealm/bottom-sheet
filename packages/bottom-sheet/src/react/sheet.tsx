import {
  type ComponentPropsWithRef,
  createContext,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
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
import {
  closedByEscape,
  closeWatcher,
  holdInert,
  isTopSheet,
  pushSheet,
  releaseInert,
  removeSheet,
  reportProgress,
  type StackEntry,
  takesEscape,
  updateSheet,
} from './stack'
import { checkCss } from './css-check'

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
  onDetentChange: ((d: Detent) => void) | undefined
  debug: ((m: string) => void) | undefined
  onClosed: () => void
  controller: RefObject<SheetController | null>
  /** Element focused before the sheet opened; focus returns here after close. */
  returnFocus: RefObject<HTMLElement | null>
  rootEl: RefObject<HTMLDivElement | null>
  sheetEl: RefObject<HTMLElement | null>
  /** Set by Content from its `initialFocus` prop; read by View when the sheet opens. */
  initialFocus: RefObject<InitialFocus | undefined>
  titleId: string
  descriptionId: string
  /** A <Title> / <Description> is mounted (aria-labelledby/-describedby must not point at a missing element). */
  hasTitle: boolean
  setHasTitle: (has: boolean) => void
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
   * Non-modal: the page stays visible and usable around the sheet; taps outside it go to the page, and Escape only
   * acts while focus is inside the sheet. Read when the sheet opens: changing it while open applies on the next open.
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
  /** The sheet came to rest at a detent. Never `'closed'`: closing is `onOpenChange(false)`. */
  onDetentChange?: (detent: Detent) => void
  /** Receives the controller's internal decision log (for device testing). */
  debug?: (message: string) => void
}

/** How the sheet was opened, as Base UI reports it to `initialFocus`. */
export type InteractionType = 'mouse' | 'touch' | 'pen' | 'keyboard'
/**
 * Where focus goes when the sheet opens (Base UI's `initialFocus`). Omitted: the sheet itself for a modal sheet, no
 * move for a non-modal one. `false`: don't move it. `true`: the sheet itself. A ref: that element. A function: called
 * with how the sheet was opened; return an element, `true` for the sheet, `null` to fall back to the default, or
 * `false`/`undefined` to do nothing.
 */
export type InitialFocus =
  | boolean
  | RefObject<HTMLElement | null>
  | ((openType: InteractionType) => boolean | void | HTMLElement | null)

// The last input kind anywhere on the page: a sheet opened by a tap or programmatically after one counts as 'touch'.
let lastInteraction: InteractionType = 'mouse'
let tracking = false
function trackInteraction() {
  if (tracking || typeof document === 'undefined') return
  tracking = true
  document.addEventListener('pointerdown', (e) => (lastInteraction = (e.pointerType || 'mouse') as InteractionType), true)
  document.addEventListener('keydown', () => (lastInteraction = 'keyboard'), true)
}

/** Resolve `initialFocus` to the element to focus, or null to leave focus where it is. */
function initialFocusTarget(pref: InitialFocus | undefined, modal: boolean, sheet: HTMLElement): HTMLElement | null {
  const fallback = modal ? sheet : null
  const v = typeof pref === 'function' ? pref(lastInteraction) : (pref ?? modal)
  if (v === true) return typeof pref === 'function' || pref === true ? sheet : fallback
  if (v === null) return fallback
  if (v === false || v === undefined) return null
  if (v instanceof HTMLElement) return v
  return v.current ?? fallback
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
  const initialFocus = useRef<InitialFocus | undefined>(undefined)
  useEffect(trackInteraction, [])
  const id = useId()
  const [hasTitle, setHasTitle] = useState(false)
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
      // Non-modal sheets only use it if they took focus (initialFocus); see View.
      returnFocus.current = document.activeElement as HTMLElement | null
      setMounted(true)
    }
    if (open && mounted && closing.current) {
      closing.current = false
      controller.current?.open(detent ?? initialDetent)
    }
    if (!open && mounted) {
      closing.current = true
      if (controller.current) controller.current.close()
      else setMounted(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- detent is read when (re)opening, not followed here
  }, [open, mounted])

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
      onDetentChange,
      debug,
      onClosed,
      controller,
      returnFocus,
      rootEl,
      sheetEl,
      initialFocus,
      titleId: `${id}-title`,
      descriptionId: `${id}-description`,
      hasTitle,
      setHasTitle,
      hasDescription,
      setHasDescription,
    }),
    [open, mounted, setOpen, requestDismiss, modal, dismissible, closeOnBack, fullscreen, recede, detents, initialDetent, detent, onDetentChange, debug, onClosed, id, hasTitle, hasDescription],
  )

  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>
}

// ---------------------------------------------------------------------------

/** What `Trigger`'s `render` function receives: spread it onto your own button. */
export interface TriggerRenderProps {
  type: 'button'
  'aria-haspopup': 'dialog'
  'aria-expanded': boolean
  onClick: (e: ReactMouseEvent<HTMLElement>) => void
}

export interface TriggerProps extends ComponentPropsWithRef<'button'> {
  /**
   * Render your own button (a design-system `<Button>`) instead of ours:
   * `render={(props) => <Button variant="paper" {...props}>Open</Button>}`. It receives `type`, `onClick` and the
   * ARIA state; anything else (className, disabled, aria-label) goes on your button directly.
   */
  render?: (props: TriggerRenderProps) => ReactElement
}

export function Trigger({ render, ...props }: TriggerProps) {
  const ctx = useSheet('Trigger')
  const onClick = (e: ReactMouseEvent<HTMLElement>) => {
    props.onClick?.(e as ReactMouseEvent<HTMLButtonElement>)
    if (!e.defaultPrevented) ctx.setOpen(true, 'trigger')
  }
  if (render) return render({ type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': ctx.open, onClick })
  return <button type="button" aria-haspopup="dialog" aria-expanded={ctx.open} {...props} onClick={onClick} />
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
  useEffect(() => {
    if (ctx.mounted) checkCss('core', 'styles.css')
  }, [ctx.mounted])

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
    // Stack: Escape goes to the top sheet only; the sheet below can recede.
    const { recede, modal } = ctxRef.current
    const entry: StackEntry = { root, close: () => dismissRef.current('escape'), recede: recede && modal, modal }
    entryRef.current = entry
    pushSheet(entry)
    return () => {
      removeSheet(entry)
      entryRef.current = null
    }
  }, [ctx.mounted, ctx.rootEl])
  useEffect(() => {
    if (entryRef.current) updateSheet(entryRef.current, { recede: ctx.recede && ctx.modal, modal: ctx.modal })
  }, [ctx.recede, ctx.modal])

  // The page is inert only while the sheet is open, not while it animates closed: as soon as it starts
  // closing, the page (or the sheet below) takes input and focus again, like a native dialog. Otherwise
  // focus can't return, and a key pressed during the close animation still lands in the sheet.
  const blocking = ctx.mounted && ctx.open && ctx.modal
  useEffect(() => {
    const root = ctx.rootEl.current
    if (!blocking || !root) return
    const held = holdInert(root)
    const dbg = (m: string) => ctxRef.current.debug?.(m)
    dbg(`portal mount: inert ${held.length} elements`)
    return () => {
      releaseInert(held)
      dbg(`portal unmount: released ${held.length}`)
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
      const escape = closedByEscape()
      ctxRef.current.debug?.(`close watcher: ${escape ? 'escape' : 'back'}`)
      // The browser routes Escape to the newest watcher wherever focus is; a non-modal sheet only takes it from inside.
      if (!escape || takesEscape(entry)) dismissRef.current(escape ? 'escape' : 'back')
      setRearm((n) => n + 1)
    }
    entry.watcher = watcher
    return () => {
      if (entry.watcher === watcher) entry.watcher = null
      watcher.destroy()
    }
  }, [listenForBack, rearm])

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
    // Title/Description report themselves in a layout effect, which re-renders only after this one: name the dialog
    // now so focusing it below announces it.
    for (const [attr, id] of [['aria-labelledby', ctx.titleId], ['aria-describedby', ctx.descriptionId]] as const) {
      if (!sheet.hasAttribute(attr) && sheet.querySelector(`[id="${id}"]`)) sheet.setAttribute(attr, id)
    }
    // Modal: focus the sheet by default. Non-modal: leave focus on the page unless `initialFocus` says otherwise.
    // preventScroll: the target may still be below the screen (the sheet is about to slide up).
    initialFocusTarget(ctx.initialFocus.current, ctx.modal, sheet)?.focus({ preventScroll: true })
    return () => {
      // A non-modal sheet that took focus gives it back (modal sheets restore it in Portal as soon as they close).
      if (!ctx.modal && sheet.contains(document.activeElement)) {
        const back = ctx.returnFocus.current
        if (back?.isConnected) back.focus({ preventScroll: true })
      }
      c.destroy()
      ctx.controller.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once per mount
  }, [])

  // By value: an inline `detents={[0.5]}` is a new array on every render, and each setDetents is a layout pass.
  const detentsKey = ctx.detents.join('|')
  useEffect(() => {
    ctx.controller.current?.setDetents(ctxRef.current.detents)
  }, [detentsKey, ctx.controller])

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

export interface ContentProps extends ComponentPropsWithRef<'section'> {
  /** Where focus goes when the sheet opens (like Base UI's `initialFocus`). See `InitialFocus`. */
  initialFocus?: InitialFocus
}

export function Content({ ref, initialFocus, ...props }: ContentProps) {
  const ctx = useSheet('Content')
  // Read by View's layout effect, which runs after this renders (the View is the Content's parent).
  ctx.initialFocus.current = initialFocus
  return (
    <section
      data-ybs-sheet=""
      role="dialog"
      aria-modal={ctx.modal}
      aria-labelledby={ctx.hasTitle ? ctx.titleId : undefined}
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
  const { setHasTitle } = ctx
  useLayoutEffect(() => {
    setHasTitle(true)
    return () => setHasTitle(false)
  }, [setHasTitle])
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
