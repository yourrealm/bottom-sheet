import { useEffect, useRef, useState } from 'react'
import { BottomSheet, type Detent } from '@yourrealm/bottom-sheet/styled'
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
  if (new URLSearchParams(location.search).get('venga') === '1') return <VengaChat />
  return <AssistantChat autoOpen={autoOpen} />
}

function AssistantChat({ autoOpen }: { autoOpen: boolean }) {
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
  const [going, setGoing] = useState(false)
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
          <button
            className={going ? 'secondary wide' : 'primary wide'}
            aria-pressed={going}
            onClick={() => {
              log('assistant: RSVP tapped')
              setGoing((g) => !g)
            }}
          >
            {going ? "You're going ✓" : "I'm going"}
          </button>
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

/**
 * `?venga=1`: Venga's "Create with AI" sheet as shipped (issue #13), to reproduce what it does on a device.
 * Detents `['header+footer', 0.5]`, controlled, opening at 0.5. Below full only the latest turn renders; at full the
 * whole transcript. Replies stream in a few characters at a time, and new content is followed (scrollTo the end from
 * a passive effect) only at full and only while the reader is within 96px of the end. `&send=<ms>` sends a message
 * by itself after that long. `&tall=1` is `fit={false}` (the suggested fix for Venga).
 */
const VENGA_FOLLOW_PX = 96
const TALL = new URLSearchParams(location.search).get('tall') === '1'
/**
 * `&chat=1`: the messages in `BottomSheet.Chat` (pinned to the composer, newest at the bottom). The whole transcript
 * is always rendered: at half you see the latest messages, sliding up reveals older ones above, and at full you
 * scroll back through history. No swap, no "Show earlier", no follow effect.
 */
const CHAT = new URLSearchParams(location.search).get('chat') === '1'
/** `&modal=1`: a modal sheet, so on desktop it's the dialog (a Chat there opens at, and follows, the newest message). */
const MODAL = new URLSearchParams(location.search).get('modal') === '1'
const LOREM =
  'Sure. I set the title, moved it to Saturday evening and added the place. Guests will see the cover, the time and a map. ' +
  'I also wrote a short description from what you told me, with a line about bringing something to sit on. '

function VengaChat() {
  const [messages, setMessages] = useState<Message[]>(() =>
    Array.from({ length: 16 }, (_, i) => ({ from: i % 2 ? 'ai' : 'you', text: i % 2 ? `Reply ${i}: ${LOREM}` : `Question ${i}` })),
  )
  const [streaming, setStreaming] = useState(false)
  const [detent, setDetent] = useState<Detent>(0.5)

  const send = (text: string) => {
    if (streaming) return
    log(`venga: send "${text}"`)
    setMessages((m) => [...m, { from: 'you', text }, { from: 'ai', text: '' }])
    setStreaming(true)
    const full = LOREM.repeat(4)
    let at = 0
    const id = setInterval(() => {
      at = Math.min(full.length, at + 6)
      setMessages((m) => [...m.slice(0, -1), { from: 'ai', text: full.slice(0, at) }])
      if (at >= full.length) {
        clearInterval(id)
        setStreaming(false)
        log('venga: reply done')
      }
    }, 40)
  }

  // `&send=<ms>`: send a message by itself after that long (device runs don't have to find the button).
  const sendRef = useRef(send)
  sendRef.current = send
  useEffect(() => {
    const ms = Number(new URLSearchParams(location.search).get('send'))
    if (!ms) return
    const id = setTimeout(() => sendRef.current('Another change, please'), ms)
    return () => clearTimeout(id)
  }, [])

  // Venga's follow effect, as is.
  const endRef = useRef<HTMLDivElement>(null)
  const last = messages.at(-1)
  const followKey = `${messages.length}:${last?.text.length ?? 0}:${streaming}`
  const followState = useRef<{ key: string; scrollHeight: number | null }>({ key: '', scrollHeight: null })
  useEffect(() => {
    if (CHAT) return // the chat's own scroll area keeps the newest message in view by itself (column-reverse)
    if (followState.current.key === followKey) return
    const scroller = detent === 'full' ? (endRef.current?.closest<HTMLElement>('[data-ybs-scroller]') ?? null) : null
    const previousHeight = followState.current.scrollHeight
    followState.current = { key: followKey, scrollHeight: scroller?.scrollHeight ?? null }
    if (scroller === null) return
    const wasAtEnd = previousHeight === null || previousHeight - scroller.scrollTop - scroller.clientHeight < VENGA_FOLLOW_PX
    if (wasAtEnd) {
      const before = Math.round(scroller.scrollTop)
      scroller.scrollTo({ top: scroller.scrollHeight })
      followState.current.scrollHeight = scroller.scrollHeight
      requestAnimationFrame(() => log(`venga: follow ${before} -> ${Math.round(scroller.scrollTop)} (end ${scroller.scrollHeight - scroller.clientHeight})`))
    }
  }, [followKey, detent])

  // Below full: only the latest turn (Venga's `fromIndex`).
  const latestTurn = messages.findLastIndex((m) => m.from === 'you')
  const shown = CHAT || detent === 'full' ? messages : messages.slice(Math.max(0, latestTurn))

  const bubbles = shown.map((m, i) => (
    <p key={i} className={`bubble ${m.from}`}>{m.text || '…'}</p>
  ))

  return (
    <div className="assistant-page">
      <p className="filler">{'Event page behind the chat. '.repeat(200)}</p>
      <BottomSheet
        {...logged('venga')}
        // `&tall=1`: fit={false}, the sheet is always at least a screen tall, so full stays the top of the screen
        // whatever the chat renders (no fling stopping dead at a short sheet's top, no stops moving under the finger).
        fit={!TALL}
        open
        modal={MODAL}
        dismissible={false}
        dialog={MODAL ? undefined : false}
        detents={['header+footer', 0.5]}
        detent={detent}
        onDetentChange={(d) => {
          log(`venga: onDetentChange ${String(d)}`)
          setDetent(d)
        }}
        title="Create with AI"
        description={streaming ? 'Writing…' : 'Ready'}
        footer={
          <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); send('Another change, please') }}>
            <button type="submit" disabled={streaming}>Send a message</button>
          </form>
        }
      >
        {CHAT ? (
          <BottomSheet.Chat>
            <div className="chat">{bubbles}</div>
          </BottomSheet.Chat>
        ) : (
          <div className="chat">
            {detent !== 'full' && latestTurn > 0 && (
              <button className="suggestion" onClick={() => setDetent('full')}>Show earlier</button>
            )}
            {bubbles}
          </div>
        )}
        <div ref={endRef} />
      </BottomSheet>
    </div>
  )
}
