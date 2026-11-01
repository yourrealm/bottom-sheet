import { useInsertionEffect } from 'react'

/**
 * Our CSS lives in the `ybs` cascade layer, so any unlayered consumer CSS wins outright. The order statement
 * slots it between Tailwind v4's `base` (preflight) and `components`/`utilities`: preflight's resets
 * (`* { padding: 0 }`) can't wipe the preset, and utility classes on the parts win. The statement must come
 * first in the document to fix the order, which is why the sheet is prepended. Declaring Tailwind's layer
 * names is harmless without Tailwind (they stay empty).
 */
export const LAYER_ORDER = '@layer theme, base, ybs, components, utilities;'
export const layered = (css: string) => `${LAYER_ORDER}\n@layer ybs {\n${css}\n}\n`

/** A layered stylesheet as shipped in dist/*.css, with the marker that turns runtime injection off. */
export const cssFile = (id: string, css: string) => layered(`:root { --ybs-css-${id}: 1; }\n${css}`)

/** Whether the app loaded our CSS as a file (dist/styles.css or styled.css): then nothing is injected. */
const fileLoaded = new Map<string, boolean>()
function loadedAsFile(id: string) {
  let v = fileLoaded.get(id)
  if (v === undefined) {
    v = getComputedStyle(document.documentElement).getPropertyValue(`--ybs-css-${id}`).trim() === '1'
    fileLoaded.set(id, v)
  }
  return v
}

/**
 * Inject a stylesheet once per document. No CSS import needed. Apps with a strict Content-Security-Policy import
 * `@yourrealm/bottom-sheet/styles.css` (or `styled.css`) instead; its marker variable turns this off.
 */
export function useStyle(id: string, css: string) {
  useInsertionEffect(() => {
    if (loadedAsFile(id)) return
    const text = layered(css)
    const existing = document.querySelector<HTMLStyleElement>(`style[data-ybs-style="${id}"]`)
    if (existing) {
      // Keep it current (hot reload, or a newer copy of the library on the page).
      if (existing.textContent !== text) existing.textContent = text
      return
    }
    const el = document.createElement('style')
    el.setAttribute('data-ybs-style', id)
    el.textContent = text
    document.head.prepend(el) // first in the document, so our layer order statement is the one that counts
  }, [id, css])
}
