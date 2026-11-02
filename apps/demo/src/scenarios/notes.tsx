import { useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { Icon } from '../icons'
import { log, logged } from '../debug'
import { useDialogs } from '../media'

type Mode = 'page' | 'fullscreen'

/**
 * A task in a sheet: compose a note. `variant="page"` opens straight to full, spans the window on desktop
 * (the text stays in a centred column) and puts Cancel / title / Save in an iOS-style header bar.
 * The fullscreen version also covers the gap at the top; its corners square off as it arrives.
 */
export function Notes({ autoOpen }: { autoOpen: boolean }) {
  const startMode: Mode = new URLSearchParams(location.search).get('fullscreen') === '1' ? 'fullscreen' : 'page'
  const [open, setOpen] = useState<Mode | null>(autoOpen ? startMode : null)
  const [notes, setNotes] = useState<{ title: string; body: string }[]>([
    { title: 'Packing list', body: 'Rain shell, headlamp, the good socks, stove gas, two maps and a spare battery.' },
    { title: 'Book club', body: 'Thursday at Ines’s. Bring the cardamom buns, finish chapter 9 (no spoilers this time).' },
    { title: 'Ideas for the cabin', body: 'Paint the door green. Shelf over the window. A proper hook for wet jackets.' },
  ])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const mode = open ?? startMode
  // As a dialog, fullscreen looks the same as the page sheet: offer it only where it differs (phones, or sheets on).
  const dialogs = useDialogs()

  const save = () => {
    setNotes((n) => [{ title: title || 'Untitled', body }, ...n])
    setTitle('')
    setBody('')
    setOpen(null)
    log('notes: saved')
  }

  return (
    <div className="page-pad notes-page">
      <div className="notes-actions">
        <button className="primary" id="new-note" onClick={() => setOpen('page')}>
          New note
        </button>
        {!dialogs && (
          <button className="secondary" id="new-note-fullscreen" onClick={() => setOpen('fullscreen')}>
            Fullscreen
          </button>
        )}
      </div>
      {notes.length === 0 ? (
        <p className="muted">No notes yet.</p>
      ) : (
        <ul className="notes-list">
          {notes.map((n, i) => (
            <li key={i}>
              <strong>{n.title}</strong>
              <span className="muted small">{n.body || 'No text'}</span>
            </li>
          ))}
        </ul>
      )}

      <BottomSheet
        {...logged('notes')}
        variant="page"
        fullscreen={mode === 'fullscreen'}
        open={open != null}
        onOpenChange={(o, { reason }) => {
          log(`notes: onOpenChange ${o} (${reason})`)
          if (!o) setOpen(null)
        }}
        title="New Note"
        leading={<BottomSheet.Close className="bar-button">Cancel</BottomSheet.Close>}
        trailing={
          <button className="bar-button strong" onClick={save}>
            Save
          </button>
        }
        headerExtra={
          <div className="note-toolbar" role="toolbar" aria-label="Formatting">
            <button aria-label="Bold"><b>B</b></button>
            <button aria-label="Italic"><i>I</i></button>
            <button aria-label="List"><Icon name="menu" size={18} /></button>
          </div>
        }
      >
        <div className="note-editor">
          <input className="note-title" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className="note-body"
            placeholder="Start writing…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
          />
        </div>
      </BottomSheet>
    </div>
  )
}
