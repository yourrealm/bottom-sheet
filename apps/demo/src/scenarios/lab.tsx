import { useEffect, useRef, useState } from 'react'
import { Sheet } from '@yourrealm/bottom-sheet'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { logged, log } from '../debug'

/**
 * Stable test page used by scripts/android-suite.sh and Playwright. Keep its layout
 * steady: device scripts use fixed coordinates.
 * Test switches: `?short=1` (short content), `?modal=0` (non-modal), `?back=1` (closeOnBack on),
 * `?late=1` (a headless sheet with no header whose content arrives after opening; with `&container=1` it is
 * portalled into an element of the page), `?untitled=1` (a sheet named by aria-label, no visible title),
 * `?float=1` (floating, a header peek and a footer), `?nodialog=1` (opts out of the app-wide dialog),
 * `?dismissible=0`. The confirm sheet moved to its own demo, `#/confirm`.
 */
export function Lab({ autoOpen }: { autoOpen: boolean }) {
  const params = new URLSearchParams(location.search)
  const [short, setShort] = useState(params.get('short') === '1')
  const [open, setOpen] = useState(autoOpen)
  // `?grow=1`: a row is added every 500ms while open (streamed content; issue #13), logging scrollTop each time.
  const grow = params.get('grow') === '1'
  // `&pin=1`: like a chat, keep the reader at the end when they were there before the row arrived.
  const pin = params.get('pin') === '1'
  const [extra, setExtra] = useState(0)
  const atEnd = useRef(false)
  useEffect(() => {
    if (!grow || !open) return
    const id = setInterval(() => {
      const s = document.querySelector<HTMLElement>('[data-ybs-scroller]')
      if (s) atEnd.current = s.scrollTop >= s.scrollHeight - s.clientHeight - 2
      setExtra((n) => {
        log(`lab: grow ${n + 1} st=${s ? Math.round(s.scrollTop) : '-'} end=${atEnd.current}`)
        return n + 1
      })
    }, 500)
    return () => clearInterval(id)
  }, [grow, open])
  useEffect(() => {
    const s = document.querySelector<HTMLElement>('[data-ybs-scroller]')
    if (!pin || !s || !atEnd.current) return
    s.scrollTo({ top: s.scrollHeight })
    const before = Math.round(s.scrollTop)
    requestAnimationFrame(() => log(`lab: pinned ${before} -> next frame ${Math.round(s.scrollTop)}`))
  }, [extra, pin])
  if (params.get('late') === '1') return <LateLab />
  if (params.get('untitled') === '1') return <UntitledLab />
  if (params.get('float') === '1') return <FloatLab />

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
        // `?full=1`: open at full (with `&short=1&grow=1&pin=1`: a chat that starts short and grows; issue #13).
        initialDetent={params.get('full') === '1' ? 'full' : undefined}
        modal={params.get('modal') !== '0'}
        dismissible={params.get('dismissible') !== '0'}
        closeOnBack={params.get('back') === '1' ? true : undefined}
        // `?nodialog=1`: this sheet opts out of the app-wide dialog (BottomSheet.Provider in main.tsx).
        dialog={params.get('nodialog') === '1' ? false : undefined}
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
        {Array.from({ length: (short ? 4 : 60) + extra }, (_, i) => (
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

/** No visible title: an action list named by aria-label. The header shows just the grabber. */
function UntitledLab() {
  const [open, setOpen] = useState(true)
  return (
    <div className="lab">
      <button className="primary" onClick={() => setOpen(true)}>Open actions</button>
      <BottomSheet {...logged('untitled')} open={open} onOpenChange={setOpen} aria-label="Photo options"
        footer={<BottomSheet.Close className="secondary wide">Cancel</BottomSheet.Close>}>
        <ul className="menu">
          {['Copy link', 'Add to album', 'Duplicate', 'Hide'].map((a) => (
            <li key={a}><button className="menu-row" onClick={() => setOpen(false)}>{a}</button></li>
          ))}
        </ul>
      </BottomSheet>
    </div>
  )
}

/** Floating (iOS 26), resting at a peek of exactly the header, with a footer: both must clear the bottom gap. */
function FloatLab() {
  const [open, setOpen] = useState(true)
  return (
    <div className="lab">
      <button className="primary" onClick={() => setOpen(true)}>Open floating</button>
      <p className="filler">{'Background page text. '.repeat(400)}</p>
      <BottomSheet {...logged('float')} open={open} onOpenChange={setOpen} floating detents={['header', 0.5]}
        initialDetent="header" title="Floating" description="Peek, half, full"
        footer={<button className="primary wide" onClick={() => setOpen(false)}>Done</button>}>
        {Array.from({ length: 40 }, (_, i) => <div key={i} className="row">Row {i + 1}</div>)}
      </BottomSheet>
    </div>
  )
}


