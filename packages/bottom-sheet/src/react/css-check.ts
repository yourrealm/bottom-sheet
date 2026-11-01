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
