import { defineConfig, devices } from '@playwright/test'

/**
 * Logic tests for the sheet in real engines. They can't judge *feel* (do that on devices),
 * but they catch regressions in detents, the momentum guard, focus/inert, and closing.
 *
 * Chromium also gets real touch-scroll gestures (CDP Input.synthesizeScrollGesture),
 * so the one-gesture handoff and the fling guard are exercised end to end there.
 */
const PORT = 5190

export default defineConfig({
  testDir: './e2e',
  timeout: 20_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    // channel 'chromium' = full Chromium (new headless). The default headless shell ignores synthesized
    // touch-scroll gestures on Linux CI.
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'], channel: 'chromium' } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 15'] } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'], viewport: { width: 420, height: 860 } } },
  ],
})
