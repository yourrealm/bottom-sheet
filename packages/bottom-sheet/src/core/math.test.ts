import { describe, expect, it } from 'vitest'
import { detentAt, detentPosition, nearestDetent, project, resolveDetent, usableDetents } from './math'

describe('project', () => {
  it('is the identity at zero velocity', () => {
    expect(project(300, 0)).toBe(300)
  })
  it('projects ~0.5s worth of travel at d=0.998', () => {
    expect(project(0, 1000)).toBeCloseTo(499, 0)
    expect(project(500, -2000)).toBeCloseTo(-498, 0)
  })
})

describe('usableDetents', () => {
  it('keeps partials well below full, sorted and deduped', () => {
    expect(usableDetents([0.5, 0.25, 0.5], 800, 800)).toEqual([0.25, 0.5])
  })
  it('drops partials within 15% of a short sheet (fit content)', () => {
    // sheet is 400px tall: 0.5 * 800 = 400 is not < 340
    expect(usableDetents([0.5], 800, 400)).toEqual([])
    expect(usableDetents([0.3, 0.5], 800, 400)).toEqual([0.3])
  })
  it('ignores out-of-range fractions', () => {
    expect(usableDetents([0, 1, -1, 2], 800, 800)).toEqual([])
  })
})

describe('positions', () => {
  const H = 800, full = 800, usable = [0.5]
  it('maps detents to scrollTop', () => {
    expect(detentPosition('closed', H, full, usable)).toBe(0)
    expect(detentPosition(0.5, H, full, usable)).toBe(400)
    expect(detentPosition('full', H, full, usable)).toBe(800)
  })
  it('falls back to the nearest usable detent', () => {
    expect(detentPosition(0.6, H, full, usable)).toBe(400)
    expect(resolveDetent(0.9, H, full, usable)).toBe('full')
  })
  it('finds nearest and exact detents', () => {
    expect(nearestDetent(150, H, full, usable)).toBe('closed')
    expect(nearestDetent(500, H, full, usable)).toBe(0.5)
    expect(nearestDetent(5000, H, full, usable)).toBe('full')
    expect(detentAt(401, H, full, usable)).toBe(0.5)
    expect(detentAt(1200, H, full, usable)).toBe(null)
  })
})
