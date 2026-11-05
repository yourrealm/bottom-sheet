import type { ComponentPropsWithRef, ReactElement, ReactNode } from 'react'
import * as Base from '../react/sheet'
import { useContext, useEffect } from 'react'
import { DefaultsContext } from '../react/defaults'
import { checkCss, checkTokens } from '../react/css-check'

import type { Detent } from '../core/math'
export type { Detent }
export type {
  ContentProps,
  InitialFocus,
  InteractionType,
  OpenChangeDetails,
  OpenChangeReason,
  PortalProps,
  ProviderProps,
  RootProps,
  TriggerProps,
  TriggerRenderProps,
  ViewProps,
} from '../react/sheet'

/** The media query `dialog` (true) uses: at least 768px wide, with a mouse or trackpad. */
export { DIALOG_QUERY } from '../react/sheet'

const cx = (...c: Array<string | undefined | false>) => c.filter(Boolean).join(' ')

function withClass<P extends { className?: string }>(Comp: (p: P) => ReactNode, cls: string) {
  return (p: P) => <Comp {...p} className={cx(cls, p.className)} />
}

/**
 * Styled parts: the pieces `BottomSheet` is built from, with the preset look (same API as the headless `Sheet`).
 * Prefer `BottomSheet`; use these only to arrange a sheet yourself.
 */
export const StyledSheet = {
  Provider: Base.Provider,
  Root: Base.Root,
  Trigger: Base.Trigger,
  Close: Base.Close,
  Portal: Base.Portal,
  Backdrop: withClass(Base.Backdrop, 'ybs-backdrop'),
  View: (p: Base.ViewProps) => {
    // Rendered only while a sheet is open: the moment to check the preset's CSS is loaded.
    useEffect(() => {
      checkCss('styled', 'styled.css')
      checkTokens()
    }, [])
    return <Base.View {...p} className={cx('ybs-view', p.className)} bleedClassName={cx('ybs-bleed', p.bleedClassName)} />
  },
  Content: withClass(Base.Content, 'ybs-sheet'),
  Header: withClass(Base.Header, 'ybs-header'),
  Handle: withClass(Base.Handle, 'ybs-handle'),
  Title: withClass(Base.Title, 'ybs-title'),
  Description: withClass(Base.Description, 'ybs-description'),
  Footer: withClass(Base.Footer, 'ybs-footer'),
  /** The padded content area, after `Header`: the same side space as the header, so text lines up with the title. */
  Body: ({ className, ...p }: ComponentPropsWithRef<'div'>) => <div data-ybs-body="" {...p} className={cx('ybs-body', className)} />,
  /**
   * Content that reaches the sheet's edges, inside the body: a sideways photo strip, a full-width tappable row, a
   * separator. Its contents stay lined up with the rest of the body. The inset is `--ybs-body-inset`.
   */
  Edge: ({ className, ...p }: ComponentPropsWithRef<'div'>) => <div {...p} className={cx('ybs-edge', className)} />,
}

