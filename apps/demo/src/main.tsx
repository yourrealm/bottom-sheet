import { StrictMode, useEffect, useState, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { subscribe } from './debug'
import { Places } from './scenarios/places'
import { Comments } from './scenarios/comments'
import { Product } from './scenarios/product'
import { Share } from './scenarios/share'
import { Filters } from './scenarios/filters'
import { Playlist } from './scenarios/playlist'
import { Lab } from './scenarios/lab'
import { Settings } from './scenarios/settings'
import { Thousand } from './scenarios/thousand'
import { Persistent } from './scenarios/persistent'
import './styles.css'

interface Scenario {
  id: string
  title: string
  blurb: string
  icon: string
  hue: number
  Component: ComponentType<{ autoOpen: boolean }>
}

const SCENARIOS: Scenario[] = [
  { id: 'places', title: 'Place details', blurb: 'Peek over a map, expand into photos and reviews.', icon: '🗺️', hue: 150, Component: Places },
  { id: 'comments', title: 'Comments', blurb: 'Long thread with a pinned composer. Try the keyboard.', icon: '💬', hue: 220, Component: Comments },
  { id: 'product', title: 'Product options', blurb: 'Short sheet that fits its content.', icon: '👟', hue: 25, Component: Product },
  { id: 'share', title: 'Share', blurb: 'Horizontal rows inside a vertical sheet.', icon: '↗︎', hue: 285, Component: Share },
  { id: 'filters', title: 'Filters', blurb: 'Form controls, a slider and a sticky footer.', icon: '🎛️', hue: 45, Component: Filters },
  { id: 'playlist', title: 'Playlist', blurb: 'Built from the headless parts, fully custom look.', icon: '🎧', hue: 320, Component: Playlist },
  { id: 'settings', title: 'Stacked settings', blurb: 'Sheets on sheets, three levels deep. The one below recedes.', icon: '🗂️', hue: 200, Component: Settings },
  { id: 'thousand', title: '1000 sheets', blurb: 'A list of 1000 rows where every row owns its own sheet.', icon: '⚡️', hue: 100, Component: Thousand },
  { id: 'persistent', title: 'Persistent (non-modal)', blurb: 'Never closes, peeks at 76px; the page behind stays usable.', icon: '🧩', hue: 260, Component: Persistent },
  { id: 'lab', title: 'Lab', blurb: 'Plain test page used by the device scripts.', icon: '🧪', hue: 0, Component: Lab },
]

function useRoute() {
  const read = () => location.hash.replace(/^#\/?/, '')
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => setRoute(read())
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

function Home({ debug, setDebug }: { debug: boolean; setDebug: (d: boolean) => void }) {
  return (
    <main className="home">
      <header className="home-head">
        <h1>bottom-sheet</h1>
        <p>
          Native-feeling bottom sheets for the web. The sheet and its content share <em>one</em> native scroller, so
          scrolling hands off to dragging mid-gesture, with real momentum.
        </p>
        <p className="muted small">
          <a href="https://github.com/yourrealm/bottom-sheet">github.com/yourrealm/bottom-sheet</a> · MIT
        </p>
      </header>
      <ul className="cards">
        {SCENARIOS.map((s) => (
          <li key={s.id}>
            <a className="card" href={`#/${s.id}`} style={{ ['--h' as string]: s.hue }}>
              <span className="card-icon">{s.icon}</span>
              <span>
                <strong>{s.title}</strong>
                <span className="muted small">{s.blurb}</span>
              </span>
              <span className="chev">›</span>
            </a>
          </li>
        ))}
      </ul>
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
    </main>
  )
}

function App() {
  const route = useRoute()
  const [debug, setDebug] = useState(readDebug)
  const scenario = SCENARIOS.find((s) => s.id === route)
  const autoOpen = new URLSearchParams(location.search).get('open') === '1'

  return (
    <>
      {scenario ? (
        <div className="scenario" data-scenario={scenario.id}>
          <nav className="topbar">
            <a href="#/" className="back">‹ Demos</a>
            <span>{scenario.title}</span>
          </nav>
          <scenario.Component key={scenario.id} autoOpen={autoOpen} />
        </div>
      ) : (
        <Home debug={debug} setDebug={setDebug} />
      )}
      {debug && <DebugOverlay />}
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
