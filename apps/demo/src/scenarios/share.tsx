import { useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { logged } from '../debug'
import { hues, initials, people } from '../data'

const APPS = [
  ['💬', 'Messages'], ['✉️', 'Mail'], ['📝', 'Notes'], ['🗂️', 'Files'], ['📌', 'Boards'], ['🖨️', 'Print'], ['☁️', 'Drive'],
]
const ACTIONS = ['Copy link', 'Add to album', 'Save to files', 'Duplicate', 'Hide', 'Edit details']

export function Share({ autoOpen }: { autoOpen: boolean }) {
  const [open, setOpen] = useState(autoOpen)
  const [done, setDone] = useState<string | null>(null)
  const act = (what: string) => {
    setOpen(false)
    setDone(what)
    setTimeout(() => setDone(null), 2000)
  }

  return (
    <div className="viewer">
      <img
        className="viewer-image"
        src={`${import.meta.env.BASE_URL}dog/toy.webp`}
        alt="A small dog holding a purple toy"
        width={1200}
        height={1184}
      />
      <div className="viewer-bar">
        <span className="muted">Today 06:42</span>
        <button className="primary" onClick={() => setOpen(true)}>Share</button>
      </div>
      {done && <div className="toast" role="status">{done}</div>}

      <BottomSheet {...logged('share')} open={open} onOpenChange={setOpen} detents={[]} title="Share photo" className="edge">
        <div className="share">
          <div className="share-row" aria-label="People">
            {people.slice(0, 10).map((p, i) => (
              <button key={p} className="share-target" onClick={() => act(`Sent to ${p}`)}>
                <span className="avatar big" style={{ ['--h' as string]: hues[i % hues.length] }}>{initials(p)}</span>
                {p.split(' ')[0]}
              </button>
            ))}
          </div>
          <div className="share-row" aria-label="Apps">
            {APPS.map(([icon, label]) => (
              <button key={label} className="share-target" onClick={() => act(`Shared to ${label}`)}>
                <span className="app-icon">{icon}</span>
                {label}
              </button>
            ))}
          </div>
          <ul className="action-list">
            {ACTIONS.map((a) => (
              <li key={a}>
                <button onClick={() => act(a)}>{a}</button>
              </li>
            ))}
          </ul>
        </div>
      </BottomSheet>
    </div>
  )
}