interface BottomSheetBaseProps extends Omit<Base.RootProps, 'children'> {
  /**
   * What opens the sheet. Content (text, elements) is placed inside our trigger button. A function renders your own
   * button instead: `trigger={(props) => <Button variant="paper" {...props}>Open</Button>}` (it receives `type`,
   * `onClick` and the ARIA state; put className, disabled, aria-label on your button).
   */
  trigger?: ReactNode | ((props: Base.TriggerRenderProps) => ReactElement)
  /** A small label above the title (a section, a category). Part of the title, so screen readers read both. */
  eyebrow?: ReactNode
  description?: ReactNode
  /**
   * - `'sheet'` (default): detents as given, a card-width sheet.
   * - `'page'`: an iOS-style page sheet for a task (compose, edit): opens straight to full,
   *   spans the full width (`width` default `'full'`), and the page behind recedes (`recede` default true; mark your
   *   app wrapper with `data-ybs-background`). Pair it with `leading` / `trailing` (Cancel / Save).
   */
  variant?: 'sheet' | 'page'
  /**
   * - `'card'` (default for `sheet`): the sheet is at most 640px wide (`--ybs-max-width`), centred.
   * - `'full'` (default for `page`): the sheet spans the window; its header and body stay in a centred column
   *   (`--ybs-content-width`, default 960px).
   */
  width?: 'card' | 'full'
  /**
   * iOS 26 style: at lower detents the sheet floats (inset from the screen edges, large corners) and attaches as it
   * reaches full. Tokens: --ybs-float-gap (8px), --ybs-float-radius (32px).
   */
  floating?: boolean
  /** Header bar slots, iOS navigation-bar style: e.g. `leading={<BottomSheet.Close>Cancel</BottomSheet.Close>}`. The title centres between them. */
  leading?: ReactNode
  trailing?: ReactNode
  /** Extra content placed in the sticky header under the title (e.g. a search field). */
  headerExtra?: ReactNode
  /**
   * Actions pinned to the bottom of the screen (Cancel / Confirm, Show results). They stay reachable while a long
   * sheet scrolls, reach the sheet's edges, and take the home-bar safe area. A line appears above them only while
   * content is hidden behind them.
   */
  footer?: ReactNode
  /**
   * How content scrolling under the header (and behind the footer) is shown:
   * - `'line'` (default): the header and footer are filled with the sheet colour and a divider appears.
   * - `'soft'`: they have no fill or line, and the content fades out under them (iOS 26's soft scroll edge). Works
   *   with a translucent `--ybs-sheet-bg`. Tokens: `--ybs-soft-fade` (48px), `--ybs-soft-behind-header` and
   *   `--ybs-soft-behind-footer` (`1`: carry on under the bar, the default; `0`: fade out before it).
   */
  scrollEdge?: 'line' | 'soft'
  /**
   * A visible ✕ button in the header's top right that closes the sheet. Default: off for a sheet, on for a dismissible
   * sheet shown as a dialog (`dialog`), which has nothing to swipe, unless it has `leading`/`trailing` (Cancel/Done).
   * Without it, a dismissible sheet still has a close button that only screen readers announce (it shows when focused
   * by keyboard), because swipes and the dimmed area aren't usable with VoiceOver.
   */
  closeButton?: boolean
  /** Accessible name of the close button (visible ✕ or screen-reader only). Default `'Close'`. */
  closeLabel?: string
  /**
   * Where focus goes when the sheet opens, like Base UI's: an element ref, `false`, `true` (the sheet), or a function
   * of how it was opened, e.g. `(type) => type !== 'touch' && saveRef.current`. Default: the sheet for a modal sheet,
   * nothing for a non-modal one.
   */
  initialFocus?: Base.InitialFocus
  /**
   * On a wide screen with a mouse (`DIALOG_QUERY`), show the sheet as a centred dialog. **Default `true` for
   * `BottomSheet`** (unlike the parts). `false` keeps this sheet a sheet everywhere; a string is your own media query.
   * App-wide: `<BottomSheet.Provider dialog={false}>`. A sheet's own value wins over the Provider's.
   */
  dialog?: boolean | string
  children?: ReactNode
  /** On the sheet (the panel). For one sheet's theme (tokens, `data-theme`, `color-scheme`) use `rootProps`. */
  className?: string
  /** Props for the sheet element (the `<section>`): `aria-*`, `role`, `data-*`, a `ref`. */
  contentProps?: ComponentPropsWithRef<'section'>
  /**
   * Props for this sheet's `[data-ybs-root]`, the element around everything drawn for it: the place for one sheet's
   * own theme (`className`, `style`, `data-theme`, `--ybs-*` tokens, `color-scheme`). Set on the sheet instead, a token
   * misses the parts outside it (backdrop, dialog ring and shadow, the colour behind the keyboard).
   */
  rootProps?: Omit<Base.PortalProps, 'children' | 'container'>
}

/**
 * Every sheet needs a name for screen readers ("Share photo, dialog"): a visible `title`, or an `aria-label` for a
 * sheet without one (an action list, a photo viewer). TypeScript refuses a sheet with neither.
 */
export type BottomSheetProps = BottomSheetBaseProps &
  (
    | { /** Visible title; also names the dialog. */ title: NonNullable<ReactNode>; 'aria-label'?: string }
    | { title?: undefined; /** Names a sheet that has no visible title. */ 'aria-label': string }
  )


/**
 * The simple path:
 *   <BottomSheet trigger="Open" title="Settings">…</BottomSheet>
 */
