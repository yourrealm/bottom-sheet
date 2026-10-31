/**
 * Event log shared by all scenarios.
 * - window.__ybs.events: read by Playwright tests
 * - dev server only: POSTed to /__log -> apps/demo/.logs/device.log (on-device runs)
 * - shown in the on-screen debug overlay when enabled
 */
type Listener = (lines: string[]) => void

declare global {
  interface Window {
    __ybs: { events: string[] }
  }
}

window.__ybs = { events: [] }
// Device runs pass ?run=<id>; every line carries it, so logs group by run even if the load line is dropped.
const TAB = new URLSearchParams(location.search).get('run') ?? Math.random().toString(36).slice(2, 6)
const lines: string[] = []
const listeners = new Set<Listener>()
let pending: string[] = []
let flushTimer: ReturnType<typeof setTimeout> | undefined

export function log(message: string) {
  window.__ybs.events.push(message)
  const line = `${(performance.now() / 1000).toFixed(2)} ${message}`
  lines.unshift(line)
  lines.length = Math.min(lines.length, 14)
  for (const l of listeners) l([...lines])
  if (import.meta.env.DEV && !document.hidden) {
    pending.push(`${TAB} ${line}`)
    clearTimeout(flushTimer)
    flushTimer = setTimeout(() => {
      const body = pending.join('\n')
      pending = []
      void fetch('/__log', { method: 'POST', body, keepalive: true }).catch(() => {})
    }, 100)
  }
}

export function subscribe(l: Listener) {
  listeners.add(l)
  l([...lines])
  return () => void listeners.delete(l)
}

/** Props that wire a sheet into the log. */
export function logged(name: string) {
  return {
    debug: (m: string) => log(`${name}: ${m}`),
    onDetentChange: (d: unknown) => log(`${name}: onDetentChange ${String(d)}`),
  }
}

log(`--- load ${location.search}${location.hash}`)
