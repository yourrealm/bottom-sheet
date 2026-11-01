// Run by `pnpm release` / `pnpm pack:check` (and by prepack when lifecycle scripts are enabled). The package's `exports` point at src/ for the workspace; only
// pnpm swaps in `publishConfig.exports` (dist/), so refuse npm/yarn, which would publish src paths.
// Then copy the repo README and LICENSE in, so they ship with the package (removed again by postpack).
import { copyFileSync } from 'node:fs'

const agent = process.env.npm_config_user_agent ?? ''
if (!agent.startsWith('pnpm/')) {
  console.error('Publish with pnpm (pnpm publish): only pnpm applies publishConfig.exports, which point at dist/.')
  process.exit(1)
}
for (const f of ['README.md', 'LICENSE']) copyFileSync(new URL(`../../../${f}`, import.meta.url), new URL(`../${f}`, import.meta.url))
