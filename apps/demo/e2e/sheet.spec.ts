import { expect, type Page, test } from '@playwright/test'

// ---------- helpers ----------

const events = (page: Page) => page.evaluate(() => window.__ybs.events)

async function waitForEvent(page: Page, match: string | RegExp, timeout = 5000) {
  await expect
    .poll(async () => (await events(page)).some((e) => (typeof match === 'string' ? e.includes(match) : match.test(e))), {
      timeout,
      message: `event ${String(match)}`,
    })
    .toBe(true)
}

async function clearEvents(page: Page) {
  await page.evaluate(() => {
    window.__ybs.events.length = 0
  })
}

/** scrollTop of the sheet scroller, its height (H) and the full position. */
const geometry = (page: Page) =>
  page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('[data-ybs-scroller]')!
    const sheet = document.querySelector<HTMLElement>('[data-ybs-sheet]')!
    return { st: s.scrollTop, H: s.clientHeight, full: Math.min(s.clientHeight, sheet.offsetHeight) }
  })

async function openLab(page: Page, query = '') {
  await page.goto(`/?open=1${query}#/lab`)
  await waitForEvent(page, /lab: onDetentChange/)
}

/** Center of the visible part of the sheet header. */
async function headerPoint(page: Page) {
  const box = (await page.locator('[data-ybs-header]').boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + 30 }
}

// ---------- tests ----------

test('opens at the first partial detent', async ({ page }) => {
  await openLab(page)
  expect(await events(page)).toContain('lab: onDetentChange 0.5')
  const g = await geometry(page)
  expect(Math.abs(g.st - g.H * 0.5)).toBeLessThan(3)
})

test('short content: full fits the content; 0.5 only if well below it', async ({ page }) => {
  await openLab(page, '&short=1')
  const g = await geometry(page)
  expect(g.full).toBeLessThan(g.H)
  await expect(page.locator('[data-ybs-root]')).toHaveAttribute('data-ybs-fit', '')
  // A partial detent within 15% of full is dropped (it would be pointless).
  const keepsMedium = g.H * 0.5 < g.full * 0.85
  await waitForEvent(page, keepsMedium ? 'lab: onDetentChange 0.5' : 'lab: onDetentChange full')
  const expected = keepsMedium ? g.H * 0.5 : g.full
  expect(Math.abs((await geometry(page)).st - expected)).toBeLessThan(3)
})

