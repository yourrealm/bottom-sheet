import { useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { log, logged } from '../debug'

type Detent = 'header' | 0.5 | 'full'

const FAVOURITES = [
  { icon: '🏠', label: 'Home', hint: '12 min' },
  { icon: '💼', label: 'Work', hint: '24 min' },
  { icon: '☕', label: 'Café', hint: '4 min' },
  { icon: '🏋️', label: 'Gym', hint: '9 min' },
  { icon: '⛴️', label: 'Ferry', hint: '15 min' },
  { icon: '＋', label: 'Add', hint: '' },
]
const RECENTS: [icon: string, name: string, where: string][] = [
  ['☕', 'Hallonbacken Café', 'Strandvägen 14'],
  ['🍞', 'Bakery', 'Södra gatan 3'],
  ['📚', 'Library', 'Torget 1'],
  ['🌳', 'Park', 'Parkvägen'],
  ['⛴️', 'Ferry terminal', 'Hamnen'],
  ['🏛️', 'Museum of Light', 'Slottsbacken 8'],
  ['🍕', 'Pizzeria Nonna', 'Kvarngatan 21'],
  ['🏊', 'Open-air pool', 'Badvägen 2'],
]
const GUIDES: [title: string, places: number, hue: number][] = [
  ['Coffee with a view', 12, 30],
  ['Rainy day museums', 8, 210],
  ['Walks by the water', 15, 150],
  ['Late-night food', 10, 330],
]
const PINS = [
  { x: 22, y: 30, label: 'Bakery' },
  { x: 64, y: 22, label: 'Library' },
  { x: 48, y: 46, label: 'Café' },
  { x: 78, y: 58, label: 'Ferry' },
  { x: 30, y: 66, label: 'Park' },
]

/**
 * Floating (iOS 26), the Maps way: a search panel that never closes, floating over the map at a peek of its header,
 * half and full, attaching to the screen edges as it reaches full. Non-modal, so the map stays usable around it, and
 * it stays a sheet on desktop too (a map panel isn't a dialog).
 */
export function Floating(_: { autoOpen: boolean }) {
  const [detent, setDetent] = useState<Detent>('header')
  const [query, setQuery] = useState('')
  const recents = RECENTS.filter(([, name]) => name.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="map">
      <div className="map-water" />
      <div className="map-park" />
      <div className="map-road r1" />
      <div className="map-road r2" />
      <div className="map-road r3" />
      {PINS.map((p) => (
        <button
          key={p.label}
          className="pin"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          onClick={() => {
            setQuery(p.label)
            setDetent(0.5)
          }}
        >
          <span>•</span>
          {p.label}
        </button>
      ))}

      <BottomSheet
        {...logged('floating')}
        open
        modal={false}
        dismissible={false}
        floating
        className="map-panel"
        detents={['header', 0.5]}
        detent={detent}
        onDetentChange={(d) => {
          log(`floating: onDetentChange ${String(d)}`)
          setDetent(d as Detent)
        }}
        title="Explore"
        headerExtra={
          <input
            className="search"
            type="search"
            placeholder="Search places"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setDetent('full')}
            aria-label="Search places"
          />
        }
      >
        <h3 className="section">Favourites</h3>
        <BottomSheet.Edge className="favs" aria-label="Favourites">
          {FAVOURITES.map((f) => (
            <button key={f.label} className="fav" onClick={() => setQuery(f.label === 'Add' ? '' : f.label)}>
              <span className="fav-icon">{f.icon}</span>
              <strong>{f.label}</strong>
              <span className="muted small">{f.hint || ' '}</span>
            </button>
          ))}
        </BottomSheet.Edge>

        <h3 className="section">Recents</h3>
        <ul className="recents">
          {recents.map(([icon, name, where]) => (
            <li key={name}>
              <button onClick={() => setDetent(0.5)}>
                <span className="recent-icon">{icon}</span>
                <span>
                  <strong>{name}</strong>
                  <span className="muted small">{where}</span>
                </span>
              </button>
            </li>
          ))}
          {recents.length === 0 && <li className="muted small">No recents match “{query}”.</li>}
        </ul>

        <h3 className="section">Guides</h3>
        <div className="guides">
          {GUIDES.map(([title, n, hue]) => (
            <article key={title} className="guide" style={{ ['--h' as string]: hue }}>
              <div className="guide-img" />
              <strong>{title}</strong>
              <span className="muted small">{n} places</span>
            </article>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
