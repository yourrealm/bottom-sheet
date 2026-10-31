/** A resting position. Numbers are fractions (0..1) of the available height that is visible. */
export type Detent = 'closed' | 'full' | number

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
 * The partial detents that are usable for this layout, ascending.
 * @param fractions requested partial detents (fractions of available height)
 * @param available available height H (px)
 * @param full scrollTop of the full detent = min(H, sheet height)
 */
export function usableDetents(fractions: readonly number[], available: number, full: number): number[] {
  return [...new Set(fractions)]
    .filter((f) => f > 0 && f < 1 && available * f < full * (1 - MIN_DETENT_GAP))
    .sort((a, b) => a - b)
}

/** scrollTop for a detent. Unusable numeric detents fall back to the nearest usable position. */
export function detentPosition(d: Detent, available: number, full: number, usable: readonly number[]): number {
  if (d === 'closed') return 0
  if (d === 'full') return full
  if (usable.includes(d)) return available * d
  return positionOf(nearestDetent(available * d, available, full, usable), available, full, usable)
}

function positionOf(d: Detent, available: number, full: number, usable: readonly number[]): number {
  return d === 'closed' ? 0 : d === 'full' ? full : available * d
}

/** All resting positions in order: closed, partials..., full. */
export function allDetents(usable: readonly number[]): Detent[] {
  return ['closed', ...usable, 'full']
}

/** The detent whose position is nearest to `top`. */
export function nearestDetent(top: number, available: number, full: number, usable: readonly number[]): Detent {
  let best: Detent = 'closed'
  let bestDist = Infinity
  for (const d of allDetents(usable)) {
    const dist = Math.abs(positionOf(d, available, full, usable) - top)
    if (dist < bestDist) {
      best = d
      bestDist = dist
    }
  }
  return best
}

/** The detent resting exactly at `top` (±tolerance), or null when between detents / inside content. */
export function detentAt(top: number, available: number, full: number, usable: readonly number[], tolerance = 2): Detent | null {
  for (const d of allDetents(usable)) {
    if (Math.abs(positionOf(d, available, full, usable) - top) < tolerance) return d
  }
  return null
}

/** Normalise a requested detent to one that exists for this layout. */
export function resolveDetent(d: Detent, available: number, full: number, usable: readonly number[]): Detent {
  if (d === 'closed' || d === 'full' || usable.includes(d)) return d
  return nearestDetent(available * d, available, full, usable)
}