test('modal semantics: dialog role, inert page, Escape closes and restores focus', async ({ page }, info) => {
  test.skip(info.project.name !== 'firefox-desktop', 'keyboard focus flow is a desktop concern')
  await page.goto('/#/lab')
  await page.locator('#open-lab').focus()
  await page.keyboard.press('Enter')
  await waitForEvent(page, 'lab: onDetentChange 0.5')

  const dialog = page.getByRole('dialog', { name: 'Sheet' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toBeFocused()
  await expect(page.locator('#root')).toHaveAttribute('inert', '')

  await page.keyboard.press('Escape')
  await waitForEvent(page, 'lab: onOpenChange false')
  await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
  await expect(page.locator('#root')).not.toHaveAttribute('inert')
  await expect(page.locator('#open-lab')).toBeFocused()
})

test('tapping the dimmed area closes', async ({ page }) => {
  await openLab(page)
  await page.mouse.click(40, 120) // above the sheet at the 0.5 detent: the spacer
  await waitForEvent(page, 'lab: onOpenChange false')
  await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
})

test('wheel steps detents, then scrolls content, and stops at the content top', async ({ page }, info) => {
  test.skip(info.project.name === 'webkit-mobile', 'no wheel on mobile WebKit')
  await openLab(page)
  const p = await headerPoint(page)
  await page.mouse.move(p.x, p.y + 120)
  const gap = () => page.waitForTimeout(400) // > the 250ms wheel-gesture gap

  // A small wheel at a partial detent steps the sheet up (it must not snap back and look dead).
  await page.mouse.wheel(0, 100)
  await waitForEvent(page, 'lab: onDetentChange full')
  const { full } = await geometry(page)

  // At full, the next gesture scrolls the content.
  // (one wheel event per gesture: Playwright's wheel calls can land >250ms apart, i.e. separate gestures)
  await gap()
  await page.mouse.wheel(0, 450)
  await expect.poll(async () => (await geometry(page)).st).toBeGreaterThan(full + 100)

  // Scrolling back up in one gesture stops at the content top, not lower.
  await gap()
  await page.mouse.wheel(0, -3000)
  await page.waitForTimeout(700)
  expect(Math.abs((await geometry(page)).st - full)).toBeLessThan(3)

  // A new upward gesture at full steps down a detent, then another closes.
  await gap()
  await page.mouse.wheel(0, -100)
  await waitForEvent(page, /lab: onDetentChange 0\.5$/)
  await gap()
  await page.mouse.wheel(0, -100)
  await waitForEvent(page, 'lab: onOpenChange false')
})

test('mouse drag on the header picks a detent from velocity', async ({ page }, info) => {
  test.skip(info.project.name !== 'firefox-desktop', 'mouse drag is the desktop path')
  await openLab(page)
  await clearEvents(page)
  const p = await headerPoint(page)
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(p.x, p.y - i * 25) // quick flick up
  await page.mouse.up()
  await waitForEvent(page, 'lab: onDetentChange full')

  const q = await headerPoint(page)
  await page.mouse.move(q.x, q.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(q.x, q.y + i * 40) // quick flick down
  await page.mouse.up()
  await waitForEvent(page, 'lab: onOpenChange false')
})

// Real touch-scroll gestures, Chromium only (CDP). This is the single-scroller claim itself.
test.describe('touch gestures (Chromium)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP only')

  // Synthesized touch scrolls don't move scrollers on Linux CI Chromium (they do on macOS). Probe first,
  // and skip with a clear reason rather than fail; real-device runs cover touch (scripts/android-suite.sh).
  test.beforeEach(async ({ page }) => {
    await openLab(page)
    // Record any scroll movement during the probe (snapping may put it back afterwards).
    await page.evaluate(() => {
      const s = document.querySelector('[data-ybs-scroller]')!
      const start = s.scrollTop
      ;(window as unknown as { __moved: number }).__moved = 0
      s.addEventListener('scroll', () => {
        const w = window as unknown as { __moved: number }
        w.__moved = Math.max(w.__moved, Math.abs(s.scrollTop - start))
      })
    })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.synthesizeScrollGesture', {
      x: 200, y: 700, yDistance: -60, speed: 400, gestureSourceType: 'touch', preventFling: true,
    })
    await page.waitForTimeout(300)
    const moved = (await page.evaluate(() => (window as unknown as { __moved: number }).__moved)) > 5
    test.skip(!moved, 'synthesized touch scrolling is not supported in this environment')
    await page.reload()
    await waitForEvent(page, /lab: onDetentChange/)
  })

  async function gesture(page: Page, y: number, distance: number, speed: number, fling: boolean) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.synthesizeScrollGesture', {
      x: 200,
      y,
      yDistance: distance, // negative = finger moves up = content scrolls down
      speed,
      gestureSourceType: 'touch',
      preventFling: !fling,
    })
  }

  test('one slow drag goes from the partial detent, through full, into the content', async ({ page }) => {
    await openLab(page)
    const { H } = await geometry(page)
    await gesture(page, H * 0.8, -(H * 0.5 + 300), 600, false)
    await page.waitForTimeout(300)
    const g = await geometry(page)
    expect(g.st).toBeGreaterThan(g.full + 150)
  })

  test('a fling down from deep content stops at the content top (guard)', async ({ page }) => {
    await openLab(page)
    const { H } = await geometry(page)
    await gesture(page, H * 0.8, -(H * 0.5 + 600), 800, false)
    await page.waitForTimeout(300)
    await clearEvents(page)
    await gesture(page, H * 0.3, 450, 6000, true)
    await page.waitForTimeout(1500)
    const g = await geometry(page)
    expect(Math.abs(g.st - g.full)).toBeLessThan(3)
    await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
  })

  test('a slow drag down from content moves the sheet in the same gesture', async ({ page }) => {
    await openLab(page)
    const { H } = await geometry(page)
    await gesture(page, H * 0.8, -(H * 0.5 + 200), 800, false) // ~200px into content
    await page.waitForTimeout(300)
    await clearEvents(page)
    expect((await geometry(page)).st).toBeGreaterThan((await geometry(page)).full + 100)
    await gesture(page, H * 0.15, H * 0.75, 600, false) // past the content top, sheet follows
    await page.waitForTimeout(1200)
    // The same gesture carried the sheet below full; it then settled at 0.5 (or closed).
    const ev = await events(page)
    const release = ev.filter((e) => e.startsWith('lab: release @')).pop()!
    expect(Number(release.split('@')[1])).toBeLessThan(H - 50)
    const open = await page.locator('[data-ybs-scroller]').count()
    if (open) expect(Math.abs((await geometry(page)).st - H * 0.5)).toBeLessThan(3)
  })
})

