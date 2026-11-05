/**
 * Soft scroll edges (`/styled` `scrollEdge="soft"`): the body fades out where it meets the header and the footer, so
 * they need no fill. A mask moves with its element, and the body scrolls (in the sheet's one scroller, or in the
 * dialog's sheet), so CSS alone can't know where the header is over it. This publishes the edges in the body's own
 * coordinates (px from its top) on the root; styled.css turns them into the mask's fade lines.
 *
 * - `--ybs-edge-top`: the header's bottom edge (0 when nothing is under it)
 * - `--ybs-edge-top-start`: the header's top edge (for fading behind the header)
 * - `--ybs-edge-bottom`: the footer's top edge, or `bottom` without a footer
 * - `--ybs-edge-bottom-end`: the footer's bottom edge, or `bottom` (for fading behind the footer)
 * - `--ybs-edge-below`: how much of the body is hidden past `--ybs-edge-bottom`
 *
 * Internal: the names may change. Works with a sticky header, the footer's translate, a covered sheet's scale and a
 * detached drag's transform (all are in the rects). `bottom` is the visible bottom in client coordinates (the screen
 * for a sheet, the dialog's own bottom for a dialog).
 */
export function softEdge(root: HTMLElement, sheet: HTMLElement, bottom: number) {
  if (!sheet.hasAttribute('data-ybs-soft-edge')) return
  const body = sheet.querySelector<HTMLElement>('[data-ybs-body]')
  if (!body) return
  const b = body.getBoundingClientRect()
  const header = sheet.querySelector<HTMLElement>('[data-ybs-header]')?.getBoundingClientRect()
  const footer = sheet.querySelector<HTMLElement>('[data-ybs-footer]')?.getBoundingClientRect()
  const scale = body.offsetHeight > 0 ? b.height / body.offsetHeight : 1 // a covered or fading-in sheet is scaled
  const top = header ? Math.max(0, (header.bottom - b.top) / scale) : 0
  const topStart = header ? (header.top - b.top) / scale : 0
  const edgeBottom = ((footer ? footer.top : bottom) - b.top) / scale
  const end = ((footer ? Math.min(footer.bottom, bottom) : bottom) - b.top) / scale
  const below = Math.max(0, body.offsetHeight - edgeBottom)
  root.style.setProperty('--ybs-edge-top', `${top}px`)
  root.style.setProperty('--ybs-edge-top-start', `${Math.min(topStart, top - 1)}px`)
  root.style.setProperty('--ybs-edge-bottom', `${edgeBottom}px`)
  root.style.setProperty('--ybs-edge-below', `${below}px`)
  root.style.setProperty('--ybs-edge-bottom-end', `${Math.max(end, edgeBottom + 1)}px`)
}
