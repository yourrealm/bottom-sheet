import type { ComponentPropsWithRef, ReactNode } from 'react'
import * as Base from '../react/sheet'
import { useStyle } from '../react/use-style'
import { styledCss } from './styles'

export type { Detent } from '../core/math'

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
export function BottomSheet({ trigger, title, description, headerExtra, children, className, contentProps, ...root }: BottomSheetProps) {
  return (
    <Sheet.Root {...root}>
      {trigger != null && <Sheet.Trigger className="ybs-trigger">{trigger}</Sheet.Trigger>}
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.View>
          <Sheet.Content {...contentProps} className={cx(className, contentProps?.className)}>
            <Sheet.Header>
              <Sheet.Handle />
              <Sheet.Title>{title}</Sheet.Title>
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
