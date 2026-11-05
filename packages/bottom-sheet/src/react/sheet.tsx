import {
  type ComponentPropsWithRef,
  createContext,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
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
import { createDialogController } from '../core/dialog'
import type { Detent } from '../core/math'
import {
  closedByEscape,
  closeWatcher,
  escapeTarget,
  holdInert,
  isTopSheet,
  pushSheet,
  releaseInert,
  removeSheet,
  unreplaceSheet,
  reportProgress,
  type StackEntry,
  takesEscape,
  updateSheet,
} from './stack'
import { checkCss } from './css-check'
import { DefaultsContext } from './defaults'

/** Why the sheet is asking to open or close. */
export type OpenChangeReason = 'trigger' | 'close-button' | 'escape' | 'back' | 'outside-press' | 'swipe' | 'replace'

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
  /** Shown as a centred dialog instead of a bottom sheet (decided when it opens, see RootProps.dialog). */
  dialog: boolean
  dismissible: boolean
  closeOnBack: boolean
  fullscreen: boolean
  recede: boolean
  replaceable: boolean
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
  /** Portal reports the sheet joined (or left) the stack; a sheet nested inside waits for that (see Root). */
  setStacked: (stacked: boolean) => void
}

const SheetContext = createContext<SheetContextValue | null>(null)
/**
 * True while this sheet is opening but not yet on the stack: a sheet nested inside holds its mount until it flips.
 * Its own context (not SheetContext), so nested closed sheets re-render only when it changes.
 */
const HoldNestedContext = createContext(false)
/**
 * The portal roots of the sheet this context is under and of the sheets around it (a stable getter, so nested
 * closed sheets don't re-render when a parent changes). A sheet can't replace one it's rendered inside: it would
 * close with it.
 */
const SheetRootsContext = createContext<() => HTMLElement[]>(() => [])

function useSheet(part: string) {
  const ctx = useContext(SheetContext)
  if (!ctx) throw new Error(`<Sheet.${part}> must be used inside <Sheet.Root>`)
  return ctx
}

/**
 * One stable callback ref for the user's ref and ours (a new callback each render would detach and re-attach
 * them every render). Forwards a callback ref's React 19 cleanup.
 */
function useMergedRef<T>(user: Ref<T> | undefined, own: RefObject<T | null>) {
  return useCallback(
    (node: T | null) => {
      own.current = node
      const cleanup = typeof user === 'function' ? user(node) : user ? ((user as RefObject<T | null>).current = node, undefined) : undefined
      return () => {
        own.current = null
        if (typeof user === 'function') typeof cleanup === 'function' ? cleanup() : user(null)
        else if (user) (user as RefObject<T | null>).current = null
      }
    },
    [user, own],
  )
}

// ---------------------------------------------------------------------------

/** Defaults for every sheet below a `Provider`. A sheet's own prop wins. */
export interface ProviderProps {
  children?: ReactNode
  /** Default `dialog` for every sheet inside (see `RootProps.dialog`). A sheet opts out with `dialog={false}`. */
  dialog?: boolean | string
}

/**
 * App-wide defaults, e.g. every sheet a dialog on desktop: wrap your app in `<Sheet.Provider dialog>`. Optional.
 * Providers nest: an inner one overrides what it sets and keeps the rest from the outer one.
 */
export function Provider({ children, dialog }: ProviderProps) {
  const outer = useContext(DefaultsContext)
  const merged = dialog ?? outer.dialog
  const value = useMemo(() => ({ dialog: merged }), [merged])
  return <DefaultsContext.Provider value={value}>{children}</DefaultsContext.Provider>
}

// ---------------------------------------------------------------------------

export interface RootProps {
  children?: ReactNode
  open?: boolean
  defaultOpen?: boolean
  /** Called when the user opens or closes the sheet (not when the `open` prop changes). */
  onOpenChange?: (open: boolean, details: OpenChangeDetails) => void
  /**
   * Called once the sheet has finished closing (animation done, removed from the page). Keep the sheet rendered with
   * `open={false}` so it can animate out, and clear what its content needs here, e.g. `() => setPending(null)`.
   * Unmounting the sheet (`{open && <BottomSheet/>}`) skips the animation.
   */
  onExitComplete?: () => void
  /**
   * Partial detents; `full` is always included. Default `[]`: the sheet opens straight to full (fit to short content).
   * Each is a fraction of the available height (0.5), a CSS length of visible sheet ('76px', '40dvh'), `'header'`
   * (exactly the header: a peek that shows the title and nothing under it), or `'header+footer'` (the header and the
   * footer right under it: a chat's title and composer).
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
  /**
   * A sheet that opens over this one replaces it instead of stacking on it: this one closes
   * (`onOpenChange(false, { reason: 'replace' })`) while the new one opens, both at once, the page staying evenly
   * dimmed, and focus later returns to whatever opened this one. For a step in a flow (a place sheet whose Share
   * opens a separate share sheet). A sheet rendered inside this one still stacks on it (it can't replace its own
   * parent: it would close with it), so render the next step beside this sheet, not in it.
   */
  replaceable?: boolean
  /** Detent to open at. Default: the smallest usable partial detent, else `full`. */
  initialDetent?: Detent
  /** Controlled resting detent. Changing it moves the sheet. */
  detent?: Detent
  /** The sheet came to rest at a detent. Never `'closed'`: closing is `onOpenChange(false)`. */
  onDetentChange?: (detent: Detent) => void
  /**
   * Show the sheet as a centred dialog where a bottom sheet doesn't fit: wide screens used with a mouse or trackpad.
   * `true` uses `DIALOG_QUERY` (at least 768px wide, hover, fine pointer); a string is your own media query.
   * Same parts, props and behaviour (focus, Escape, back, stacking, outside press); there are no detents
   * (`detent`/`onDetentChange` are unused) and nothing to drag. Sets `data-ybs-dialog` on the root.
   * Read when the sheet opens, like `modal`: resizing while it is open keeps the current presentation.
   * Modal sheets only: a non-modal sheet stays a sheet. Set it for every sheet with `<Sheet.Provider dialog>`.
   * Default: off for `Sheet.Root`; on for `BottomSheet` (`/styled`).
   */
  dialog?: boolean | string
  /** Receives the controller's internal decision log (for device testing). */
  debug?: (message: string) => void
}

