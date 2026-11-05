// The library's CSS, before our own.
import '@yourrealm/bottom-sheet/styled.css'
import { Fragment, StrictMode, useEffect, useState, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { BottomSheet, DIALOG_QUERY } from '@yourrealm/bottom-sheet/styled'
import { dialogSetting, subscribe } from './debug'
import { Places } from './scenarios/places'
import { Floating } from './scenarios/floating'
import { Lightbox } from './scenarios/lightbox'
import { Comments } from './scenarios/comments'
import { Product } from './scenarios/product'
import { Confirm } from './scenarios/confirm'
import { Share } from './scenarios/share'
import { Filters } from './scenarios/filters'
import { Playlist } from './scenarios/playlist'
import { Lab } from './scenarios/lab'
import { Settings } from './scenarios/settings'
import { Thousand } from './scenarios/thousand'
import { Persistent } from './scenarios/persistent'
import { Notes } from './scenarios/notes'
import { Icon } from './icons'
import { DialogSettingContext, useMedia } from './media'
import { Preview } from './previews'
import { QR_PATH, QR_SIZE } from './qr'
import './styles.css'

interface Scenario {
  id: string
  title: string
  blurb: string
  hue: number
  /** Non-modal: stays a sheet on desktop, so the Dialog/Sheet switch has nothing to do there. */
  modeless?: boolean
  Component: ComponentType<{ autoOpen: boolean }>
}

const SCENARIOS: Scenario[] = [
  { id: 'places', title: 'Place details', blurb: 'Peek over a map, expand into photos and reviews.', hue: 150, Component: Places },
  { id: 'floating', title: 'Floating (iOS 26)', blurb: 'A search panel floating over a map: header peek, half, full. Never closes.', hue: 190, modeless: true, Component: Floating },
  { id: 'comments', title: 'Comments', blurb: 'Long thread with a pinned composer. Try the keyboard.', hue: 220, Component: Comments },
  { id: 'product', title: 'Product options', blurb: 'Short sheet that fits its content.', hue: 25, Component: Product },
  { id: 'confirm', title: 'Confirm prompts', blurb: 'Delete, move, clear: an alert dialog that asks first and starts on Cancel.', hue: 0, Component: Confirm },
  { id: 'share', title: 'Share', blurb: 'Horizontal rows inside a vertical sheet.', hue: 285, Component: Share },
  { id: 'lightbox', title: 'Photo lightbox', blurb: 'Tap a photo: fullscreen on a phone (swipe down to close), a large dialog on desktop.', hue: 340, Component: Lightbox },
  { id: 'filters', title: 'Filters', blurb: 'Form controls, a slider and a sticky footer.', hue: 45, Component: Filters },
  { id: 'playlist', title: 'Playlist', blurb: 'Built from the headless parts, fully custom look.', hue: 320, Component: Playlist },
  { id: 'settings', title: 'Stacked settings', blurb: 'Sheets on sheets, three levels deep. The one below recedes.', hue: 200, Component: Settings },
  { id: 'thousand', title: '1000 sheets', blurb: 'A list of 1000 rows where every row owns its own sheet.', hue: 100, Component: Thousand },
  { id: 'persistent', title: 'Persistent (non-modal)', blurb: 'Never closes, peeks at 76px; the page behind stays usable.', hue: 260, modeless: true, Component: Persistent },
  { id: 'notes', title: 'New note (page sheet)', blurb: 'Opens straight to full, Cancel / Save header, full width on desktop. Try fullscreen.', hue: 50, Component: Notes },
  { id: 'lab', title: 'Lab', blurb: 'Plain test page used by the device scripts.', hue: 0, Component: Lab },
]

function useRoute() {
  const read = () => location.hash.replace(/^#\/?/, '')
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => {
      // Each demo starts at the top, like a router does. Kept from the overview, the scroll left Firefox Android's
      // toolbar hidden on a page one screen tall, with fixed elements (Playlist's "Up next") placed below the screen.
      window.scrollTo(0, 0)
      setRoute(read())
    }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return route
}

function DebugOverlay() {
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => subscribe(setLines), [])
  return (
    <pre className="hud" aria-hidden="true">
      {lines.join('\n')}
    </pre>
  )
}

function readDebug() {
  try {
    return new URLSearchParams(location.search).get('debug') === '1' || localStorage.getItem('ybs-debug') === '1'
  } catch {
    return false
  }
}

function saveDialog(on: boolean) {
  try {
    localStorage.setItem('ybs-dialog', on ? '1' : '0')
  } catch {}
}

function DialogSetting({ on, setOn }: { on: boolean; setOn: (on: boolean) => void }) {
  return (
    <label className="switch-row home-setting">
      <span>
        Dialog on desktop
        <span className="muted small" style={{ display: 'block' }}>Wide screen with a mouse: sheets open as centred dialogs.</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked)
          saveDialog(e.target.checked)
        }}
      />
    </label>
  )
}

/** In a demo's top bar on desktop: open the sheets as a dialog or as a sheet, to compare. */
function PresentationToggle({ on, setOn }: { on: boolean; setOn: (on: boolean) => void }) {
  const pick = (v: boolean) => {
    setOn(v)
    saveDialog(v)
  }
  return (
    <div className="present-toggle" role="group" aria-label="Open sheets as">
      <button aria-pressed={on} onClick={() => pick(true)}>Dialog</button>
      <button aria-pressed={!on} onClick={() => pick(false)}>Sheet</button>
    </div>
  )
}

