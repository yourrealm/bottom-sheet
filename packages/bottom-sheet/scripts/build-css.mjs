// The CSS ships as files the app imports: src/styles.css (structural) and src/styled.css (imports it, adds the
// preset). Copy both to dist/.
import { copyFileSync, mkdirSync } from 'node:fs'

const out = new URL('../dist/', import.meta.url)
mkdirSync(out, { recursive: true })
for (const f of ['styles.css', 'styled.css']) copyFileSync(new URL(`../src/${f}`, import.meta.url), new URL(f, out))
console.log('copied src/styles.css, src/styled.css to dist/')
