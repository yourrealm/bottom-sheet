// Writes the CSS the library otherwise injects at runtime as plain files, for apps whose Content-Security-Policy
// blocks <style> elements (no style-src 'unsafe-inline'): `import '@yourrealm/bottom-sheet/styled.css'` and the
// bundler serves it as a same-origin stylesheet. One source of truth: the same strings the runtime injects.
// Each file sets a marker variable (--ybs-css-core / --ybs-css-styled) that tells useStyle not to inject.
// Runs on Node >= 23.6 (imports .ts with type stripping).
import { mkdirSync, writeFileSync } from 'node:fs'
import { structuralCss } from '../src/core/styles.ts'
import { styledCss } from '../src/styled/styles.ts'
import { cssFile } from '../src/react/use-style.ts'

const out = new URL('../dist/', import.meta.url)
mkdirSync(out, { recursive: true })
const core = cssFile('core', structuralCss)
writeFileSync(new URL('styles.css', out), core)
writeFileSync(new URL('styled.css', out), core + cssFile('styled', styledCss))
console.log('wrote dist/styles.css, dist/styled.css')
