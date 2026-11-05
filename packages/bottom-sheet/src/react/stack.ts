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
  /** Non-modal sheets only take Escape while focus is inside them. */
  modal?: boolean
  /** Latest progress (0 closed .. 1 full) the sheet reported. */
  progress?: number
  /** Latest coverage (visible sheet / screen) it reported: how far it recedes the page. */
  cover?: number
  /** Where focus goes when the sheet closes; the sheet that replaces this one takes it over. */
  returnFocus?: { current: HTMLElement | null }
  /** A sheet opening over this one replaces it instead of stacking (`replaceable`), unless it's rendered inside it. */
  replaceable?: boolean
  /** Portal roots of the sheets this one is rendered inside. */
  ancestors?: HTMLElement[]
  /** Closes the sheet because another one replaced it. */
  closeForReplace?: () => void
  /** The sheet this one replaced, while that one animates out. */
  replacing?: StackEntry | null
  /** Another sheet replaced this one: it's on its way out, behind the new one. */
  replaced?: boolean
  /** Its progress when it was replaced: its backdrop hands the dim over from there to the new sheet's. */
  replacedAt?: number
  /**
   * On the stack since an earlier task. A sheet opened in the same render as this one (both `open` set together, a
   * deep link) stacks on it rather than replacing it: otherwise the result would depend on their order in the JSX.
   */
  settled?: boolean
}

/** Whether Escape (or a close request it caused) is for this sheet: always for a modal one, else only with focus in it. */
export function takesEscape(entry: Pick<StackEntry, 'modal' | 'root'>) {
  return entry.modal !== false || entry.root.contains(document.activeElement)
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
  // isComposing / 229: Escape cancels an IME composition (Chinese, Japanese input), not the sheet.
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || e.keyCode === 229) return
  // Any Escape: if the browser turns it into a watcher's close request, that watcher must know it wasn't back.
  escapePressed = true
  setTimeout(() => (escapePressed = false))
  const top = escapeTarget()
  // The browser turns this Escape into a close request for the newest watcher; if that's a sheet that doesn't take
  // Escape, its onclose hands it on to escapeTarget() (see Portal).
  if (!top || top.watcher) return
  // Cancelling the keydown also stops the browser from closing a watcher further down the stack.
  e.preventDefault()
  top.close()
}

/** The sheet Escape is for: the topmost one that's open and takes it (a non-modal sheet only with focus inside). */
export function escapeTarget() {
  return stack.findLast((s) => !s.closing && takesEscape(s))
}

/**
 * Add an opening sheet on top. When the sheet it would stack on is `replaceable` (and the new one isn't rendered
 * inside it), that one is closed instead (reason `'replace'`) while the new one opens in front of it: it recedes
 * (covered) as it leaves, like a sheet going behind another. Its backdrop hands the dim over to the new sheet's
 * (`--ybs-backdrop-handoff`, its opacity at the swap times what the new one hasn't covered yet), so the two
 * backdrops never add up to a darker page. Returns the replaced entry.
 */
export function pushSheet(entry: StackEntry): StackEntry | null {
  const top = stack.findLast((e) => !e.replaced)
  const below = top?.replaceable && top.settled && !entry.ancestors?.includes(top.root) ? top : undefined
  stack.push(entry)
  // Effects of one render run in one go, before any microtask: a sheet opened in that render finds this one unsettled.
  queueMicrotask(() => (entry.settled = true))
  if (below) {
    below.replaced = true
    entry.replacing = below
    below.replacedAt = below.progress ?? 1
    below.root.setAttribute('data-ybs-replaced', '')
    below.root.style.setProperty('--ybs-backdrop-handoff', String(below.replacedAt))
    if (!below.closing) below.closeForReplace?.()
  }
  if (!escapeListening) {
    document.addEventListener('keydown', onKeyDown)
    escapeListening = true
  }
  return below ?? null
}

