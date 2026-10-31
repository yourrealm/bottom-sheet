import { describe, expect, it } from 'vitest'
import { buildStops, nearestStop, project, resolveStop, type Stop, stopAt } from './math'

const ids = (stops: Stop[]) => stops.map((s) => s.detent)
const frac = (f: number, H: number): Stop => ({ detent: f, top: H * f })

describe('project', () => {
  it('is the identity at zero velocity', () => {
    expect(project(300, 0)).toBe(300)
  })
  it('projects ~0.5s worth of travel at d=0.998', () => {
    expect(project(0, 1000)).toBeCloseTo(499, 0)
    expect(project(500, -2000)).toBeCloseTo(-498, 0)
  })
})

describe('buildStops', () => {
  it('keeps partials well below full, sorted and deduped', () => {
    expect(ids(buildStops([frac(0.5, 800), frac(0.25, 800), frac(0.5, 800)], 800))).toEqual(['closed', 0.25, 0.5, 'full'])
  })
  it('drops partials within 15% of a short sheet (fit content)', () => {
    // sheet is 400px tall: 0.5 * 800 = 400 is not < 340
    expect(ids(buildStops([frac(0.5, 800)], 400))).toEqual(['closed', 'full'])
    expect(ids(buildStops([frac(0.3, 800), frac(0.5, 800)], 400))).toEqual(['closed', 0.3, 'full'])
  })
  it('ignores out-of-range fractions', () => {
    expect(ids(buildStops([0, 1, -1, 2].map((f) => frac(f, 800)), 800))).toEqual(['closed', 'full'])
  })
  it('mixes pixel detents with fractions', () => {
    expect(ids(buildStops([frac(0.5, 800), { detent: '76px', top: 76 }], 800))).toEqual(['closed', '76px', 0.5, 'full'])
  })
  it('leaves out closed for a sheet that cannot be dismissed', () => {
    expect(ids(buildStops([{ detent: '76px', top: 76 }], 800, false))).toEqual(['76px', 'full'])
  })
})

describe('positions', () => {
  const stops = buildStops([frac(0.5, 800)], 800)
  it('falls back to the nearest usable stop', () => {
    expect(resolveStop(0.5, 400, stops).top).toBe(400)
    expect(resolveStop(0.6, 480, stops).detent).toBe(0.5)
    expect(resolveStop(0.9, 720, stops).detent).toBe('full')
  })
  it('finds nearest and exact stops', () => {
    expect(nearestStop(150, stops).detent).toBe('closed')
    expect(nearestStop(500, stops).detent).toBe(0.5)
    expect(nearestStop(5000, stops).detent).toBe('full')
    expect(stopAt(401, stops)?.detent).toBe(0.5)
    expect(stopAt(1200, stops)).toBe(null)
  })
  it('never resolves to closed when the sheet cannot be dismissed', () => {
    const persistent = buildStops([{ detent: '76px', top: 76 }], 800, false)
    expect(nearestStop(0, persistent).detent).toBe('76px')
    expect(resolveStop('closed', 0, persistent).detent).toBe('76px')
  })
})
