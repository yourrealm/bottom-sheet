/**
 * A resting position.
 * - `'closed'` and `'full'` are always available (`'closed'` only while the sheet is dismissible).
 * - A number is a fraction (0..1) of the available height that is visible, e.g. `0.5`.
 * - Any other string is a CSS length of visible sheet, e.g. `'76px'`, `'40dvh'`, `'min(320px, 50dvh)'`.
 */
// `string & {}` keeps editor completion for the literals while accepting any CSS length.
export type Detent = 'closed' | 'full' | number | (string & {})

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
