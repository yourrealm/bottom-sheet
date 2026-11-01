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

/** Inject a stylesheet once per document. No CSS import needed. */
export function useStyle(id: string, css: string) {
  useInsertionEffect(() => {
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
