import { useEffect, useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { Icon } from '../icons'
import { logged } from '../debug'
import { useDialogs } from '../media'
import { reviews } from '../data'
import { MapView, type Pin } from '../map'

const REVIEWS = reviews(14)
// Around Strandvägen, Stockholm. The map isn't centred on the café on a narrow phone (it sits left of centre), so the
// pins stay within ~0.004° of it (a phone shows about ±0.007° across, measured on a 1080px-wide Android).
const CAFE: [number, number] = [18.0812, 59.3329]
const PINS: Pin[] = [
  { at: [18.079, 59.3358], x: 22, y: 30, label: 'Bakery' },
  { at: [18.0852, 59.3352], x: 64, y: 22, label: 'Library' },
  { at: CAFE, x: 48, y: 46, label: 'Hallonbacken Café', main: true },
  { at: [18.0775, 59.3318], x: 78, y: 58, label: 'Ferry' },
  { at: [18.0858, 59.3314], x: 30, y: 66, label: 'Park' },
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
    <MapView
      pins={PINS}
      center={CAFE}
      zoom={14.3}
      bottomInset={asDialog ? 0 : 0.35}
      renderPin={(p) => (
        <button className={`pin${p.main ? ' main' : ''}`} onClick={() => p.main && setOpen(true)}>
          <span>{p.main ? <Icon name="coffee" size={13} strokeWidth={2.2} /> : '•'}</span>
          {p.label}
        </button>
      )}
    >
      {asDialog && !open && <p className="map-hint">Click the café to see its details</p>}

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
            <dd>Strandvägen 14, Stockholm</dd>
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
    </MapView>
  )
}
