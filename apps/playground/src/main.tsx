import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Sheet as Headless, type Detent } from '@yourrealm/bottom-sheet'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import './playground.css'

const params = new URLSearchParams(location.search)

// Batch debug lines to the dev server (see vite.config.ts) so device runs can be read from the terminal.
let pending: string[] = []
let flushTimer: ReturnType<typeof setTimeout> | undefined
const TAB = Math.random().toString(36).slice(2, 6)
function sendLog(line: string) {
  if (document.hidden) return // stale background tabs would interleave
  pending.push(`${TAB} ${line}`)
  clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    const body = pending.join('\n')
    pending = []
    void fetch('/__log', { method: 'POST', body, keepalive: true }).catch(() => {})
  }, 100)
}
sendLog(`--- load ${location.search}`)

function Rows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="row">Row {i + 1}</div>
          {i === 2 && (
            <div className="hscroll">
              {Array.from({ length: 10 }, (_, j) => (
                <div key={j}>Card {j + 1}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

function App() {
  const [short, setShort] = useState(params.get('short') === '1')
  const [open, setOpen] = useState(params.get('open') === '1')
  const [detent, setDetent] = useState<Detent | null>(null)
  const [log, setLog] = useState<string[]>([])
  const note = (m: string) => {
    const line = `${(performance.now() / 1000).toFixed(2)} ${m}`
    sendLog(line)
    setLog((l) => [line, ...l].slice(0, 14))
  }

  return (
    <main className="page">
      <h1>@yourrealm/bottom-sheet</h1>
      <div className="controls">
        <button id="open-styled" onClick={() => setOpen(true)}>Open styled sheet</button>
        <Headless.Root detents={[0.4]}>
          <Headless.Trigger id="open-headless">Open headless sheet</Headless.Trigger>
          <Headless.Portal>
            <Headless.Backdrop className="hl-backdrop" />
            <Headless.View>
              <Headless.Content className="hl-sheet">
                <Headless.Header className="hl-header">
                  <Headless.Title>Headless</Headless.Title>
                  <Headless.Close>Done</Headless.Close>
                </Headless.Header>
                <Rows count={30} />
              </Headless.Content>
            </Headless.View>
          </Headless.Portal>
        </Headless.Root>
        <label>
          <input type="checkbox" checked={short} onChange={(e) => setShort(e.target.checked)} /> Short content
        </label>
      </div>
      <pre id="hud">
        open {String(open)} detent {String(detent)}
        {'\n'}
        {log.join('\n')}
      </pre>
      <p className="filler">{'Background page text. '.repeat(400)}</p>

      <BottomSheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          note(`onOpenChange ${o}`)
          if (!o) setDetent(null)
        }}
        onDetentChange={(d) => {
          setDetent(d)
          note(`onDetentChange ${d}`)
        }}
        debug={(m) => note(m)}
        title="Sheet"
        description="Drag, fling, scroll."
        headerExtra={<input className="search" placeholder="Search (keyboard test)" />}
      >
        <Rows count={short ? 4 : 60} />
      </BottomSheet>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