function Install() {
  const cmd = 'pnpm add @yourrealm/bottom-sheet'
  const [status, setStatus] = useState<'' | 'Copied' | 'Couldn’t copy'>('')
  const show = (s: typeof status) => {
    setStatus(s)
    setTimeout(() => setStatus(''), 1500)
  }
  return (
    <div className="install">
      <code>{cmd}</code>
      <button
        aria-label="Copy install command"
        onClick={() => {
          if (!navigator.clipboard) return show('Couldn’t copy')
          navigator.clipboard.writeText(cmd).then(
            () => show('Copied'),
            () => show('Couldn’t copy'),
          )
        }}
      >
        <Icon name={status === 'Copied' ? 'check' : 'copy'} size={16} />
      </button>
      <span className="sr-only" role="status">
        {status}
      </span>
    </div>
  )
}

const POINTS = [
  'One native scroller: drag the sheet and scroll its content in the same gesture, with the OS momentum.',
  'Detents, stacking, a floating look, non-modal panels, the keyboard and Android back.',
  'A sheet on phones, a dialog on desktop. Headless parts or a finished preset.',
]

interface HomeProps {
  debug: boolean
  setDebug: (d: boolean) => void
  dialog: boolean
  setDialog: (d: boolean) => void
}

function Home({ debug, setDebug, dialog, setDialog }: HomeProps) {
  const desktop = useMedia(DIALOG_QUERY)
  return (
    <main className="home">
      <header className="intro">
        <h1>bottom-sheet</h1>
        <p className="lede">
          Native-feeling bottom sheets for the web, for React. The sheet and its content share <em>one</em> native
          scroller, so scrolling hands off to dragging mid-gesture.
        </p>
        <Install />
      </header>
      <section className="demos" aria-labelledby="demos-title">
        <h2 id="demos-title" className="section">Demos</h2>
        <ul className="cards">
          {SCENARIOS.map((s) => (
            <li key={s.id}>
              <a className="card" href={`#/${s.id}`} style={{ ['--h' as string]: s.hue }}>
                <Preview id={s.id} className="card-art" />
                <span className="card-text">
                  <strong>{s.title}</strong>
                  <span className="muted small">{s.blurb}</span>
                </span>
                <span className="chev" aria-hidden>
                  ›
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <aside className="more">
        <ul className="points">
          {POINTS.map((p) => (
            <li key={p}>
              <Icon name="check" size={16} />
              {p}
            </li>
          ))}
        </ul>
        <p className="links small">
          <a href="https://github.com/yourrealm/bottom-sheet">GitHub</a>
          <a href="https://www.npmjs.com/package/@yourrealm/bottom-sheet">npm</a>
          <span className="muted">MIT</span>
        </p>
        {desktop && (
          <figure className="qr">
            <svg viewBox={`-2 -2 ${QR_SIZE + 4} ${QR_SIZE + 4}`} role="img" aria-label="QR code for this demo site">
              <rect x={-2} y={-2} width={QR_SIZE + 4} height={QR_SIZE + 4} fill="#fff" />
              <path d={QR_PATH} fill="#111" shapeRendering="crispEdges" />
            </svg>
            <figcaption>
              <strong>Made for touch.</strong>
              <span className="muted small">Scan to try the demos on your phone.{' '}
                {dialog ? 'Here, the sheets open as dialogs.' : 'Here, they open as sheets too.'}
              </span>
            </figcaption>
          </figure>
        )}
        <div className="settings">
          {desktop && <DialogSetting on={dialog} setOn={setDialog} />}
          <label className="switch-row home-setting">
            Show debug log
            <input
              type="checkbox"
              role="switch"
              checked={debug}
              onChange={(e) => {
                setDebug(e.target.checked)
                try {
                  localStorage.setItem('ybs-debug', e.target.checked ? '1' : '0')
                } catch {}
              }}
            />
          </label>
        </div>
      </aside>
    </main>
  )
}

function App() {
  const route = useRoute()
  const [debug, setDebug] = useState(readDebug)
  const [dialog, setDialog] = useState(dialogSetting)
  const desktop = useMedia(DIALOG_QUERY)
  const scenario = SCENARIOS.find((s) => s.id === route)
  const autoOpen = new URLSearchParams(location.search).get('open') === '1'

  // `BottomSheet` is a dialog on desktop by default; the Provider carries the home page switch (`?dialog=0`).
  // `?provider=0` leaves it out, to see the plain defaults (BottomSheet dialog on, headless Sheet off).
  const Wrap = new URLSearchParams(location.search).get('provider') === '0' ? Fragment : BottomSheet.Provider
  return (
    // With no Provider, BottomSheet's own default applies: dialogs on.
    <DialogSettingContext.Provider value={Wrap === Fragment || dialog}>
    <Wrap {...(Wrap === Fragment ? {} : { dialog })}>
      {scenario ? (
        <div className="scenario" data-scenario={scenario.id} data-ybs-background="">
          <nav className="topbar">
            <a href="#/" className="back">
              <Icon name="chevronLeft" size={20} strokeWidth={2.2} />
              <span>Demos</span>
            </a>
            <span className="topbar-title">{scenario.title}</span>
            <span className="topbar-end">
              {desktop && Wrap !== Fragment && !scenario.modeless && <PresentationToggle on={dialog} setOn={setDialog} />}
            </span>
          </nav>
          <scenario.Component key={scenario.id} autoOpen={autoOpen} />
        </div>
      ) : (
        <Home debug={debug} setDebug={setDebug} dialog={dialog} setDialog={setDialog} />
      )}
      {debug && <DebugOverlay />}
    </Wrap>
    </DialogSettingContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
