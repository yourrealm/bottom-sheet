import { useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { logged } from '../debug'
import { comments, hues, initials } from '../data'
import { Icon } from '../icons'

const COMMENTS = comments(40)
const BASE = import.meta.env.BASE_URL
const POSTS = [
  { user: 'noah.lind', hue: 200, caption: 'Evening walk in the forest', img: 'dog/walk.webp', w: 1040, h: 1300, alt: 'A small dog on a forest path at sunset', likes: '2,481', when: '2h' },
  { user: 'saga.ek', hue: 45, caption: 'Found her favourite toy again. Under the sofa, obviously.', img: 'dog/toy.webp', w: 1200, h: 1184, alt: 'A small dog holding a purple toy', likes: '918', when: '5h' },
  { user: 'mira.holm', hue: 330, caption: 'Hot take: the best time for a walk is right after the rain. Everything smells like moss and the paths are empty.', likes: '312', when: '9h' },
]
const SUGGESTED = ['Leo Strand', 'Ines Costa', 'Yuki Mori', 'Ravi Shah']

export function Comments({ autoOpen }: { autoOpen: boolean }) {
  const [open, setOpen] = useState(autoOpen)
  const [draft, setDraft] = useState('')
  const [mine, setMine] = useState<string[]>([])

  return (
    <div className="post-page">
      <div className="feed">
        {POSTS.map((p, i) => (
          <article key={p.user} className="post">
            <header className="post-head">
              <div className="avatar" style={{ ['--h' as string]: p.hue }}>{p.user.slice(0, 2).toUpperCase()}</div>
              <div>
                <strong>{p.user}</strong> <span className="muted small">· {p.when}</span>
                {p.img && <div className="muted small">{p.caption}</div>}
              </div>
            </header>
            {p.img ? (
              <img className="post-image" src={`${BASE}${p.img}`} alt={p.alt} width={p.w} height={p.h} loading={i ? 'lazy' : undefined} />
            ) : (
              <p className="post-text">{p.caption}</p>
            )}
            <div className="post-meta">
              <span className="post-likes">
                <Icon name="heart" size={18} /> {p.likes}
              </span>
              <button className="link" onClick={() => setOpen(true)}>
                View all {COMMENTS.length + mine.length - i * 13} comments
              </button>
            </div>
          </article>
        ))}
      </div>
      <aside className="feed-side">
        <div className="profile-mini">
          <div className="avatar" style={{ ['--h' as string]: 320 }}>ME</div>
          <div>
            <strong>you</strong>
            <div className="muted small">Signed in</div>
          </div>
        </div>
        <h3 className="section">Suggested for you</h3>
        <ul>
          {SUGGESTED.map((n, i) => (
            <li key={n}>
              <div className="avatar" style={{ ['--h' as string]: hues[(i * 3) % hues.length] }}>{initials(n)}</div>
              <span>
                <strong>{n.toLowerCase().replace(' ', '.')}</strong>
                <span className="muted small">Follows noah.lind</span>
              </span>
              <button className="link accent">Follow</button>
            </li>
          ))}
        </ul>
      </aside>

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
