/**
 * Open sheets, bottom to top. Lets stacked sheets cooperate:
 * - Escape closes only the top sheet,
 * - the sheet below the top one is marked covered (`data-ybs-covered`, `--ybs-covered` 0..1 following the
 *   upper sheet's progress) so it can recede like iOS stacked sheets,
 * - only the top sheet reacts to the keyboard,
 * - Android back closes the top sheet, through `CloseWatcher` (Chrome 126+, Firefox 149+). No history entries,
 *   so app URLs and routers are never touched. Browsers without it (Safari) keep the Escape listener only.
 */
export interface StackEntry {
  root: HTMLElement
  close: () => void
  /** Set while the sheet listens for back; it then also gets Escape from the browser, not from our listener. */
  watcher?: CloseWatcherLike | null
  /** Animating out: Escape skips it and goes to the sheet below. */
  closing?: boolean
  /** The page behind recedes while this (modal) sheet is open; the lowest such sheet drives it. */
  recede?: boolean
}

/** The bits of CloseWatcher we use (not in TypeScript's DOM lib yet). */
export interface CloseWatcherLike {
  onclose: ((e: Event) => void) | null
  destroy(): void
}
type CloseWatcherCtor = new () => CloseWatcherLike

/** The CloseWatcher constructor, or null where the browser doesn't have it. */
export function closeWatcher(): CloseWatcherCtor | null {
  return typeof window !== 'undefined' ? ((window as unknown as { CloseWatcher?: CloseWatcherCtor }).CloseWatcher ?? null) : null
}

/** True during the task in which Escape was pressed, so a watcher's close can report 'escape' instead of 'back'. */
let escapePressed = false
export const closedByEscape = () => escapePressed

const stack: StackEntry[] = []
let escapeListening = false

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  const top = stack.findLast((s) => !s.closing)
  if (!top) return
  if (top.watcher) {
    // The browser turns this Escape into a close request for the newest watcher (the top sheet's).
    escapePressed = true
    setTimeout(() => (escapePressed = false))
    return
  }
  // Cancelling the keydown also stops the browser from closing a watcher further down the stack.
  e.preventDefault()
  top.close()
}

export function pushSheet(entry: StackEntry) {
  stack.push(entry)
  if (!escapeListening) {
    document.addEventListener('keydown', onKeyDown)
    escapeListening = true
  }
}

export function removeSheet(entry: StackEntry) {
  const i = stack.indexOf(entry)
  if (i === -1) return
  stack.splice(i, 1)
  if (entry.recede && !stack.some((e) => e.recede)) setRecede(0)
  const below = stack[i - 1]
  if (below && !stack[i]) setCovered(below.root, 0)
  if (!stack.length && escapeListening) {
    document.removeEventListener('keydown', onKeyDown)
    escapeListening = false
  }
}

export function isTopSheet(root: HTMLElement) {
  return stack[stack.length - 1]?.root === root
}

/** Called with the sheet's own progress (0 closed .. 1 full); updates the sheet underneath it. */
export function reportProgress(root: HTMLElement, progress: number, cover = progress) {
  const i = stack.findIndex((e) => e.root === root)
  const below = i > 0 ? stack[i - 1] : undefined
  if (below) setCovered(below.root, progress)
  if (i !== -1 && stack[i] === stack.find((e) => e.recede)) setRecede(cover)
}

/**
 * The page behind recedes (`data-ybs-recede` + `--ybs-recede` on <html>) while a sheet with `recede` is open.
 * `--ybs-recede` is the share of the screen the sheet covers (0..1), so a short sheet barely recedes the page.
 * `--ybs-scroll-y` lets the page scale from the top of the screen rather than the top of the document.
 * The attribute is only present while receding: a transform on the page wrapper changes what its fixed
 * elements are positioned against, so it must not linger.
 */
function setRecede(progress: number) {
  const html = document.documentElement
  if (progress > 0 && !html.hasAttribute('data-ybs-recede')) {
    html.style.setProperty('--ybs-scroll-y', `${window.scrollY}px`)
    html.setAttribute('data-ybs-recede', '')
  }
  if (progress <= 0) {
    html.removeAttribute('data-ybs-recede')
    html.style.removeProperty('--ybs-recede')
    return
  }
  html.style.setProperty('--ybs-recede', String(progress))
}

function setCovered(root: HTMLElement, progress: number) {
  root.style.setProperty('--ybs-covered', String(progress))
  root.toggleAttribute('data-ybs-covered', progress > 0)
}