/**
 * Where `dialog` (true) shows a dialog: wide enough, and used with a mouse or trackpad. A touch tablet or a phone in
 * landscape keeps the sheet.
 */
export const DIALOG_QUERY = '(min-width: 768px) and (hover: hover) and (pointer: fine)'

function wantsDialog(dialog: boolean | string | undefined, modal: boolean) {
  if (!dialog || !modal || typeof window === 'undefined' || typeof matchMedia === 'undefined') return false
  return matchMedia(dialog === true ? DIALOG_QUERY : dialog).matches
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
    modal: modalProp = true,
    dismissible = true,
    fullscreen = false,
    recede = false,
    replaceable = false,
    debug,
    onExitComplete,
  } = props
  const outerRoots = useContext(SheetRootsContext)
  const defaults = useContext(DefaultsContext)
  const dialogProp = props.dialog ?? defaults.dialog
  const [openState, setOpenState] = useState(defaultOpen)
  const open = openProp ?? openState
  // A sheet rendered inside another one stacks on top of it. When both open in the same render, React runs the inner
  // one's effects first, so it would join the stack, the DOM and take focus before its parent and end up under it.
  // It waits until the parent is on the stack instead (the next render); a parent that isn't opening doesn't hold it.
  // This orders mounting, not the stack: a headless child Root placed outside its parent's Portal and opened before
  // the parent still ends up below it, and a parent that is open but renders no Portal holds its nested sheets.
  // The child's returnFocus is then taken inside the parent sheet, so closing it hands focus back to the parent.
  const parentReady = !useContext(HoldNestedContext)
  const [mounted, setMounted] = useState(open && parentReady)
  const [stacked, setStacked] = useState(false)
  const holdNested = (open || mounted) && !stacked
  // `modal` is read when the sheet opens (the page lock, inert and focus are set up for one or the other).
  const [modalAtOpen, setModalAtOpen] = useState(modalProp)
  const modal = mounted ? modalAtOpen : modalProp
  // Dialog or sheet, decided when it opens (like `modal`): a resize while open doesn't switch presentation mid-way.
  const [dialogAtOpen, setDialogAtOpen] = useState(() => open && wantsDialog(dialogProp, modalProp))
  const dialog = mounted && dialogAtOpen
  const closeOnBack = props.closeOnBack ?? modal
  const controller = useRef<SheetController | null>(null)
  const rootEl = useRef<HTMLDivElement | null>(null)
  const sheetRoots = useCallback(() => (rootEl.current ? [rootEl.current, ...outerRoots()] : outerRoots()), [outerRoots])
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
    if (open && !mounted && parentReady) {
      // Non-modal sheets only use it if they took focus (initialFocus); see View.
      returnFocus.current = document.activeElement as HTMLElement | null
      setModalAtOpen(modalProp)
      setDialogAtOpen(wantsDialog(dialogProp, modalProp))
      setMounted(true)
    }
    if (open && mounted && closing.current) {
      closing.current = false
      controller.current?.open(detent ?? initialDetent)
      // Closing gave focus back to the page, which a modal sheet has made inert again (Portal runs first): move it
      // into the sheet as on a first open.
      const sheet = sheetEl.current
      if (sheet && !sheet.contains(document.activeElement)) initialFocusTarget(initialFocus.current, modal, sheet)?.focus({ preventScroll: true })
    }
    if (!open && mounted) {
      closing.current = true
      if (controller.current) controller.current.close()
      else setMounted(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- detent is read when (re)opening, not followed here
  }, [open, mounted, parentReady])

  // Finished closing: mounted went from true to false (the portal is gone by the time this effect runs).
  const exitRef = useRef(onExitComplete)
  exitRef.current = onExitComplete
  const wasMounted = useRef(mounted)
  useEffect(() => {
    if (wasMounted.current && !mounted) exitRef.current?.()
    wasMounted.current = mounted
  }, [mounted])

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
      dialog,
      dismissible,
      closeOnBack,
      fullscreen,
      recede,
      replaceable,
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
      setStacked,
    }),
    [open, mounted, setOpen, requestDismiss, modal, dialog, dismissible, closeOnBack, fullscreen, recede, replaceable, detents, initialDetent, detent, onDetentChange, debug, onClosed, id, hasTitle, hasDescription],
  )

  return (
    <SheetContext.Provider value={value}>
      <HoldNestedContext.Provider value={holdNested}>
        <SheetRootsContext.Provider value={sheetRoots}>{children}</SheetRootsContext.Provider>
      </HoldNestedContext.Provider>
    </SheetContext.Provider>
  )
}

