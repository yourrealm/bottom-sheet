/**
 * The CSS is a file the app imports (`@yourrealm/bottom-sheet/styles.css` or `styled.css`). A sheet without it can't
 * work (the overlay, scroller and snapping are CSS), so say so loudly, once, when one opens. Each file sets a marker
 * variable on :root that this reads.
 */
const reported = new Set<string>()

export function checkCss(id: 'core' | 'styled', file: string) {
  if (reported.has(id) || typeof document === 'undefined') return
  if (getComputedStyle(document.documentElement).getPropertyValue(`--ybs-css-${id}`).trim() === '1') return
  reported.add(id)
  console.error(
    `@yourrealm/bottom-sheet: ${file} isn't loaded, so the sheet can't work. Import it once, before Tailwind:\n` +
      `  @import "@yourrealm/bottom-sheet/${file}";`,
  )
}

/**
 * `/styled` colours come from light-dark(). A build that lowers it (Lightning CSS, other PostCSS plugins) relies on
 * switches that `color-scheme` sets; when they're missing the token is two colours side by side, not a colour, and
 * the sheet is transparent. styled.css defaults Lightning CSS's switches; this catches the rest. Once, on open.
 */
let tokensReported = false

export function checkTokens() {
  if (tokensReported || typeof document === 'undefined' || typeof CSS === 'undefined') return
  const root = document.querySelector('[data-ybs-root]')
  if (!root) return
  const bg = getComputedStyle(root).getPropertyValue('--ybs-sheet-bg').trim()
  if (!bg || CSS.supports('color', bg)) return
  tokensReported = true
  console.error(
    `@yourrealm/bottom-sheet: --ybs-sheet-bg is "${bg}", which isn't a colour, so the sheet is transparent. ` +
      `Your build probably lowered light-dark() and nothing sets color-scheme. Set it on :root, e.g. ` +
      `:root { color-scheme: light dark }, or raise the CSS target to browsers with light-dark() ` +
      `(Chrome 123, Firefox 120, Safari 17.5).`,
  )
}

/**
 * One sheet's theme goes on its root (`rootProps` / `Sheet.Portal` props), not on the sheet: these tokens are also
 * read by parts outside the sheet (the backdrop, the dialog's ring and shadow, the colour behind the keyboard, the
 * corner clip), and custom properties don't inherit up, so a value set on the sheet leaves those parts on the old
 * one (issue #9). Checked once per open, warned once per token. Tokens only read inside the sheet (text colours,
 * paddings, `--ybs-dialog-width`) work on the sheet and aren't checked.
 */
const OUTSIDE = [
  '--ybs-sheet-bg',
  '--ybs-divider',
  '--ybs-radius',
  '--ybs-max-width',
  '--ybs-float-gap',
  '--ybs-dialog-radius',
  '--ybs-backdrop',
  '--ybs-backdrop-max',
  '--ybs-inset',
  '--ybs-dialog-gap',
  'color-scheme',
]
const themeReported = new Set<string>()

export function checkSheetTheme(root: HTMLElement, sheet: HTMLElement) {
  const r = getComputedStyle(root)
  const s = getComputedStyle(sheet)
  const moved = OUTSIDE.filter((t) => !themeReported.has(t) && r.getPropertyValue(t).trim() !== s.getPropertyValue(t).trim())
  if (!moved.length) return
  for (const t of moved) themeReported.add(t)
  console.warn(
    `@yourrealm/bottom-sheet: ${moved.join(', ')} ${moved.length > 1 ? 'are' : 'is'} set on the sheet, so the parts ` +
      `drawn outside it (backdrop, dialog ring and shadow, the colour behind the keyboard) don't get it. Set one ` +
      `sheet's theme on its root instead: <BottomSheet rootProps={{ className, style, 'data-theme': … }}> ` +
      `(headless: props on <Sheet.Portal>).`,
  )
}
