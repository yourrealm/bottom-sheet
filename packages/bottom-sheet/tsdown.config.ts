import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    styled: 'src/styled/index.tsx',
  },
  format: ['esm'],
  dts: true,
  platform: 'neutral',
  // Everything here is client-side (state, effects, the DOM): React Server Components frameworks (Next.js App Router)
  // can then import it from a server component without a wrapper.
  banner: { js: "'use client';" },
})
