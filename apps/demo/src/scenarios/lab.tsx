import { useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { logged, log } from '../debug'

/**
 * Stable test page used by scripts/android-suite.sh and Playwright. Keep its layout
 * steady: device scripts use fixed coordinates.
 */
export function Lab({ autoOpen }: { autoOpen: boolean }) {
  const params = new URLSearchParams(location.search)
  const [short, setShort] = useState(params.get('short') === '1')
  const [open, setOpen] = useState(autoOpen)

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
