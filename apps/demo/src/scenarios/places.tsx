import { useEffect, useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { Icon } from '../icons'
import { logged } from '../debug'
import { useDialogs } from '../media'
import { reviews } from '../data'

const REVIEWS = reviews(14)
const PINS = [
  { x: 22, y: 30, label: 'Bakery' },
  { x: 64, y: 22, label: 'Library' },
  { x: 48, y: 46, label: 'Hallonbacken Café', main: true },
  { x: 78, y: 58, label: 'Ferry' },
  { x: 30, y: 66, label: 'Park' },
]

/** A peek over the map on a phone, opening on load. As a dialog it would cover the map, so there it waits for the café pin. */
export function Places({ autoOpen }: { autoOpen: boolean }) {
  const asDialog = useDialogs()
  const [open, setOpen] = useState(autoOpen || !asDialog)
  // Switched to sheets (the top-bar switch, a narrower window): show the peek again.
  useEffect(() => {
    if (!asDialog) setOpen(true)
  }, [asDialog])
  return (
    <div className="map">
      <div className="map-water" />
      <div className="map-park" />
      <div className="map-road r1" />
      <div className="map-road r2" />
      <div className="map-road r3" />
      {asDialog && !open && <p className="map-hint">Click the café to see its details</p>}
      {PINS.map((p) => (
        <button
          key={p.label}
          className={`pin${p.main ? ' main' : ''}`}
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          onClick={() => p.main && setOpen(true)}
        >
          <span>{p.main ? <Icon name="coffee" size={13} strokeWidth={2.2} /> : '•'}</span>
          {p.label}
        </button>
      ))}

      <BottomSheet
        {...logged('places')}
        open={open}
        onOpenChange={setOpen}
        detents={[0.35]}
        floating={new URLSearchParams(location.search).get('floating') !== '0'}
        title="Hallonbacken Café"
        description="Café · Bakery · 350 m · Open until 18:00"
      >
        <div className="place">
          <div className="rating">
            <strong>4.6</strong> <span className="stars">★★★★★</span> <span className="muted">(812 reviews)</span>
          </div>
          <div className="actions">
            {(
              [
                ['navigation', 'Directions'],
                ['phone', 'Call'],
                ['bookmark', 'Save'],
                ['share', 'Share'],
              ] as const
            ).map(([icon, label]) => (
              <button key={label} className="action">
                <Icon name={icon} />
                {label}
              </button>
            ))}
          </div>
          <BottomSheet.Edge className="photos" aria-label="Photos">
            {[30, 12, 200, 45, 330, 150, 280].map((h, i) => (
              <div key={i} className="photo" style={{ ['--h' as string]: h }} />
            ))}
          </BottomSheet.Edge>
          <dl className="info">
            <dt>Hours</dt>
            <dd>Mon–Fri 07:30–18:00 · Sat–Sun 09:00–17:00</dd>
            <dt>Address</dt>
            <dd>Strandvägen 14, Lillholmen</dd>
            <dt>Good to know</dt>
            <dd>Outdoor seating · Wi-Fi · Dog friendly · Card only</dd>
          </dl>
          <h3 className="section">Reviews</h3>
          {REVIEWS.map((r) => (
            <article key={r.id} className="review">
              <div className="avatar" style={{ ['--h' as string]: r.hue }}>
                {r.name[0]}
              </div>
              <div>
                <div className="review-head">
                  <strong>{r.name}</strong> <span className="stars small">{'★'.repeat(r.stars)}</span>
                  <span className="muted"> · {r.when}</span>
                </div>
                <p>{r.text}</p>
              </div>
            </article>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
