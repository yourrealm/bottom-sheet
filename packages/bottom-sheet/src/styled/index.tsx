import type { ComponentPropsWithRef, ReactElement, ReactNode } from 'react'
import * as Base from '../react/sheet'
import { useEffect } from 'react'
import { checkCss } from '../react/css-check'

import type { Detent } from '../core/math'
export type { Detent }
export type {
  ContentProps,
  InitialFocus,
  InteractionType,
  OpenChangeDetails,
  OpenChangeReason,
  PortalProps,
  RootProps,
  TriggerProps,
  TriggerRenderProps,
  ViewProps,
} from '../react/sheet'

const cx = (...c: Array<string | undefined | false>) => c.filter(Boolean).join(' ')

function withClass<P extends { className?: string }>(Comp: (p: P) => ReactNode, cls: string) {
  return (p: P) => <Comp {...p} className={cx(cls, p.className)} />
}

/**
 * Styled parts: the pieces `BottomSheet` is built from, with the preset look (same API as the headless `Sheet`).
 * Prefer `BottomSheet`; use these only to arrange a sheet yourself.
 */
export const StyledSheet = {
  Root: Base.Root,
  Trigger: Base.Trigger,
  Close: Base.Close,
  Portal: Base.Portal,
  Backdrop: withClass(Base.Backdrop, 'ybs-backdrop'),
  View: (p: Base.ViewProps) => {
    // Rendered only while a sheet is open: the moment to check the preset's CSS is loaded.
    useEffect(() => checkCss('styled', 'styled.css'), [])
    return <Base.View {...p} className={cx('ybs-view', p.className)} bleedClassName={cx('ybs-bleed', p.bleedClassName)} />
  },
  Content: withClass(Base.Content, 'ybs-sheet'),
  Header: withClass(Base.Header, 'ybs-header'),
  Handle: withClass(Base.Handle, 'ybs-handle'),
  Title: withClass(Base.Title, 'ybs-title'),
  Description: withClass(Base.Description, 'ybs-description'),
  Footer: withClass(Base.Footer, 'ybs-footer'),
  /** The padded content area, after `Header`: the same side space as the header, so text lines up with the title. */
  Body: ({ className, ...p }: ComponentPropsWithRef<'div'>) => <div {...p} className={cx('ybs-body', className)} />,
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
   * A visible ✕ button in the header's top right that closes the sheet. Off by default. Without it, a dismissible
   * sheet still has a close button that only screen readers announce (it shows when focused by keyboard), because
   * swipes and the dimmed area aren't usable with VoiceOver.
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
  children?: ReactNode
  className?: string
  contentProps?: ComponentPropsWithRef<'section'>
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
  closeButton = false,
  closeLabel = 'Close',
  initialFocus,
  children,
  className,
  contentProps,
  'aria-label': ariaLabel,
  ...rootProps
}: BottomSheetProps) {
  const root = variant === 'page' ? { recede: true, ...rootProps } : rootProps
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
  const close = closeButton ? (
    <StyledSheet.Close className="ybs-close" aria-label={closeLabel}>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" /></svg>
    </StyledSheet.Close>
  ) : null
  // Screen readers (VoiceOver especially) can't swipe the sheet away or tap the dimmed area, so a dismissible sheet
  // always has a way out. Hidden until focused.
  const srClose = !closeButton && rootProps.dismissible !== false && (
    <StyledSheet.Close className="ybs-sr-close">{closeLabel}</StyledSheet.Close>
  )
  return (
    <StyledSheet.Root {...root}>
      {typeof trigger === 'function' ? (
        <StyledSheet.Trigger render={trigger} />
      ) : (
        trigger != null && <StyledSheet.Trigger className="ybs-trigger">{trigger}</StyledSheet.Trigger>
      )}
      <StyledSheet.Portal>
        {root.modal !== false && <StyledSheet.Backdrop />}
        <StyledSheet.View>
          <StyledSheet.Content
            {...contentProps}
            aria-label={ariaLabel ?? contentProps?.['aria-label']}
            initialFocus={initialFocus}
            className={cx(width === 'full' && 'ybs-sheet-full', variant === 'page' && 'ybs-sheet-page', floating && 'ybs-sheet-floating', className, contentProps?.className)}
          >
            <StyledSheet.Header>
              <StyledSheet.Handle />
              {bar ? (
                <div className="ybs-bar">
                  <div className="ybs-leading">{leading}</div>
                  {heading ?? <span />}
                  <div className="ybs-trailing">{trailing}{close}</div>
                </div>
              ) : close ? (
                <div className="ybs-title-row">
                  {heading ?? <span />}
                  {close}
                </div>
              ) : (
                heading
              )}
              {description != null && <StyledSheet.Description>{description}</StyledSheet.Description>}
              {headerExtra}
              {srClose}
            </StyledSheet.Header>
            {/* No body without content: its padding would stack with the header's and footer's (a confirm sheet). */}
            {children != null && children !== false && children !== '' && <StyledSheet.Body>{children}</StyledSheet.Body>}
            {footer != null && <StyledSheet.Footer>{footer}</StyledSheet.Footer>}
          </StyledSheet.Content>
        </StyledSheet.View>
      </StyledSheet.Portal>
    </StyledSheet.Root>
  )
}

/** Content that reaches the sheet's edges (see `StyledSheet.Edge`), for use inside `<BottomSheet>`. */
BottomSheet.Edge = StyledSheet.Edge
/** Closes the sheet it's in, e.g. a Cancel button in `leading` or `footer`. */
BottomSheet.Close = StyledSheet.Close
