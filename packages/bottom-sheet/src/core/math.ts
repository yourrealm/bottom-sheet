/**
 * A resting position.
 * - `'closed'` and `'full'` are always available (`'closed'` only while the sheet is dismissible).
 * - A number is a fraction (0..1) of the available height that is visible, e.g. `0.5`.
 * - `'header'` shows exactly the sheet's header (`Sheet.Header`), measured, e.g. a peek with just the title.
 * - `'header+footer'` shows the header and the footer (`Sheet.Footer`) right under it, e.g. a chat's title and its
 *   composer; the body stays covered. Without a footer it's the same as `'header'`.
 * - Any other string is a CSS length of visible sheet, e.g. `'76px'`, `'40dvh'`, `'min(320px, 50dvh)'`.
 */
// `string & {}` keeps editor completion for the literals while accepting any CSS length.
export type Detent = 'closed' | 'full' | 'header' | 'header+footer' | number | (string & {})

/** A detent resolved for the current layout: `top` is its scrollTop (= visible sheet height in px). */
export interface Stop {
  detent: Detent
  top: number
}

/** UIScrollView.DecelerationRate.normal. Used to project where a release would come to rest. */
export const DECELERATION = 0.998

/** A partial detent closer than this to `full` (as a fraction of full) is dropped as pointless. */
export const MIN_DETENT_GAP = 0.15

/**
 * WWDC18 "Designing Fluid Interfaces": where would motion end if it just decelerated?
 * @param position current scrollTop (px)
 * @param velocity px/s, positive = towards larger scrollTop
 */
export function project(position: number, velocity: number, d = DECELERATION): number {
  return position + (velocity / 1000) * (d / (1 - d))
}

/**
 * All resting positions for this layout, ascending: [closed], usable partials..., full.
 * A partial is usable when it is above 0 and well below full (MIN_DETENT_GAP); duplicates by position are dropped.
 * @param partials requested partial detents with their resolved positions
 * @param full scrollTop of the full detent = min(H, sheet height)
 * @param closable include `closed` (false for a sheet that can't be dismissed)
 */
export function buildStops(partials: readonly Stop[], full: number, closable = true): Stop[] {
  const usable = partials
    .filter((s) => s.detent !== 'closed' && s.detent !== 'full' && s.top > 0 && s.top < full * (1 - MIN_DETENT_GAP))
    .sort((a, b) => a.top - b.top)
    .filter((s, i, all) => i === 0 || Math.abs(s.top - all[i - 1]!.top) >= 1)
  return [...(closable ? [{ detent: 'closed' as Detent, top: 0 }] : []), ...usable, { detent: 'full', top: full }]
}

/** The stop nearest to `top`. */
export function nearestStop(top: number, stops: readonly Stop[]): Stop {
  let best = stops[0]!
  for (const s of stops) if (Math.abs(s.top - top) < Math.abs(best.top - top)) best = s
  return best
}

/** The stop resting exactly at `top` (±tolerance), or null when between stops / inside content. */
export function stopAt(top: number, stops: readonly Stop[], tolerance = 2): Stop | null {
  return stops.find((s) => Math.abs(s.top - top) < tolerance) ?? null
}

/**
 * The stop for a requested detent: itself when usable, otherwise the stop nearest to where it would have been.
 * @param rawTop where the requested detent would sit (px), used when it isn't a usable stop
 */
export function resolveStop(d: Detent, rawTop: number, stops: readonly Stop[]): Stop {
  return stops.find((s) => s.detent === d) ?? nearestStop(rawTop, stops)
}

/**
 * CSS-style cubic-bezier easing (x1, y1, x2, y2 within 0..1 on x): returns progress -> eased progress.
 * Solves x(t) = k by Newton's method with a bisection fallback.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (k: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const x = (t: number) => ((ax * t + bx) * t + cx) * t
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  const y = (t: number) => ((ay * t + by) * t + cy) * t
  return (k: number) => {
    if (k <= 0) return 0
    if (k >= 1) return 1
    let t = k
    for (let i = 0; i < 8; i++) {
      const err = x(t) - k
      if (Math.abs(err) < 1e-6) return y(t)
      const d = dx(t)
      if (Math.abs(d) < 1e-6) break
      t -= err / d
    }
    let lo = 0, hi = 1
    t = k
    for (let i = 0; i < 40; i++) {
      const v = x(t)
      if (Math.abs(v - k) < 1e-6) break
      if (v < k) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return y(t)
  }
}

/** Material 3 "emphasized decelerate": for things arriving (a sheet opening or moving up). */
export const easeDecelerate = cubicBezier(0.05, 0.7, 0.1, 1)
/** Material 3 "emphasized accelerate": for things leaving (a sheet closing or moving down). */
export const easeAccelerate = cubicBezier(0.3, 0, 0.8, 0.15)
