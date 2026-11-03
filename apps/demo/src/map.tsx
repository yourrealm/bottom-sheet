import { lazy, Suspense, type ReactNode } from 'react'

export type Pin = {
  label: string
  /** [lng, lat] on the real map. */
  at: [number, number]
  /** Position on the drawn stand-in map, in % of its box. */
  x: number
  y: number
  main?: boolean
}

export type MapProps = {
  pins: Pin[]
  renderPin: (pin: Pin) => ReactNode
  center: [number, number]
  zoom: number
  /** Share of the map's height the sheet covers at rest; the view is centred above it. */
  bottomInset?: number
}

const RealMap = lazy(() => import('./real-map'))

/**
 * A real map (MapLibre + OpenFreeMap tiles, OSM data) by default. Automated browsers (e2e) and `?map=fake` get the
 * drawn stand-in: no network, no WebGL, the same `.pin` buttons. `?map=real` forces the real one.
 */
const mapParam = new URLSearchParams(location.search).get('map')
const fake = mapParam === 'fake' || (navigator.webdriver && mapParam !== 'real')

export function MapView({ children, ...props }: MapProps & { children?: ReactNode }) {
  return (
    <div className="map">
      {fake ? (
        <FakeMap {...props} />
      ) : (
        <Suspense fallback={null}>
          <RealMap {...props} />
        </Suspense>
      )}
      {children}
    </div>
  )
}

function FakeMap({ pins, renderPin }: MapProps) {
  return (
    <>
      <div className="map-water" />
      <div className="map-park" />
      <div className="map-road r1" />
      <div className="map-road r2" />
      <div className="map-road r3" />
      {pins.map((p) => (
        <div key={p.label} className="pin-at" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
          {renderPin(p)}
        </div>
      ))}
    </>
  )
}
