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
import { isTopSheet, pushSheet, removeSheet, reportProgress } from './stack'
import { useStyle } from './use-style'

interface SheetContextValue {
  open: boolean
  mounted: boolean
  setOpen: (open: boolean) => void
  detents: readonly number[]
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
  onOpenChange?: (open: boolean) => void
  /** Partial detents as fractions of the available height (e.g. [0.5]). `full` is always included. Default [0.5]. */
  detents?: readonly number[]
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

const DEFAULT_DETENTS = [0.5] as const

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
    debug,
  } = props
  const [openState, setOpenState] = useState(defaultOpen)
  const open = openProp ?? openState
  const [mounted, setMounted] = useState(open)
  const controller = useRef<SheetController | null>(null)
  const rootEl = useRef<HTMLDivElement | null>(null)
  const sheetEl = useRef<HTMLElement | null>(null)
  const id = useId()

  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setOpenState(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange],
  )

  // Open -> mount; close -> animate out via the controller, unmount when closed.
  // Re-opening while the close animation runs reverses it.
  const closing = useRef(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open && !mounted) {
      returnFocus.current = document.activeElement as HTMLElement | null
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
  }, [open, mounted, initialDetent])

  const onClosed = useCallback(() => {
    closing.current = false
    setMounted(false)
    if (open) setOpen(false) // closed by a gesture
  }, [open, setOpen])

  const value = useMemo<SheetContextValue>(
    () => ({
      open,
      mounted,
      setOpen,
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
    }),
    [open, mounted, setOpen, detents, initialDetent, detent, guard, onDetentChange, debug, onClosed, id],
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
        if (!e.defaultPrevented) ctx.setOpen(true)
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
        if (!e.defaultPrevented) ctx.setOpen(false)
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

/** Fixed layer. Mounted while open or animating closed. Makes the rest of the page inert. */
export function Portal({ children, container }: PortalProps) {
  const ctx = useSheet('Portal')
  useStyle('core', structuralCss)

  // Everything outside the sheet is inert: focus can't leave, screen readers
  // see only the dialog. (Modal sheet; non-modal is a later option.)
  const setOpenRef = useRef(ctx.setOpen)
  setOpenRef.current = ctx.setOpen
  useEffect(() => {
    const root = ctx.rootEl.current
    if (!ctx.mounted || !root) return
    const parent = root.parentElement
    if (!parent) return
    // Stack: Escape goes to the top sheet only; the sheet below can recede.
    const entry = { root, close: () => setOpenRef.current(false) }
    pushSheet(entry)
    const touched: Element[] = []
    for (const el of Array.from(parent.children)) {
      if (el === root || el.hasAttribute('inert') || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue
      el.setAttribute('inert', '')
      touched.push(el)
    }
    return () => {
      removeSheet(entry)
      for (const el of touched) el.removeAttribute('inert')
      // Restore focus only now: while the page is inert, focus() is a no-op.
      const back = ctx.returnFocus.current
      ctx.returnFocus.current = null
      if (back?.isConnected) back.focus({ preventScroll: true })
    }
  }, [ctx.mounted, ctx.rootEl, ctx.returnFocus])

  if (!ctx.mounted || typeof document === 'undefined') return null
  return createPortal(
    <div data-ybs-root="" ref={ctx.rootEl}>
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
        if (!e.defaultPrevented) ctx.setOpen(false)
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
        onDetentChange: (d) => ctxRef.current.onDetentChange?.(d),
        onClosed: () => ctxRef.current.onClosed(),
        onProgress: (p) => reportProgress(root, p),
        isActive: () => isTopSheet(root),
        debug: (m) => ctxRef.current.debug?.(m),
      },
    )
    ctx.controller.current = c
    c.open(ctx.detent ?? ctx.initialDetent)
    sheet.focus({ preventScroll: true })
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
        // Any click in the sheet layer that isn't on the sheet itself is "outside": above it (the
        // spacer) and beside it when the sheet is narrower than the screen (e.g. max-width on desktop).
        onClick={(e) => {
          const target = e.target as Element
          // React bubbles events through portals: a click in a sheet stacked on top of this one arrives
          // here too. Only handle clicks that are really inside this scroller's DOM.
          if (!e.currentTarget.contains(target)) return
          if (!target.closest('[data-ybs-sheet]')) ctx.setOpen(false)
        }}
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
      aria-modal="true"
      aria-labelledby={ctx.titleId}
      aria-describedby={ctx.descriptionId}
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
  return <p id={ctx.descriptionId} {...props} />
}
