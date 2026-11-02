import { useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { Icon, type IconName } from '../icons'
import { log, logged } from '../debug'

type Detent = 'header' | 0.5 | 'full'

const FAVOURITES: { icon: IconName; label: string; hint: string; hue: number }[] = [
  { icon: 'house', label: 'Home', hint: '12 min', hue: 210 },
  { icon: 'briefcaseBusiness', label: 'Work', hint: '24 min', hue: 25 },
  { icon: 'coffee', label: 'Café', hint: '4 min', hue: 30 },
  { icon: 'dumbbell', label: 'Gym', hint: '9 min', hue: 340 },
  { icon: 'ship', label: 'Ferry', hint: '15 min', hue: 195 },
  { icon: 'plus', label: 'Add', hint: '', hue: -1 },
]
const RECENTS: [icon: IconName, name: string, where: string, hue: number][] = [
  ['coffee', 'Hallonbacken Café', 'Strandvägen 14', 30],
  ['croissant', 'Bakery', 'Södra gatan 3', 40],
  ['library', 'Library', 'Torget 1', 260],
  ['trees', 'Park', 'Parkvägen', 130],
  ['ship', 'Ferry terminal', 'Hamnen', 195],
  ['landmark', 'Museum of Light', 'Slottsbacken 8', 290],
  ['pizza', 'Pizzeria Nonna', 'Kvarngatan 21', 5],
  ['waves', 'Open-air pool', 'Badvägen 2', 200],
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
              <span className="fav-icon" style={f.hue < 0 ? undefined : { ['--h' as string]: f.hue }}>
                <Icon name={f.icon} size={24} />
              </span>
              <strong>{f.label}</strong>
              <span className="muted small">{f.hint || ' '}</span>
            </button>
          ))}
        </BottomSheet.Edge>

        <h3 className="section">Recents</h3>
        <ul className="recents">
          {recents.map(([icon, name, where, hue]) => (
            <li key={name}>
              <button onClick={() => setDetent(0.5)}>
                <span className="recent-icon" style={{ ['--h' as string]: hue }}>
                  <Icon name={icon} size={18} />
                </span>
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