// Every demo scenario opens and reports a detent without errors.
for (const id of ['places', 'comments', 'product', 'share', 'filters', 'playlist']) {
  test(`scenario ${id} opens cleanly`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`/?open=1#/${id}`)
    await waitForEvent(page, new RegExp(`${id}: onDetentChange`))
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(errors).toEqual([])
  })
}

// ---------- stacking ----------

test.describe('stacked sheets', () => {
  test('a sheet opened from a sheet stacks on top; the one below is covered and inert', async ({ page }) => {
    await page.goto('/?open=1#/settings')
    await waitForEvent(page, 'settings: onDetentChange')
    await page.getByRole('button', { name: /Appearance/ }).click()
    await waitForEvent(page, 'appearance: onDetentChange')

    const roots = page.locator('[data-ybs-root]')
    await expect(roots).toHaveCount(2)
    await expect(roots.nth(0)).toHaveAttribute('data-ybs-covered', '')
    await expect(roots.nth(0)).toHaveAttribute('inert', '')
    await expect(page.getByRole('dialog', { name: 'Appearance' })).toBeVisible()

    // Three levels.
    await page.getByRole('button', { name: /Accent colour/ }).click()
    await waitForEvent(page, 'accent: onDetentChange')
    await expect(roots).toHaveCount(3)
    await expect(roots.nth(1)).toHaveAttribute('data-ybs-covered', '')
  })

  test('Escape closes only the top sheet and returns focus to its trigger', async ({ page }, info) => {
    test.skip(info.project.name !== 'firefox-desktop', 'keyboard flow is a desktop concern')
    await page.goto('/?open=1#/settings')
    await waitForEvent(page, 'settings: onDetentChange')
    const trigger = page.getByRole('button', { name: /Appearance/ })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await waitForEvent(page, 'appearance: onDetentChange')
    await expect(page.locator('[data-ybs-root]')).toHaveCount(2)

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    await expect(page.locator('[data-ybs-root]')).not.toHaveAttribute('data-ybs-covered', '')
    await expect(page.locator('[data-ybs-root]')).not.toHaveAttribute('inert', '')
    await expect(trigger).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
  })

  test('tapping the dimmed area closes only the top sheet', async ({ page }) => {
    await page.goto('/?open=1#/settings')
    await waitForEvent(page, 'settings: onDetentChange')
    await page.locator('#open-language').click()
    await waitForEvent(page, 'language: onDetentChange 0.6')
    await page.mouse.click(40, 80)
    await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  })
})

// ---------- many sheets ----------

