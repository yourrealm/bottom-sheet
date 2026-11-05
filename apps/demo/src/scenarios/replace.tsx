import { useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { log, logged } from '../debug'

/**
 * The next step replaces the sheet instead of stacking on it: Place -> Share. Two separate sheets; the place sheet is
 * `replaceable`, so opening Share closes it (onOpenChange reason 'replace') while Share opens. The dim stays steady,
 * and focus returns to "Show Café Mollan" in the end. Directions is rendered inside the place sheet, so it stacks on
 * it instead (a sheet can't replace its own parent). More, in Share, stacks too (Share isn't replaceable).
 * Test switches: `?keep=1` (the app ignores the 'replace' close and keeps the place sheet open), `?page=1` (both are
 * page sheets: the page behind recedes), `?half=1` (Share rests at half height), `?modeless=1` (Share is non-modal),
 * `?both=1` (both open together on load: they stack).
 */
const MORE = ['Bluetooth', 'AirDrop', 'Slack', 'Telegram', 'Save to Files', 'Add to Reading List']
const TARGETS: [string, number][] = [
  ['Messages', 130], ['Mail', 210], ['WhatsApp', 140], ['Signal', 220], ['Notes', 45], ['Copy link', 0], ['Print', 260], ['More', 0],
]

function PlaceBody({ onShare }: { onShare: () => void }) {
  const [directions, setDirections] = useState(false)
  return (
    <div className="replace-body">
      <BottomSheet.Edge className="replace-photos" aria-hidden="true">
        {[30, 15, 200, 340].map((h) => <span key={h} style={{ ['--h' as string]: h }} />)}
      </BottomSheet.Edge>
      <p>Small café by the square. Cardamom buns until they run out, usually around two.</p>
      <dl className="replace-facts">
        <dt>Open</dt><dd>08:00–18:00</dd>
        <dt>Address</dt><dd>Stortorget 7, Stockholm</dd>
      </dl>
      <div className="replace-actions">
        <button className="secondary" onClick={() => setDirections(true)}>Directions</button>
        <button className="primary" onClick={onShare}>Share…</button>
      </div>
      {/* Inside the place sheet: it stacks on it, even though the place sheet is replaceable. */}
      <BottomSheet {...logged('replace-directions')} open={directions} onOpenChange={setDirections} title="Directions"
        footer={<BottomSheet.Close className="primary wide">Start</BottomSheet.Close>}>
        <ol className="replace-steps">
          <li>Head north on Stortorget, 40 m</li>
          <li>Turn left onto Köpmangatan, 120 m</li>
          <li>Café Mollan is on your right</li>
        </ol>
      </BottomSheet>
    </div>
  )
}

function ShareBody({ onPick }: { onPick: (t: string) => void }) {
  const [more, setMore] = useState(false)
  return (
    <ul className="replace-targets">
      {TARGETS.map(([name, hue]) => (
        <li key={name}>
          <button onClick={() => (name === 'More' ? setMore(true) : onPick(name))}>
            <span className="replace-icon" style={{ ['--h' as string]: hue, ...(hue === 0 ? { filter: 'grayscale(1)' } : {}) }} />
            {name}
          </button>
        </li>
      ))}
      {/* Share isn't replaceable: More stacks on top, and Share recedes behind it. */}
      <BottomSheet {...logged('replace-more')} open={more} onOpenChange={setMore} title="More apps">
        <ul className="replace-more">
          {MORE.map((name) => (
            <li key={name}>
              <button onClick={() => { setMore(false); onPick(name) }}>{name}</button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </ul>
  )
}

export function Replace({ autoOpen }: { autoOpen: boolean }) {
  const [toast, setToast] = useState<string | null>(null)
  const say = (t: string) => {
    setToast(t)
    setTimeout(() => setToast(null), 2000)
  }
  // Each sheet has its own state, as if they lived in different components. Opening Share is all it takes: the place
  // sheet closes itself (its onOpenChange gets reason 'replace').
  const q = new URLSearchParams(location.search)
  const flag = (k: string) => q.get(k) === '1'
  const [place, setPlace] = useState(autoOpen || flag('both'))
  const [share, setShare] = useState(flag('both'))
  const variant = flag('page') ? 'page' : undefined

  return (
    <div className="page-pad replace-page">
      <p className="muted">
        Share takes the place sheet's spot instead of stacking on it: two separate sheets, the place sheet{' '}
        <code>replaceable</code>. Directions and More open sheets stacked on top as usual.
      </p>
      <button className="primary wide" onClick={() => setPlace(true)}>Show Café Mollan</button>
      {toast && <div className="toast" role="status">{toast}</div>}

      <BottomSheet
        {...logged('replace-place')}
        replaceable
        open={place}
        onOpenChange={(o, d) => {
          log(`replace-place: onOpenChange ${o} ${d.reason}`)
          if (!(flag('keep') && d.reason === 'replace')) setPlace(o)
        }}
        variant={variant}
        title="Café Mollan"
        eyebrow="Gamla stan"
      >
        <PlaceBody onShare={() => setShare(true)} />
      </BottomSheet>
      <BottomSheet
        {...logged('replace-share')}
        open={share}
        onOpenChange={(o, d) => {
          log(`replace-share: onOpenChange ${o} ${d.reason}`)
          setShare(o)
        }}
        variant={variant}
        detents={flag('half') ? [0.5] : undefined}
        modal={!flag('modeless')}
        title="Share"
        eyebrow="Café Mollan"
      >
        <ShareBody
          onPick={(t) => {
            say(`Shared with ${t}`)
            setShare(false)
          }}
        />
      </BottomSheet>
    </div>
  )
}
