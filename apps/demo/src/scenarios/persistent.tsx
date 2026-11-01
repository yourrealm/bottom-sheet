import { useEffect, useRef, useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { log, logged } from '../debug'

/** Full, or the peek bar. Closed only before it first slides up (and after "New board"). */
type State = 'full' | 'peek' | 'closed'
const PEEK = '76px'
const SIZE = 6
const HUES = [10, 45, 140, 200, 265, 320]

/**
 * A persistent, non-modal sheet: slides up when the puzzle is solved, never closes by gesture (swipe down,
 * Escape and taps outside drop it to a 76px peek), no backdrop, and the board behind stays tappable.
 */
export function Persistent({ autoOpen }: { autoOpen: boolean }) {
  const [state, setState] = useState<State>(autoOpen ? 'full' : 'closed')
  const [board, setBoard] = useState(0)
  const [taps, setTaps] = useState(0)
  const [vote, setVote] = useState<1 | -1 | null>(null)
  const newBoard = useRef<HTMLButtonElement>(null)
  const solved = state !== 'closed'

  // Solving slides the sheet up a moment after the last move, like the puzzle app.
  const solve = () => setTimeout(() => setState('full'), 400)
  useEffect(() => setVote(null), [board])

  return (
    <div className="puzzle">
      <p className="muted small">
        Board #{board + 1} · taps on the board: <strong data-testid="board-taps">{taps}</strong>
      </p>
      <div className={`board${solved ? ' cascade' : ''}`} key={board} role="grid" aria-label="Board">
        {Array.from({ length: SIZE * SIZE }, (_, i) => (
          <button
            key={i}
            className="cell"
            style={{ ['--h' as string]: HUES[(i * 7 + board) % HUES.length], ['--i' as string]: i }}
            aria-label={`Cell ${i + 1}`}
            onClick={() => {
              setTaps((t) => t + 1)
              // A tap on the board ends the victory animation and drops the sheet to its peek.
              if (state === 'full') setState('peek')
            }}
          />
        ))}
      </div>
      {!solved && (
        <button className="primary wide" id="solve" onClick={solve}>
          Solve it
        </button>
      )}

      <BottomSheet
        {...logged('solved')}
        open={solved}
        onOpenChange={(open, { reason }) => {
          log(`solved: onOpenChange ${open} (${reason})`)
          if (!open) setState('closed')
        }}
        modal={false}
        dismissible={false}
        detents={[PEEK]}
        detent={state === 'peek' ? PEEK : 'full'}
        onDetentChange={(d) => {
          log(`solved: onDetentChange ${String(d)}`)
          setState(d === 'full' ? 'full' : 'peek')
        }}
        title="Solved"
        // With a mouse or keyboard, New board gets focus so Enter goes on; not after a tap (no keyboard, and the
        // focus ring would just sit there).
        initialFocus={(type) => type !== 'touch' && newBoard.current}
        headerExtra={
          <button
            className="peek-toggle"
            aria-label={state === 'full' ? 'Show less' : 'Show more'}
            data-up={state !== 'full' || undefined}
            onClick={() => setState(state === 'full' ? 'peek' : 'full')}
          >
            <svg viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 5.25 7 9.25l4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        }
        className="solved-sheet"
      >
        <div className="pad solved">
          <p className="muted">No hints used · 2:41</p>
          <div className="thumbs" role="group" aria-label="Rate this board">
            <button aria-pressed={vote === 1} disabled={vote != null} onClick={() => setVote(1)}>
              👍 Good one
            </button>
            <button aria-pressed={vote === -1} disabled={vote != null} onClick={() => setVote(-1)}>
              👎 Not for me
            </button>
          </div>
          <div className="solved-actions">
            <button className="secondary" onClick={() => setState('peek')}>
              See the board
            </button>
            <button
              ref={newBoard}
              className="primary"
              onClick={() => {
                setState('closed')
                setBoard((b) => b + 1)
              }}
            >
              New board
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
