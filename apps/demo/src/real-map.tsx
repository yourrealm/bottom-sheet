import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AttributionControl, Map, Marker, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { MapProps } from './map'

// Bundled, MapLibre can't find its worker next to itself (it resolves it from import.meta.url).
setWorkerUrl(workerUrl)

const scheme = matchMedia('(prefers-color-scheme: dark)')
const styleUrl = () => `https://tiles.openfreemap.org/styles/${scheme.matches ? 'dark' : 'liberty'}`

/** Loaded on demand by MapView: MapLibre is ~1 MB, only the map demos need it. */
export default function RealMap({ pins, renderPin, center, zoom, bottomInset = 0 }: MapProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [hosts, setHosts] = useState<HTMLElement[]>([])

  useEffect(() => {
    const container = ref.current!
    const map = new Map({ container, style: styleUrl(), center, zoom, attributionControl: false })
    // Bottom corners sit under the sheet; the top is free (the demo's top bar is outside the map).
    map.addControl(new AttributionControl({ compact: true }), 'top-right')
    // A compact attribution starts expanded across the map; start it as the ⓘ (tapping it shows the credits).
    map.once('load', () =>
      container.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show'),
    )
    map.setPadding({ top: 0, left: 0, right: 0, bottom: container.clientHeight * bottomInset })
    map.setCenter(center)
    const els = pins.map((p) => {
      const el = document.createElement('div')
      new Marker({ element: el, anchor: 'bottom' }).setLngLat(p.at).addTo(map)
      return el
    })
    setHosts(els)
    const onScheme = () => map.setStyle(styleUrl())
    scheme.addEventListener('change', onScheme)
    return () => {
      scheme.removeEventListener('change', onScheme)
      map.remove()
      setHosts([])
    }
    // The view is set once; later prop changes don't move the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={ref} className="map-gl">
      {hosts.map((el, i) => createPortal(renderPin(pins[i]!), el, pins[i]!.label))}
    </div>
  )
}
