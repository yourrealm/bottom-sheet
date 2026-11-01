import { useEffect, useState } from 'react'
import { Sheet } from '@yourrealm/bottom-sheet'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { logged, log } from '../debug'

/**
 * Stable test page used by scripts/android-suite.sh and Playwright. Keep its layout
 * steady: device scripts use fixed coordinates.
 * Test switches: `?short=1` (short content), `?modal=0` (non-modal), `?back=1` (closeOnBack on),
 * `?late=1` (a headless sheet with no header whose content arrives after opening; with `&container=1` it is
 * portalled into an element of the page).
 */
export function Lab({ autoOpen }: { autoOpen: boolean }) {
  const params = new URLSearchParams(location.search)
  const [short, setShort] = useState(params.get('short') === '1')
  const [open, setOpen] = useState(autoOpen)
  if (params.get('late') === '1') return <LateLab />

  return (
    <div className="lab">
      <div className="lab-controls">
        <button id="open-lab" className="primary" onClick={() => setOpen(true)}>Open sheet</button>
        <label>
          <input type="checkbox" checked={short} onChange={(e) => setShort(e.target.checked)} /> Short content
        </label>
      </div>
      <p className="filler">{'Background page text. '.repeat(400)}</p>
      <BottomSheet
        detents={[0.5]}
        modal={params.get('modal') !== '0'}
        closeOnBack={params.get('back') === '1' ? true : undefined}
        {...logged('lab')}
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          log(`lab: onOpenChange ${o}`)
        }}
        title="Sheet"
        className="edge"
        description="Drag, fling, scroll."
        headerExtra={<input className="search" placeholder="Search (keyboard test)" />}
      >
        {Array.from({ length: short ? 4 : 60 }, (_, i) => (
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
      </BottomSheet>
    </div>
  )
}

/** A headless sheet with nothing in it at first (lazy content, no header): it must wait for its content, not close. */
function LateLab() {
  const [open, setOpen] = useState(false)
  // `?container=1`: portal into an element of the page instead of <body>.
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const inContainer = new URLSearchParams(location.search).get('container') === '1'
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!open) return setLoaded(false)
    const t = setTimeout(() => setLoaded(true), 300)
    return () => clearTimeout(t)
  }, [open])
  return (
    <div className="lab">
      <Sheet.Root
        {...logged('late')}
        open={open}
        onOpenChange={(o, { reason }) => {
          setOpen(o)
          log(`late: onOpenChange ${o} ${reason}`)
        }}
      >
        <Sheet.Trigger id="open-late" className="primary">Open late sheet</Sheet.Trigger>
        <Sheet.Portal container={inContainer ? container : undefined}>
          <Sheet.View>
            <Sheet.Content aria-label="Late" style={{ background: 'white' }}>
              {loaded && <div style={{ height: 300, padding: 16 }}>Loaded</div>}
            </Sheet.Content>
          </Sheet.View>
        </Sheet.Portal>
      </Sheet.Root>
      <div id="late-portal" ref={setContainer} />
    </div>
  )
}