test('1000 rows, each with its own sheet: renders fast and any row opens its sheet', async ({ page }) => {
  await page.goto('/#/thousand')
  await page.locator('#open-orders').click()
  await waitForEvent(page, /orders: rendered 1000 rows/)
  const line = (await events(page)).find((e) => e.startsWith('orders: rendered'))!
  const ms = Number(/in ([\d.]+)ms/.exec(line)![1])
  console.log(`[${test.info().project.name}] ${line}`)
  expect(ms).toBeLessThan(1500)
  await waitForEvent(page, 'orders: onDetentChange')

  await page.locator('[data-order="500"]').click()
  await waitForEvent(page, 'order-500: onDetentChange')
  await expect(page.getByRole('dialog', { name: 'Order #48710' })).toBeVisible()
  await expect(page.locator('[data-ybs-root]')).toHaveCount(2)
})

test('wide screen: clicking beside the sheet closes it, clicking inside does not', async ({ page }, info) => {
  test.skip(info.project.name !== 'firefox-desktop', 'desktop layout (sheet narrower than the screen)')
  await page.setViewportSize({ width: 1200, height: 860 })
  await openLab(page)
  const box = (await page.locator('[data-ybs-sheet]').boundingBox())!
  expect(box.width).toBeLessThan(1200)

  await page.mouse.click(box.x + box.width / 2, 760) // on a row: stays open
  await page.waitForTimeout(300)
  await expect(page.locator('[data-ybs-root]')).toHaveCount(1)

  await page.mouse.click(box.x / 2, 760) // beside the sheet, level with its content
  await waitForEvent(page, 'lab: onOpenChange false')
  await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
})

test('every settings row opens its own stacked sheet', async ({ page }) => {
  await page.goto('/?open=1#/settings')
  await waitForEvent(page, 'settings: onDetentChange')
  for (const name of ['Privacy', 'Storage', 'Help', 'About']) {
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: new RegExp(`^${name}`) }).click()
    await waitForEvent(page, `${name.toLowerCase()}: onDetentChange`)
    await expect(page.getByRole('dialog', { name })).toBeVisible()
    await expect(page.locator('[data-ybs-root]')).toHaveCount(2)
    await page.mouse.click(30, 60) // above the stacked sheet: closes only it
    await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
  }
})

// Regression: a finger down while the sheet settles at closed meant scrollend arrived "touching", the
// close never finished, and the invisible sheet layer stayed over the page (Firefox Android report).
test('a touch held while the sheet finishes closing still lets it close', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP touch events')
  await openLab(page)
  const cdp = await page.context().newCDPSession(page)
  await page.mouse.click(40, 120) // tap outside: starts closing
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 700 }] })
  await page.waitForTimeout(1200) // the close animation settles while the finger is down
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await waitForEvent(page, 'lab: onOpenChange false')
  await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
  await expect(page.locator('#root')).not.toHaveAttribute('inert')
})

