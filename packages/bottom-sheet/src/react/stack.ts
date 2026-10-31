/**
 * Open sheets, bottom to top. Lets stacked sheets cooperate:
 * - Escape closes only the top sheet,
 * - the sheet below the top one is marked covered (`data-ybs-covered`, `--ybs-covered` 0..1 following the
 *   upper sheet's progress) so it can recede like iOS stacked sheets,
 * - only the top sheet reacts to the keyboard.
 */
export interface StackEntry {
  root: HTMLElement
  close: () => void
}

const stack: StackEntry[] = []
let escapeListening = false

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  const top = stack[stack.length - 1]
  if (!top) return
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
export function reportProgress(root: HTMLElement, progress: number) {
  const i = stack.findIndex((e) => e.root === root)
  const below = i > 0 ? stack[i - 1] : undefined
  if (below) setCovered(below.root, progress)
}

function setCovered(root: HTMLElement, progress: number) {
  root.style.setProperty('--ybs-covered', String(progress))
  root.toggleAttribute('data-ybs-covered', progress > 0)
}
