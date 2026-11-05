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
    // Throttle, not debounce: a debounce never flushes if something logs in a tight loop, which is
    // exactly the case we most need to see. Cap the batch so a runaway loop can't build a huge body.
    if (pending.length > 200) pending.splice(100, pending.length - 150, `${TAB} … ${pending.length - 150} lines dropped …`)
    if (flushTimer === undefined) {
      flushTimer = setTimeout(() => {
        flushTimer = undefined
        const body = pending.join('\n')
        pending = []
        void fetch('/__log', { method: 'POST', body, keepalive: true }).catch(() => {})
      }, 100)
    }
  }
}

export function subscribe(l: Listener) {
  listeners.add(l)
  l([...lines])
  return () => void listeners.delete(l)
}

/**
 * The demo's "Dialog on desktop" setting (`<BottomSheet.Provider dialog>` around the app): `?dialog=1|0`, else the
 * home page switch (localStorage), on by default. It only takes effect on a wide screen with a mouse.
 */
export function dialogSetting(): boolean {
  const q = new URLSearchParams(location.search).get('dialog')
  if (q != null) return q !== '0'
  try {
    return localStorage.getItem('ybs-dialog') !== '0'
  } catch {
    return true
  }
}

/** Props that wire a sheet into the log. */
/** `root`: extra props for the sheet's root (one sheet's theme), merged with the test hook. */
export function logged(name: string, root?: Record<string, string>) {
  return {
    debug: (m: string) => log(`${name}: ${m}`),
    onDetentChange: (d: unknown) => log(`${name}: onDetentChange ${String(d)}`),
    // Counts the sheets still on the page: 0 for a single sheet means the portal was already gone.
    onExitComplete: () => log(`${name}: onExitComplete roots=${document.querySelectorAll('[data-ybs-root]').length}`),
    // Names each demo sheet's root, so tests can theme one sheet there (BottomSheet only; Sheet.Root ignores it).
    rootProps: { 'data-demo': name, ...root } as Record<string, string>,
  }
}

log(`--- load ${location.search}${location.hash} closewatcher=${"CloseWatcher" in window}`)