export function removeSheet(entry: StackEntry) {
  const i = stack.indexOf(entry)
  if (i === -1) return
  stack.splice(i, 1)
  for (const e of stack) if (e.replacing === entry) e.replacing = null
  // The sheet it replaced is still open (the app kept it open, or this one is gone again, as StrictMode's re-run of
  // effects does): it's an ordinary stacked sheet again.
  for (const e of stack) if (e.replaced && !e.closing && !stack.some((x) => x.replacing === e)) unreplaceSheet(e)
  if (entry.recede && !stack.some((e) => e.recede)) setRecede(0)
  const below = stack[i - 1]
  if (below && !stack[i]) setCovered(below.root, 0)
  if (!stack.length && escapeListening) {
    document.removeEventListener('keydown', onKeyDown)
    escapeListening = false
  }
}

/** Undo `replaced` (the sheet was opened again, or the replacement didn't happen): it stacks like any other sheet. */
export function unreplaceSheet(entry: StackEntry) {
  if (!entry.replaced) return
  entry.replaced = false
  entry.replacedAt = undefined
  entry.root.removeAttribute('data-ybs-replaced')
  entry.root.style.removeProperty('--ybs-backdrop-handoff')
  for (const e of stack) if (e.replacing === entry) e.replacing = null
}

/** Apply changed props to an open sheet's entry (it keeps its place in the stack and its watcher). */
export function updateSheet(entry: StackEntry, next: { recede: boolean; modal: boolean; replaceable: boolean }) {
  entry.modal = next.modal
  entry.replaceable = next.replaceable
  if (entry.recede === next.recede) return
  entry.recede = next.recede
  if (!next.recede && !stack.some((e) => e.recede)) setRecede(0)
}

/**
 * `inert` on everything outside the open modal sheets, counted per element: two stacked modal sheets both hold the
 * page, so it stays inert until the last one lets go, whichever closes first. An element the app made inert itself
 * is left alone. Covers the siblings of the sheet's root and of each of its ancestors up to <body>, so a sheet
 * portalled into a container still blocks the whole page.
 */
const inertHolds = new Map<Element, number>()
export function holdInert(root: HTMLElement): Element[] {
  const held: Element[] = []
  for (let node: Element = root; node.parentElement && node !== document.body; node = node.parentElement) {
    for (const el of Array.from(node.parentElement.children)) {
      if (el === node || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue
      const n = inertHolds.get(el)
      if (n === undefined && el.hasAttribute('inert')) continue // the app's own
      inertHolds.set(el, (n ?? 0) + 1)
      el.setAttribute('inert', '')
      held.push(el)
    }
  }
  return held
}
export function releaseInert(held: Element[]) {
  for (const el of held) {
    const n = (inertHolds.get(el) ?? 1) - 1
    if (n > 0) inertHolds.set(el, n)
    else {
      inertHolds.delete(el)
      el.removeAttribute('inert')
    }
  }
}

export function isTopSheet(root: HTMLElement) {
  return stack[stack.length - 1]?.root === root
}

/** Called with the sheet's own progress (0 closed .. 1 full); updates the sheet underneath it. */
export function reportProgress(root: HTMLElement, progress: number, cover = progress) {
  const i = stack.findIndex((e) => e.root === root)
  const entry = stack[i]
  if (entry) {
    entry.progress = progress
    entry.cover = cover
  }
  // Replacing: the old sheet's backdrop fades out as this one's fades in (a cross-fade, not two dims stacked).
  const old = entry?.replacing
  if (old) old.root.style.setProperty('--ybs-backdrop-handoff', String((old.replacedAt ?? 1) * (1 - progress)))
  // The sheet underneath is covered (a replaced one too: it recedes behind the new sheet as it leaves). A replaced
  // sheet's own progress covers nothing: the sheet below it is behind the new one now.
  const below = i > 0 && !entry?.replaced ? stack[i - 1] : undefined
  if (below) setCovered(below.root, progress)
  // The page recedes with the lowest receding sheet. While it replaces another receding sheet, with whichever of the
  // two covers more: the new one starts from 0, and the page shouldn't come forward and go back during the swap.
  const driver = recedeDriver()
  if (entry && driver && (entry === driver || entry === driver.replacing)) {
    const old = driver.replacing?.recede ? (driver.replacing.cover ?? 0) : 0
    setRecede(Math.max(driver.cover ?? 0, old))
  }
}

/** The lowest receding sheet drives the page's recede; one being replaced hands that to the sheet replacing it. */
function recedeDriver() {
  return stack.find((e) => e.recede && !e.replaced) ?? stack.find((e) => e.recede)
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
