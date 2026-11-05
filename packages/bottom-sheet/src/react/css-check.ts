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
