import { useRef, useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { logged } from '../debug'

/**
 * Confirm prompts, the README's "Confirm prompts" pattern: one sheet rendered once, its question kept until
 * `onExitComplete` so the close animates with the text still there. An alert dialog (role via contentProps) that
 * starts on Cancel, and stays dismissible: a swipe, Escape or a tap outside is Cancel. Title + description + footer,
 * no body: the buttons sit one gap under the text.
 */
interface Prompt {
  question: string
  detail: string
  action: string
  destructive?: boolean
  run: () => void
}

const ITEMS = ['Tomatoes', 'Oat milk', 'Sourdough', 'Coffee beans', 'Lemons', 'Butter']

export function Confirm({ autoOpen }: { autoOpen: boolean }) {
  const [items, setItems] = useState(ITEMS)
  const [moved, setMoved] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const say = (text: string) => {
    setToast(text)
    setTimeout(() => setToast(null), 2500)
  }
  const move: Prompt = {
    question: 'Move Tomatoes to Fruit?',
    detail: 'Sam will see Tomatoes too.',
    action: 'Move',
    run: () => {
      setMoved(true)
      say('Moved Tomatoes to Fruit')
    },
  }
  const [prompt, setPrompt] = useState<Prompt | null>(autoOpen ? move : null)
  const [open, setOpen] = useState(autoOpen)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const ask = (p: Prompt) => {
    setPrompt(p)
    setOpen(true)
  }

  return (
    <div className="page-pad confirm-page">
      <p className="muted">A shopping list shared with Sam. Each action asks first, in a sheet on a phone and a dialog on desktop.</p>
      {!moved && items.includes('Tomatoes') && (
        <div className="confirm-hint">
          <span>Tomatoes are usually under Fruit in Sam's shop.</span>
          <button className="secondary" onClick={() => ask(move)}>Move…</button>
        </div>
      )}
      <ul className="confirm-list">
        {items.map((item) => (
          <li key={item}>
            <span>{item}</span>
            <button
              className="confirm-delete"
              aria-label={`Delete ${item}`}
              onClick={() =>
                ask({
                  question: `Delete ${item}?`,
                  detail: "It's removed for Sam too. This can't be undone.",
                  action: 'Delete',
                  destructive: true,
                  run: () => {
                    setItems((all) => all.filter((i) => i !== item))
                    say(`Deleted ${item}`)
                  },
                })
              }
            >
              Delete
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="muted">The list is empty.</li>}
      </ul>
      <div className="confirm-actions">
        <button
          className="secondary"
          disabled={items.length === 0}
          onClick={() =>
            ask({
              question: 'Clear the list?',
              detail: `Removes all ${items.length} items, for you and Sam.`,
              action: 'Clear list',
              destructive: true,
              run: () => {
                setItems([])
                say('Cleared the list')
              },
            })
          }
        >
          Clear list
        </button>
        <button className="secondary" onClick={() => { setItems(ITEMS); setMoved(false) }}>Reset demo</button>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}

      <BottomSheet
        {...logged('confirm')}
        open={open}
        onOpenChange={setOpen}
        onExitComplete={() => setPrompt(null)} // the sheet is gone: now the question can go
        title={prompt?.question ?? ''}
        description={prompt?.detail}
        contentProps={{ role: 'alertdialog' }}
        initialFocus={cancelRef}
        footer={<>
          <BottomSheet.Close ref={cancelRef} className="secondary">Cancel</BottomSheet.Close>
          <button
            className={prompt?.destructive ? 'danger' : 'primary'}
            onClick={() => {
              prompt?.run()
              setOpen(false)
            }}
          >
            {prompt?.action}
          </button>
        </>}
      />
    </div>
  )
}
