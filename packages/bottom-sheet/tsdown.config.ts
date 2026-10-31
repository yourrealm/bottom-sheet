import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    styled: 'src/styled/index.tsx',
  },
  format: ['esm'],
  dts: true,
  platform: 'neutral',
})
