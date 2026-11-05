import { useEffect, useRef, useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { log, logged } from '../debug'

/**
 * A chat over a live page (Venga's "Create with AI"): a non-modal sheet that never closes. Minimised, the
 * `'header+footer'` detent shows the title, the status line and the composer, which lives in `footer` so it sits at
 * the bottom when expanded. The page behind stays usable and changes as you chat.
 */
interface Event {
  title: string
  when: string
  where: string
  about: string
  hue: number
}
interface Message {
  from: 'you' | 'ai'
  text: string
}

const EDITS: { ask: string; reply: string; change: Partial<Event> }[] = [
  { ask: 'Make it a summer party', reply: 'Done: new title and a warmer colour.', change: { title: 'Midsummer on the roof', hue: 30 } },
  { ask: 'Move it to Saturday evening', reply: 'Moved to Saturday 21 June, 18:00.', change: { when: 'Sat 21 June · 18:00' } },
  { ask: 'Say there will be strawberries', reply: 'Added to the description.', change: { about: 'Bring a friend and something to sit on. There will be strawberries, cake and a long table in the evening sun.' } },
  { ask: 'Hold it at Tantolunden instead', reply: 'Changed the place to Tantolunden, Södermalm.', change: { where: 'Tantolunden, Södermalm' } },
]

export function Assistant({ autoOpen }: { autoOpen: boolean }) {
  const [event, setEvent] = useState<Event>({
    title: 'Rooftop get-together',
    when: 'Fri 20 June · 17:00',
    where: 'Hornsgatan 12, Stockholm',
    about: 'Bring a friend and something to sit on.',
    hue: 210,
  })
  const [messages, setMessages] = useState<Message[]>([
    { from: 'ai', text: 'Hi! Tell me what to change on your event page and I will update it as we go.' },
  ])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [detent, setDetent] = useState<'header+footer' | 'full'>(autoOpen ? 'full' : 'header+footer')
  const next = EDITS[messages.filter((m) => m.from === 'you').length % EDITS.length]!

  const send = (text: string) => {
    if (!text.trim() || busy) return
    setMessages((m) => [...m, { from: 'you', text }])
    setDraft('')
    setBusy(true)
    const edit = EDITS.find((e) => e.ask === text) ?? { reply: 'I can change the title, time, place or description.', change: {} }
    setTimeout(() => {
      setEvent((e) => ({ ...e, ...edit.change }))
      setMessages((m) => [...m, { from: 'ai', text: edit.reply }])
      setBusy(false)
    }, 900)
  }

  return (
    <div className="assistant-page">
      <article className="event" style={{ ['--h' as string]: event.hue }}>
        <div className="event-cover" />
        <div className="event-body">
          <div className="muted small">Preview · live</div>
          <h2>{event.title}</h2>
          <p className="event-meta">{event.when}<br />{event.where}</p>
          <p>{event.about}</p>
          <button className="primary wide" onClick={() => log('assistant: RSVP tapped')}>I'm going</button>
          <p className="muted small">The page stays usable under the chat: tap the button above with the chat minimised.</p>
        </div>
      </article>

      <BottomSheet
        {...logged('assistant')}
        open
        modal={false}
        dismissible={false}
        detents={['header+footer']}
        detent={detent}
        onDetentChange={(d) => {
          log(`assistant: onDetentChange ${String(d)}`)
          setDetent(d === 'full' ? 'full' : 'header+footer')
        }}
        title="Create with AI"
        description={busy ? 'Updating your page…' : 'Ready'}
        footer={
          <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); send(draft) }}>
            <AutoGrow value={draft} onChange={setDraft} onEnter={() => send(draft)} placeholder={`Try "${next.ask}"`} />
            <button type="submit" disabled={busy || !draft.trim()}>Send</button>
          </form>
        }
      >
        <div className="chat">
          {messages.map((m, i) => (
            <p key={i} className={`bubble ${m.from}`}>{m.text}</p>
          ))}
          {busy && <p className="bubble ai muted">…</p>}
          <button className="suggestion" onClick={() => send(next.ask)} disabled={busy}>{next.ask}</button>
        </div>
      </BottomSheet>
    </div>
  )
}

/** A textarea that grows with its text up to five lines (the footer, and so the peek, grows with it). */
function AutoGrow({ value, onChange, onEnter, placeholder }: {
  value: string
  onChange: (v: string) => void
  onEnter: () => void
  placeholder: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label="Message"
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault()
          onEnter()
        }
      }}
    />
  )
}
