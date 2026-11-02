import { useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { logged } from '../debug'
import { comments, initials } from '../data'

const COMMENTS = comments(40)

export function Comments({ autoOpen }: { autoOpen: boolean }) {
  const [open, setOpen] = useState(autoOpen)
  const [draft, setDraft] = useState('')
  const [mine, setMine] = useState<string[]>([])

  return (
    <div className="post-page">
      <article className="post">
        <header className="post-head">
          <div className="avatar" style={{ ['--h' as string]: 200 }}>NL</div>
          <div>
            <strong>noah.lind</strong>
            <div className="muted">Evening walk in the forest</div>
          </div>
        </header>
        <img
          className="post-image"
          src={`${import.meta.env.BASE_URL}dog/walk.webp`}
          alt="A small dog on a forest path at sunset"
          width={1040}
          height={1300}
        />
        <div className="post-meta">
          <span>♥ 2,481</span>
          <button className="link" onClick={() => setOpen(true)}>
            View all {COMMENTS.length + mine.length} comments
          </button>
        </div>
      </article>

      <BottomSheet
        {...logged('comments')}
        open={open}
        onOpenChange={setOpen}
        detents={[0.6]}
        title="Comments"
        description={`${COMMENTS.length + mine.length} comments`}
        footer={
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault()
              if (!draft.trim()) return
              setMine((m) => [draft.trim(), ...m])
              setDraft('')
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a comment…"
              enterKeyHint="send"
              aria-label="Add a comment"
            />
            <button type="submit" disabled={!draft.trim()}>Post</button>
          </form>
        }
      >
        <ul className="comments">
          {mine.map((text, i) => (
            <li key={`m${i}`} className="comment">
              <div className="avatar" style={{ ['--h' as string]: 320 }}>ME</div>
              <div>
                <div><strong>you</strong> <span className="muted">· now</span></div>
                <p>{text}</p>
              </div>
            </li>
          ))}
          {COMMENTS.map((c) => (
            <li key={c.id} className="comment">
              <div className="avatar" style={{ ['--h' as string]: c.hue }}>{initials(c.name)}</div>
              <div>
                <div><strong>{c.name.toLowerCase().replace(' ', '.')}</strong> <span className="muted">· {c.when}</span></div>
                <p>{c.text}</p>
                <div className="muted small">♥ {c.likes} · Reply</div>
              </div>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </div>
  )
}