/**
 * How the sheet around this component is shown right now: `'sheet'` or `'dialog'` (see `RootProps.dialog`). Use it to
 * adapt the content, e.g. a visible close button in a dialog.
 */
export function usePresentation(): 'sheet' | 'dialog' {
  return useSheet('usePresentation').dialog ? 'dialog' : 'sheet'
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
  const sheetRoots = useContext(SheetRootsContext)
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
    const { recede, modal, replaceable } = ctxRef.current
    const entry: StackEntry = {
      root,
      close: () => dismissRef.current('escape'),
      recede: recede && modal,
      modal,
      replaceable,
      ancestors: sheetRoots().filter((r) => r !== root),
      returnFocus: ctxRef.current.returnFocus,
      closeForReplace: () => ctxRef.current.setOpen(false, 'replace'),
    }
    entryRef.current = entry
    const replaced = pushSheet(entry)
    // Focus was on a control in the replaced sheet (its Share button), which is going away: return to what opened that one.
    if (replaced?.returnFocus) ctxRef.current.returnFocus.current = replaced.returnFocus.current
    ctxRef.current.setStacked(true) // a sheet nested inside may mount now (see Root)
    return () => {
      removeSheet(entry)
      entryRef.current = null
      ctxRef.current.setStacked(false)
    }
  }, [ctx.mounted, ctx.rootEl])
  useEffect(() => {
    if (entryRef.current) updateSheet(entryRef.current, { recede: ctx.recede && ctx.modal, modal: ctx.modal, replaceable: ctx.replaceable })
  }, [ctx.recede, ctx.modal, ctx.replaceable])

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
      // Focus already moved into another sheet (the one replacing this, or one that opened in the same render: it
      // focuses in a layout effect, before this cleanup): don't pull it back to the page. A non-modal replacement
      // doesn't take focus, so focus, still on our Share button, goes back to what opened this sheet as usual.
      const active = document.activeElement
      if (active && !root.contains(active) && active.closest('[data-ybs-root]')) return
      // Restore focus only after lifting inert: while the page is inert, focus() is a no-op.
      // Kept (not cleared): reopened during the close animation, the sheet gives focus back here again later.
      const back = ctx.returnFocus.current
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
    const entry = entryRef.current
    if (!entry) return
    entry.closing = !ctx.open
    // Opened again while it was being replaced (reversing its close): an ordinary sheet in the stack again.
    if (ctx.open) unreplaceSheet(entry)
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
      // The browser routes Escape to the newest watcher wherever focus is; a non-modal sheet only takes it from
      // inside, and otherwise hands it to the sheet that does (focus in a modal sheet below), if any.
      if (!escape) dismissRef.current('back')
      else if (takesEscape(entry)) dismissRef.current('escape')
      else escapeTarget()?.close()
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
      data-ybs-dialog={ctx.dialog ? '' : undefined}
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

/** Props go on the scroller (the one scroll container); `bleedClassName` on the bleed layer. */
export interface ViewProps extends ComponentPropsWithRef<'div'> {
  /** className for the bleed layer (sheet colour under the visual viewport). */
  bleedClassName?: string
}

/** The single native scroller: spacer (closed area), detent markers, and the sheet (Sheet.Content). */
export function View({ children, bleedClassName, ref, ...props }: ViewProps) {
  const ctx = useSheet('View')
  const scroller = useRef<HTMLDivElement>(null)
  const scrollerRef = useMergedRef(ref, scroller)
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
    const c = (ctx.dialog ? createDialogController : createSheetController)(
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
        {...props}
        data-ybs-scroller=""
        ref={scrollerRef}
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
  const sheetRef = useMergedRef(ref, ctx.sheetEl)
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
      ref={sheetRef}
    />
  )
}

/** Sticky top part of the sheet. Mouse-draggable on desktop. */
export function Header(props: ComponentPropsWithRef<'div'>) {
  return <div data-ybs-header="" data-ybs-drag="" {...props} />
}

/**
 * Sticky bottom part of the sheet, for actions. It stays at the bottom of the screen while the content scrolls, and at
 * partial detents too. The controller sets `data-ybs-more` on the root while content is hidden behind it.
 */
export function Footer(props: ComponentPropsWithRef<'div'>) {
  return <div data-ybs-footer="" {...props} />
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
