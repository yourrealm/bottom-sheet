import { useInsertionEffect } from 'react'

const injected = new Set<string>()

/** Inject a stylesheet once per document. Works on React 18 and 19; no CSS import needed. */
export function useStyle(id: string, css: string) {
  useInsertionEffect(() => {
    const existing = document.querySelector<HTMLStyleElement>(`style[data-ybs-style="${id}"]`)
    if (existing) {
      // Keep it current (hot reload, or a newer copy of the library on the page).
      if (existing.textContent !== css) existing.textContent = css
      injected.add(id)
      return
    }
    const el = document.createElement('style')
    el.setAttribute('data-ybs-style', id)
    el.textContent = css
    document.head.prepend(el) // prepend: consumer styles win at equal specificity
    injected.add(id)
  }, [id, css])
}
