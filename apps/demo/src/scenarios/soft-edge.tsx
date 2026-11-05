import { useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { logged } from '../debug'

/**
 * Prototype for issue #2: soft scroll edges (`scrollEdge="soft"`). Content fades out before it reaches the header and
 * the footer, so they need no fill, and a translucent sheet colour doesn't stack into darker bands. The sheet is
 * non-modal, so the switches on the page stay usable while it's open.
 * URL: `?edge=line&glass=0&blur=0&behindHeader=1&behind=1&fade=24`.
 * Known limit: the mask is placed from scroll events, so a fast fling shows content past it for a frame or two.
 */
const ALBUMS: [name: string, count: number, hue: number][] = [
  ['Recents', 1284, 210], ['Favourites', 96, 340], ['Summer 2026', 412, 35], ['Archipelago', 188, 190],
  ['Lofoten', 241, 230], ['Family', 530, 20], ['Food', 77, 50], ['Northern lights', 64, 150], ['City walks', 203, 265],
  ['Screenshots', 318, 0], ['Selfies', 45, 300], ['Videos', 129, 180], ['Panoramas', 18, 100], ['Portraits', 57, 320],
  ['Live photos', 233, 75], ['Bursts', 12, 250], ['Hidden', 4, 0], ['Recently deleted', 31, 0], ['Imports', 88, 200],
  ['Shared with Sam', 146, 120], ['Garden', 52, 95], ['Winter 2025', 301, 205],
]
const PHOTOS = Array.from({ length: 24 }, (_, i) => (i * 47 + 20) % 360)

export function SoftEdge({ autoOpen }: { autoOpen: boolean }) {
  const q = new URLSearchParams(location.search)
  const [soft, setSoft] = useState(q.get('edge') !== 'line')
  const [glass, setGlass] = useState(q.get('glass') !== '0')
  const [blur, setBlur] = useState(q.get('blur') !== '0')
  const [behindHeader, setBehindHeader] = useState(q.get('behindHeader') === '1')
  const [behind, setBehind] = useState(q.get('behind') === '1')
  const [fade, setFade] = useState(Number(q.get('fade') ?? 24))
  const [open, setOpen] = useState(true)
  const [album, setAlbum] = useState<string | null>(null)
  void autoOpen

  const toggle = (label: string, on: boolean, set: (v: boolean) => void, disabled = false) => (
    <label className={`switch-row${disabled ? ' off' : ''}`}>
      {label}
      <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(e) => set(e.target.checked)} />
    </label>
  )

  return (
    <div className="soft-page">
      <p className="muted small">
        Prototype: content fades out at the header and footer instead of sliding under a filled bar, so the sheet can be
        see-through. Flip the switches while the sheet is open.
      </p>
      <section className="panel soft-panel">
        <h3 className="section">Look</h3>
        {toggle('Soft edge', soft, setSoft)}
        {toggle('Fade behind header', behindHeader, setBehindHeader, !soft)}
        {toggle('Fade behind footer', behind, setBehind, !soft)}
        <label className={`soft-range${soft ? '' : ' off'}`}>
          Fade
          <input type="range" min={8} max={120} step={4} value={fade} disabled={!soft} onChange={(e) => setFade(Number(e.target.value))} />
          <output>{fade}px</output>
        </label>
        {toggle('Translucent', glass, setGlass)}
        {toggle('Blur', blur, setBlur, !glass)}
        {!open && <button className="primary wide" onClick={() => setOpen(true)}>Show albums</button>}
      </section>

      <h3 className="section">{album ?? 'Recents'}</h3>
      <div className="soft-grid" aria-hidden="true">
        {PHOTOS.map((h, i) => (
          <span key={i} style={{ ['--h' as string]: h }} />
        ))}
      </div>

      <BottomSheet
        {...logged('soft')}
        open={open}
        onOpenChange={setOpen}
        modal={false}
        detents={['header', 0.5]}
        initialDetent={0.5}
        title="Albums"
        description={`${ALBUMS.length} albums`}
        scrollEdge={soft ? 'soft' : 'line'}
        className={[glass && 'glass', glass && blur && 'blur', behind && 'fade-behind', behindHeader && 'fade-behind-header']
          .filter(Boolean)
          .join(' ')}
        contentProps={{ style: { ['--ybs-soft-fade' as string]: `${fade}px` } }}
        footer={<>
          <button className="secondary" onClick={() => setAlbum(null)}>Recents</button>
          <button className="primary" onClick={() => setOpen(false)}>Done</button>
        </>}
      >
        <ul className="soft-list">
          {ALBUMS.map(([name, count, hue]) => (
            <li key={name}>
              <button onClick={() => setAlbum(name)} aria-pressed={album === name}>
                <span className="soft-thumb" style={{ ['--h' as string]: hue }} />
                <span className="soft-name">
                  {name}
                  <span className="muted small">{count.toLocaleString('en')} items</span>
                </span>
                <span className="muted" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </div>
  )
}