export function BottomSheet({
  trigger,
  title,
  eyebrow,
  description,
  variant = 'sheet',
  floating = false,
  width = variant === 'page' ? 'full' : 'card',
  leading,
  trailing,
  headerExtra,
  footer,
  scrollEdge = 'line',
  closeButton,
  closeLabel = 'Close',
  initialFocus,
  children,
  className,
  contentProps,
  rootProps,
  'aria-label': ariaLabel,
  ...sheetProps
}: BottomSheetProps) {
  // Dialog on desktop by default: the sheet's own prop, else the Provider's, else on.
  const defaults = useContext(DefaultsContext)
  const withDialog = { ...sheetProps, dialog: sheetProps.dialog ?? defaults.dialog ?? true }
  const root = variant === 'page' ? { recede: true, ...withDialog } : withDialog
  const bar = leading != null || trailing != null
  // The eyebrow sits inside the title element so it lines up in every header layout and is read with the title
  // (the hidden comma keeps a screen reader from running the two together).
  const heading = title == null ? null : (
    <StyledSheet.Title>
      {eyebrow != null && (
        <span className="ybs-eyebrow">
          {eyebrow}
          <span className="ybs-sr-only">, </span>
        </span>
      )}
      {title}
    </StyledSheet.Title>
  )
  return (
    <StyledSheet.Root {...root}>
      {typeof trigger === 'function' ? (
        <StyledSheet.Trigger render={trigger} />
      ) : (
        trigger != null && <StyledSheet.Trigger className="ybs-trigger">{trigger}</StyledSheet.Trigger>
      )}
      <StyledSheet.Portal {...rootProps}>
        {root.modal !== false && <StyledSheet.Backdrop />}
        <StyledSheet.View>
          <StyledSheet.Content
            {...contentProps}
            aria-label={ariaLabel ?? contentProps?.['aria-label']}
            initialFocus={initialFocus}
            data-ybs-soft-edge={scrollEdge === 'soft' ? '' : undefined}
            className={cx(width === 'full' && 'ybs-sheet-full', variant === 'page' && 'ybs-sheet-page', floating && 'ybs-sheet-floating', className, contentProps?.className)}
          >
            <SheetHeader
              heading={heading}
              leading={leading}
              trailing={trailing}
              bar={bar}
              description={description}
              headerExtra={headerExtra}
              closeButton={closeButton}
              closeLabel={closeLabel}
              dismissible={sheetProps.dismissible !== false}
            />
            {/* No body without content: its padding would stack with the header's and footer's (a confirm sheet). */}
            {children != null && children !== false && children !== '' && <StyledSheet.Body>{children}</StyledSheet.Body>}
            {footer != null && <StyledSheet.Footer>{footer}</StyledSheet.Footer>}
          </StyledSheet.Content>
        </StyledSheet.View>
      </StyledSheet.Portal>
    </StyledSheet.Root>
  )
}

/** Inside the portal, so it knows whether the sheet is shown as a dialog (the ✕ defaults on there). */
function SheetHeader(p: {
  heading: ReactNode
  leading: ReactNode
  trailing: ReactNode
  bar: boolean
  description: ReactNode
  headerExtra: ReactNode
  closeButton: boolean | undefined
  closeLabel: string
  dismissible: boolean
}) {
  const dialog = Base.usePresentation() === 'dialog'
  // Not beside leading/trailing: those carry the sheet's own way out (Cancel / Done).
  const visible = p.closeButton ?? (dialog && p.dismissible && !p.bar)
  const close = visible ? (
    <StyledSheet.Close className="ybs-close" aria-label={p.closeLabel}>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" /></svg>
    </StyledSheet.Close>
  ) : null
  // Screen readers (VoiceOver especially) can't swipe the sheet away or tap the dimmed area, so a dismissible sheet
  // always has a way out. Hidden until focused.
  const srClose = !visible && p.dismissible && <StyledSheet.Close className="ybs-sr-close">{p.closeLabel}</StyledSheet.Close>
  return (
    <StyledSheet.Header>
      <StyledSheet.Handle />
      {p.bar ? (
        <div className="ybs-bar">
          <div className="ybs-leading">{p.leading}</div>
          {p.heading ?? <span />}
          <div className="ybs-trailing">{p.trailing}{close}</div>
        </div>
      ) : close ? (
        <div className="ybs-title-row">
          {p.heading ?? <span />}
          {close}
        </div>
      ) : (
        p.heading
      )}
      {p.description != null && <StyledSheet.Description>{p.description}</StyledSheet.Description>}
      {p.headerExtra}
      {srClose}
    </StyledSheet.Header>
  )
}

/** Content that reaches the sheet's edges (see `StyledSheet.Edge`), for use inside `<BottomSheet>`. */
BottomSheet.Edge = StyledSheet.Edge
/** Closes the sheet it's in, e.g. a Cancel button in `leading` or `footer`. */
BottomSheet.Close = StyledSheet.Close
/** App-wide defaults for every sheet inside, e.g. `<BottomSheet.Provider dialog>` around your app: dialogs on desktop. */
BottomSheet.Provider = Base.Provider
/** `'sheet'` or `'dialog'`: how the sheet around the calling component is shown (see `dialog`). */
BottomSheet.usePresentation = Base.usePresentation
/** The element that scrolls the sheet's content (the one scroller, or the dialog), for a virtualized list. */
BottomSheet.useScrollElement = Base.useScrollElement
