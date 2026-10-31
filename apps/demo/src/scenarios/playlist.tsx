import { useState } from 'react'
import { Sheet } from '@yourrealm/bottom-sheet'
import { logged } from '../debug'
import { tracks } from '../data'

const TRACKS = tracks(30)

/** Built from the HEADLESS parts: every visual here is the demo's own CSS. */
export function Playlist({ autoOpen }: { autoOpen: boolean }) {
  const [playing, setPlaying] = useState(0)
  const now = TRACKS[playing]!

  return (
    <div className="player" style={{ ['--h' as string]: now.hue }}>
      <div className="art" />
      <div className="now">
        <h2>{now.title}</h2>
        <div className="muted">{now.artist}</div>
      </div>
      <div className="transport">
        <button onClick={() => setPlaying((p) => (p + TRACKS.length - 1) % TRACKS.length)} aria-label="Previous">⏮</button>
        <button className="play" aria-label="Pause">⏸</button>
        <button onClick={() => setPlaying((p) => (p + 1) % TRACKS.length)} aria-label="Next">⏭</button>
      </div>

      <Sheet.Root {...logged('playlist')} defaultOpen={autoOpen} detents={[0.45]}>
        <Sheet.Trigger className="up-next">Up next ⌃</Sheet.Trigger>
        <Sheet.Portal>
          <Sheet.Backdrop className="pl-backdrop" />
          <Sheet.View bleedClassName="pl-bleed">
            <Sheet.Content className="pl-sheet">
              <Sheet.Header className="pl-header">
                <Sheet.Handle className="pl-handle" />
                <div className="pl-title-row">
                  <Sheet.Title className="pl-title">Up next</Sheet.Title>
                  <Sheet.Close className="pl-close">Done</Sheet.Close>
                </div>
                <Sheet.Description className="pl-desc">{TRACKS.length} tracks · shuffle off</Sheet.Description>
              </Sheet.Header>
              <ol className="pl-list">
                {TRACKS.map((t, i) => (
                  <li key={t.id} className={i === playing ? 'current' : ''}>
                    <button onClick={() => setPlaying(i)}>
                      <span className="pl-art" style={{ ['--h' as string]: t.hue }} />
                      <span className="pl-meta">
                        <span>{t.title}</span>
                        <span className="pl-artist">{t.artist}</span>
                      </span>
                      <span className="pl-len">{t.length}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </Sheet.Content>
          </Sheet.View>
        </Sheet.Portal>
      </Sheet.Root>
    </div>
  )
}
