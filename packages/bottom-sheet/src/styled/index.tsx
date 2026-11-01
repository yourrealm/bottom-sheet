import type { ComponentPropsWithRef, ReactNode } from 'react'
import * as Base from '../react/sheet'
import { useStyle } from '../react/use-style'
import { styledCss } from './styles'

import type { Detent } from '../core/math'
export type { Detent }
export type { OpenChangeDetails, OpenChangeReason } from '../react/sheet'

const cx = (...c: Array<string | undefined | false>) => c.filter(Boolean).join(' ')

function withClass<P extends { className?: string }>(Comp: (p: P) => ReactNode, cls: string) {
  const Styled = (p: P) => {
    useStyle('styled', styledCss)
    return <Comp {...p} className={cx(cls, p.className)} />
  }
  return Styled
}

/** Styled parts: same API as the headless `Sheet`, with the preset look. */
export const Sheet = {
  Root: Base.Root,
  Trigger: Base.Trigger,
  Close: Base.Close,
  Portal: Base.Portal,
  Backdrop: withClass(Base.Backdrop, 'ybs-backdrop'),
  View: (p: Base.ViewProps) => {
    useStyle('styled', styledCss)
    return <Base.View {...p} className={cx('ybs-view', p.className)} bleedClassName={cx('ybs-bleed', p.bleedClassName)} />
  },
  Content: withClass(Base.Content, 'ybs-sheet'),
  Header: withClass(Base.Header, 'ybs-header'),
  Handle: withClass(Base.Handle, 'ybs-handle'),
  Title: withClass(Base.Title, 'ybs-title'),
  Description: withClass(Base.Description, 'ybs-description'),
}

export interface BottomSheetProps extends Omit<Base.RootProps, 'children'> {
  /** Element that opens the sheet, e.g. <button>Open</button>. Rendered as-is inside a Trigger. */
  trigger?: ReactNode
  title: ReactNode
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
  /** Header bar slots, iOS navigation-bar style: e.g. `leading={<Sheet.Close>Cancel</Sheet.Close>}`. The title centres between them. */
  leading?: ReactNode
  trailing?: ReactNode
  /** Extra content placed in the sticky header under the title (e.g. a search field). */
  headerExtra?: ReactNode
  children?: ReactNode
  className?: string
  contentProps?: ComponentPropsWithRef<'section'>
}


/**
 * The simple path:
 *   <BottomSheet trigger="Open" title="Settings">…</BottomSheet>
 */
export function BottomSheet({
  trigger,
  title,
  description,
  variant = 'sheet',
  floating = false,
  width = variant === 'page' ? 'full' : 'card',
  leading,
  trailing,
  headerExtra,
  children,
  className,
  contentProps,
  ...rootProps
}: BottomSheetProps) {
  const root = variant === 'page' ? { recede: true, ...rootProps } : rootProps
  const bar = leading != null || trailing != null
  return (
    <Sheet.Root {...root}>
      {trigger != null && <Sheet.Trigger className="ybs-trigger">{trigger}</Sheet.Trigger>}
      <Sheet.Portal>
        {root.modal !== false && <Sheet.Backdrop />}
        <Sheet.View>
          <Sheet.Content
            {...contentProps}
            className={cx(width === 'full' && 'ybs-sheet-full', variant === 'page' && 'ybs-sheet-page', floating && 'ybs-sheet-floating', className, contentProps?.className)}
          >
            <Sheet.Header>
              <Sheet.Handle />
              {bar ? (
                <div className="ybs-bar">
                  <div className="ybs-leading">{leading}</div>
                  <Sheet.Title>{title}</Sheet.Title>
                  <div className="ybs-trailing">{trailing}</div>
                </div>
              ) : (
                <Sheet.Title>{title}</Sheet.Title>
              )}
              {description != null && <Sheet.Description>{description}</Sheet.Description>}
              {headerExtra}
            </Sheet.Header>
            <div className="ybs-body">{children}</div>
          </Sheet.Content>
        </Sheet.View>
      </Sheet.Portal>
    </Sheet.Root>
  )
}