test.describe('persistent (non-modal) sheet', () => {
  const st = (page: Page) => page.evaluate(() => document.querySelector('[data-ybs-scroller]')!.scrollTop)

  async function openSolved(page: Page) {
    await page.goto('/#/persistent')
    await page.locator('#solve').click()
    await waitForEvent(page, 'solved: onDetentChange full')
  }

  test('no backdrop, the page stays usable, and taps reach it', async ({ page }) => {
    await openSolved(page)
    await expect(page.locator('[data-ybs-backdrop]')).toHaveCount(0)
    await expect(page.locator('#root')).not.toHaveAttribute('inert')
    await expect(page.getByRole('dialog', { name: 'Solved' })).toHaveAttribute('aria-modal', 'false')
    // A tap on the board (above the sheet) reaches the page; the app drops the sheet to its peek.
    await page.getByRole('button', { name: 'Cell 1', exact: true }).click({ force: true }) // cells animate
    await expect(page.getByTestId('board-taps')).toHaveText('1')
    await waitForEvent(page, 'solved: onDetentChange 76px')
    await expect.poll(() => st(page)).toBeCloseTo(76, -1)
    // At the peek most of the board is uncovered and still tappable.
    await page.getByRole('button', { name: 'Cell 20', exact: true }).click({ force: true }) // cells animate
    await expect(page.getByTestId('board-taps')).toHaveText('2')
    await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
  })

  test('Escape drops it to the peek instead of closing', async ({ page }, info) => {
    test.skip(info.project.name !== 'firefox-desktop', 'keyboard is a desktop concern')
    await openSolved(page)
    await page.keyboard.press('Escape')
    await waitForEvent(page, 'solved: onDetentChange 76px')
    await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
    expect((await events(page)).some((e) => e.startsWith('solved: onOpenChange'))).toBe(false)
  })

  test('the wheel steps between peek and full but never closes it', async ({ page }, info) => {
    test.skip(info.project.name === 'webkit-mobile', 'no wheel on mobile WebKit')
    await openSolved(page)
    const box = (await page.locator('[data-ybs-header]').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + 30)
    await page.mouse.wheel(0, -120)
    await waitForEvent(page, 'solved: onDetentChange 76px')
    await page.waitForTimeout(400)
    const peek = (await page.locator('[data-ybs-header]').boundingBox())!
    await page.mouse.move(peek.x + peek.width / 2, peek.y + 30)
    await page.mouse.wheel(0, -120) // already at the floor: stays
    await page.waitForTimeout(800)
    await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
    expect(await st(page)).toBeCloseTo(76, -1)
  })

  test('the controlled detent and New board work', async ({ page }) => {
    await openSolved(page)
    await page.getByRole('button', { name: 'Show less' }).click()
    await waitForEvent(page, 'solved: onDetentChange 76px')
    await page.getByRole('button', { name: 'Show more' }).click()
    await clearEvents(page)
    await waitForEvent(page, 'solved: onDetentChange full')
    await page.getByRole('button', { name: 'New board' }).click()
    await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
    await expect(page.locator('#solve')).toBeVisible()
  })

  test('touch: a drag on the sheet moves it, and a fling down stops at the peek', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch')
    await openSolved(page)
    const cdp = await page.context().newCDPSession(page)
    const H = await page.evaluate(() => document.querySelector('[data-ybs-scroller]')!.clientHeight)
    const header = (await page.locator('[data-ybs-header]').boundingBox())!
    await page.evaluate(() => {
      const s = document.querySelector('[data-ybs-scroller]')!
      ;(window as unknown as { __min: number }).__min = s.scrollTop
      s.addEventListener('scroll', () => {
        const w = window as unknown as { __min: number }
        w.__min = Math.min(w.__min, s.scrollTop)
      })
    })
    await clearEvents(page)
    // A fling down that starts on the sheet (pointer-events passthrough must still let it scroll the scroller).
    await cdp.send('Input.synthesizeScrollGesture', {
      x: Math.round(header.x + header.width / 2), y: Math.round(header.y + 30), yDistance: Math.round(H * 0.6),
      speed: 5000, gestureSourceType: 'touch', preventFling: false,
    })
    await page.waitForTimeout(1500)
    const moved = await page.evaluate(() => (window as unknown as { __min: number }).__min)
    test.skip(moved > H - 50 && (await st(page)) > H - 50, 'synthesized touch scrolling is not supported in this environment')
    await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
    expect(await st(page)).toBeCloseTo(76, -1)
    expect((await events(page)).some((e) => e.startsWith('solved: onOpenChange'))).toBe(false)
  })
})

test('unmounting two stacked sheets at once restores page scrolling', async ({ page }) => {
  await page.goto('/?open=1#/settings')
  await waitForEvent(page, /settings: onDetentChange/)
  await page.getByRole('button', { name: /Appearance/ }).click()
  await waitForEvent(page, /appearance: onDetentChange/)
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden')
  await page.evaluate(() => (location.hash = '#/')) // route change unmounts both sheets mid-open
  await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('')
})
