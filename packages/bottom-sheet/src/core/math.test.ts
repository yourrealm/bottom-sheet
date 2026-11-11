import { describe, expect, it } from 'vitest'
import { buildStops, cubicBezier, easeAccelerate, easeDecelerate, nearestStop, project, resolveStop, type Stop, stopAt } from './math'

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
  it('drops partials at or above the full of a short sheet (fit content), or within a few px of it', () => {
    // sheet is 400px tall: 0.5 * 800 = 400 is full itself
    expect(ids(buildStops([frac(0.5, 800)], 400))).toEqual(['closed', 'full'])
    expect(ids(buildStops([frac(0.3, 800), frac(0.5, 800)], 400))).toEqual(['closed', 0.3, 'full'])
    expect(ids(buildStops([{ detent: '395px', top: 395 }], 400))).toEqual(['closed', 'full'])
  })
  it('keeps a partial close to the full of a short sheet (no percentage rule: the stops do not move with the content)', () => {
    // A chat showing its latest turn at the peek: 0.5 is 368 of a 735px screen, the content 413 tall.
    expect(ids(buildStops([frac(0.5, 735)], 413))).toEqual(['closed', 0.5, 'full'])
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

describe('cubicBezier', () => {
  it('matches the end points and is monotonic', () => {
    for (const ease of [easeDecelerate, easeAccelerate, cubicBezier(0.25, 0.1, 0.25, 1)]) {
      expect(ease(0)).toBe(0)
      expect(ease(1)).toBe(1)
      let prev = 0
      for (let k = 0.01; k <= 1; k += 0.01) {
        const v = ease(k)
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9)
        prev = v
      }
    }
  })
  it('linear when the control points lie on the diagonal', () => {
    const lin = cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3)
    for (const k of [0.1, 0.37, 0.5, 0.9]) expect(lin(k)).toBeCloseTo(k, 5)
  })
  it('decelerate front-loads the motion, accelerate back-loads it', () => {
    expect(easeDecelerate(0.25)).toBeGreaterThan(0.6)
    expect(easeAccelerate(0.5)).toBeLessThan(0.25)
  })
})
