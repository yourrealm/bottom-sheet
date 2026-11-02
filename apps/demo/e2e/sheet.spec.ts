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

// Found porting dapuzzler: a key pressed right after Escape still landed in the sheet, because the page stayed
// inert (and focus in the sheet) until the close animation finished.
test('the page takes focus and input back as soon as the sheet starts closing', async ({ page }, info) => {
  test.skip(info.project.name !== 'firefox-desktop', 'keyboard focus flow is a desktop concern')
  await page.goto('/#/lab')
  await page.locator('#open-lab').focus()
  await page.keyboard.press('Enter')
  await waitForEvent(page, 'lab: onDetentChange 0.5')
  await page.keyboard.press('Escape')
  // Synchronously after Escape, while the sheet is still on screen sliding out:
  const now = await page.evaluate(() => ({
    mounted: !!document.querySelector('[data-ybs-root]'),
    closingInert: document.querySelector('[data-ybs-root]')?.hasAttribute('inert') ?? null,
    pageInert: document.getElementById('root')!.hasAttribute('inert'),
    focused: document.activeElement?.id,
  }))
  // The closing sheet itself still catches taps (see the next test); only the page is released.
  expect(now).toEqual({ mounted: true, closingInert: false, pageInert: false, focused: 'open-lab' })
  await waitForEvent(page, 'lab: onOpenChange false')
})

test('tapping the dimmed area closes', async ({ page }) => {
  await openLab(page)
  await page.mouse.click(40, 120) // above the sheet at the 0.5 detent: the spacer
  await waitForEvent(page, 'lab: onOpenChange false')
  await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
})

test('close buttons: a visible ✕ when asked, otherwise one only screen readers get, none when not dismissible', async ({ page }) => {
  // closeButton: a visible ✕ named "Close" that closes the sheet.
  await page.goto('/?open=1#/product')
  await waitForEvent(page, /product: onDetentChange/)
  const x = page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true })
  await expect(x).toBeVisible()
  await x.click()
  await waitForEvent(page, 'product: onExitComplete roots=0')
  // Without it: a dismissible sheet still has a "Close" button in the accessibility tree, visually hidden.
  await page.goto('/?open=1#/filters')
  await waitForEvent(page, /filters: onDetentChange/)
  const sr = page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true })
  await expect(sr).toHaveCount(1)
  expect(await sr.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1)
  await sr.evaluate((el: HTMLElement) => el.click())
  await waitForEvent(page, 'filters: onExitComplete roots=0')
  // A sheet that can't be dismissed gets none.
  await page.goto('/#/persistent')
  await page.locator('#solve').click()
  await waitForEvent(page, 'solved: onDetentChange full')
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true })).toHaveCount(0)
})

test('eyebrow: a label above the title, read with it', async ({ page }) => {
  await page.goto('/?open=1#/share')
  await waitForEvent(page, /share: onDetentChange/)
  await expect(page.getByRole('dialog', { name: /^Gamla stan ?, Share photo$/ })).toBeVisible()
  const [eyebrow, title] = await page.evaluate(() => ['.ybs-eyebrow', '.ybs-title'].map((s) => document.querySelector(s)!.getBoundingClientRect().top))
  expect(eyebrow).toBeLessThan(title! + 1) // the eyebrow is at the top of the title element, above the title text
})

test('a footer stays under the header at a header peek, and pins to the bottom with room', async ({ page }) => {
  await page.goto('/?float=1#/lab')
  await waitForEvent(page, 'float: onDetentChange header')
  await page.waitForTimeout(300)
  const at = () => page.evaluate(() => {
    const r = (s: string) => document.querySelector(s)!.getBoundingClientRect()
    return { headerBottom: r('.ybs-header').bottom, footerTop: r('.ybs-footer').top, footerBottom: r('.ybs-footer').bottom, H: innerHeight }
  })
  const peek = await at()
  expect(peek.footerTop).toBeGreaterThanOrEqual(peek.headerBottom - 1) // not over the title
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#open-lab, .lab .primary')!.blur())
  await page.getByRole('dialog', { name: 'Floating' }).evaluate(() => {
    const s = document.querySelector('[data-ybs-scroller]')!; s.scrollTop = s.clientHeight * 0.5
  })
  await page.waitForTimeout(600)
  const half = await at()
  expect(half.footerTop).toBeGreaterThan(half.headerBottom) // room: pinned at the bottom, below the header
  expect(half.footerBottom).toBeGreaterThan(half.H - 40)
})

test('only a header peek catches flings: its snap point stops momentum, other partial detents do not', async ({ page }) => {
  await page.goto('/?float=1#/lab')
  await waitForEvent(page, 'float: onDetentChange header')
  const stops = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-ybs-marker]:not([hidden])')].map((m) => getComputedStyle(m).scrollSnapStop))
  expect(stops.filter((s) => s === 'always')).toHaveLength(1) // the header peek; half (0.5) and closed let a fling past
  await page.goto('/?open=1#/filters') // a plain 0.5 detent: no catch
  await waitForEvent(page, /filters: onDetentChange/)
  expect(await page.locator('[data-ybs-catch]').count()).toBe(0)
})

test('a sheet without a title is named by aria-label', async ({ page }) => {
  await page.goto('/?untitled=1#/lab')
  await expect(page.getByRole('dialog', { name: 'Photo options' })).toBeVisible()
  await expect(page.locator('.ybs-title')).toHaveCount(0)
})

test('onExitComplete fires once, after the close animation, with the sheet gone', async ({ page }) => {
  await openLab(page)
  expect((await events(page)).some((e) => e.includes('onExitComplete'))).toBe(false)
  await page.mouse.click(40, 120)
  await waitForEvent(page, 'lab: onExitComplete roots=0')
  const ev = await events(page)
  expect(ev.filter((e) => e.includes('onExitComplete'))).toHaveLength(1)
  expect(ev.indexOf('lab: onOpenChange false')).toBeLessThan(ev.indexOf('lab: onExitComplete roots=0'))
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
    // Start in the content, below the sticky header (a drag on the header moves the sheet by itself, see below).
    const headerBottom = (await page.locator('[data-ybs-header]').boundingBox())!
    const y = Math.max(H * 0.15, headerBottom.y + headerBottom.height + 30)
    await gesture(page, y, H * 0.75, 600, false) // past the content top, sheet follows
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
  // The peek is the 'header' detent: exactly the header's height, nothing of the body showing.
  const headerH = (page: Page) => page.evaluate(() => (document.querySelector('[data-ybs-header]') as HTMLElement).offsetHeight)

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
    await waitForEvent(page, 'solved: onDetentChange header')
    await expect.poll(async () => (await st(page)) - (await headerH(page))).toBeCloseTo(0, 0)
    // At the peek most of the board is uncovered and still tappable.
    await page.getByRole('button', { name: 'Cell 20', exact: true }).click({ force: true }) // cells animate
    await expect(page.getByTestId('board-taps')).toHaveText('2')
    await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
  })

  test('Escape drops it to the peek instead of closing', async ({ page }, info) => {
    test.skip(info.project.name !== 'firefox-desktop', 'keyboard is a desktop concern')
    await openSolved(page)
    await page.keyboard.press('Escape')
    await waitForEvent(page, 'solved: onDetentChange header')
    await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
    expect((await events(page)).some((e) => e.startsWith('solved: onOpenChange'))).toBe(false)
  })

  test('the wheel steps between peek and full but never closes it', async ({ page }, info) => {
    test.skip(info.project.name === 'webkit-mobile', 'no wheel on mobile WebKit')
    await openSolved(page)
    const box = (await page.locator('[data-ybs-header]').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + 30)
    await page.mouse.wheel(0, -120)
    await waitForEvent(page, 'solved: onDetentChange header')
    await page.waitForTimeout(400)
    const peek = (await page.locator('[data-ybs-header]').boundingBox())!
    await page.mouse.move(peek.x + peek.width / 2, peek.y + 30)
    await page.mouse.wheel(0, -120) // already at the floor: stays
    await page.waitForTimeout(800)
    await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
    expect((await st(page)) - (await headerH(page))).toBeCloseTo(0, 0)
  })

  test('the controlled detent and New board work', async ({ page }) => {
    await openSolved(page)
    await page.getByRole('button', { name: 'Show less' }).click()
    await waitForEvent(page, 'solved: onDetentChange header')
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
    const start = await st(page) // full: the sheet's own height (it's shorter than the screen)
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
    // CI's headless Linux Chromium ignores synthesized touch scrolls: nothing moved at all.
    test.skip(moved > start - 20 && Math.abs((await st(page)) - start) < 20, 'synthesized touch scrolling is not supported in this environment')
    await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
    expect((await st(page)) - (await headerH(page))).toBeCloseTo(0, 0)
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

test('Tailwind v4 layers: utilities beat the preset, preflight does not wipe it', async ({ page }) => {
  await openLab(page)
  // What `@import "tailwindcss"` emits: an order statement, preflight in `base`, utilities in `utilities`.
  await page.addStyleTag({
    content: `@layer theme, base, components, utilities;
      @layer base { *, ::after, ::before { margin: 0; padding: 0; border: 0 solid; } }
      @layer utilities { .max-w-none { max-width: none; } }`,
  })
  const header = page.locator('.ybs-header')
  await expect(header).toHaveCSS('padding-left', '16px') // the preset survives preflight
  const sheet = page.locator('.ybs-sheet')
  await expect(sheet).toHaveCSS('max-width', '640px')
  await sheet.evaluate((el) => el.classList.add('max-w-none'))
  await expect(sheet).toHaveCSS('max-width', 'none') // a utility on a part wins
})

test('back button (CloseWatcher): Escape goes through the watcher and closes only the top sheet', async ({ page }) => {
  await page.goto('/?open=1#/settings')
  await waitForEvent(page, 'settings: onDetentChange')
  const hasWatcher = await page.evaluate(() => 'CloseWatcher' in window)
  await page.getByRole('button', { name: /Appearance/ }).click() // a real tap: the watcher gets its own group
  await waitForEvent(page, 'appearance: onDetentChange')
  await expect(page.locator('[data-ybs-root]')).toHaveCount(2)

  await page.keyboard.press('Escape')
  await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  // Where the browser has CloseWatcher, the top sheet's watcher handled it (and reported Escape, not back).
  if (hasWatcher) expect(await events(page)).toContain('appearance: close watcher: escape')
  else expect((await events(page)).some((e) => e.includes('close watcher'))).toBe(false)
})

test('a non-modal sheet leaves back and Escape order alone: no watcher', async ({ page }) => {
  await page.goto('/?open=1#/persistent')
  await waitForEvent(page, /solved: onDetentChange full/)
  await page.keyboard.press('Escape')
  await waitForEvent(page, 'solved: onDetentChange header')
  expect((await events(page)).some((e) => e.includes('close watcher'))).toBe(false)
})

test('without CloseWatcher (Safari today), the Escape listener still closes only the top sheet', async ({ page }) => {
  await page.addInitScript(() => delete (window as { CloseWatcher?: unknown }).CloseWatcher)
  await page.goto('/?open=1#/settings')
  await waitForEvent(page, 'settings: onDetentChange')
  await page.getByRole('button', { name: /Appearance/ }).click()
  await waitForEvent(page, 'appearance: onDetentChange')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
  expect((await events(page)).some((e) => e.includes('close watcher'))).toBe(false)
})

for (const watcher of [true, false]) {
  test(`Escape pressed while the top sheet is closing goes to the sheet below (CloseWatcher ${watcher ? 'on' : 'off'})`, async ({ page }) => {
    if (!watcher) await page.addInitScript(() => delete (window as { CloseWatcher?: unknown }).CloseWatcher)
    await page.goto('/?open=1#/settings')
    await waitForEvent(page, 'settings: onDetentChange')
    await page.getByRole('button', { name: /Appearance/ }).click()
    await waitForEvent(page, 'appearance: onDetentChange')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape') // Appearance is still animating out
    await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
  })
}

test('aria-describedby only points at a Description that exists', async ({ page }) => {
  await openLab(page)
  const describedBy = await page.locator('[data-ybs-sheet]').getAttribute('aria-describedby')
  if (describedBy) await expect(page.locator(`[id="${describedBy}"]`)).toHaveCount(1)
  await page.goto('/?open=1#/persistent') // no description
  await waitForEvent(page, /solved: onDetentChange full/)
  await expect(page.locator('[data-ybs-sheet]')).not.toHaveAttribute('aria-describedby')
})

test('content that changes height mid-scroll does not yank the sheet back to its detent', async ({ page }) => {
  await openLab(page)
  await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('[data-ybs-scroller]')!
    const sheet = document.querySelector<HTMLElement>('[data-ybs-sheet]')!
    s.scrollTo({ top: Math.min(s.clientHeight, sheet.offsetHeight) }) // rest at full
  })
  await waitForEvent(page, 'lab: onDetentChange full')
  await page.waitForTimeout(200)
  const full = (await geometry(page)).full
  // A user-driven smooth scroll into the content (not one of the controller's own moves)…
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ybs-scroller]')!.scrollBy({ top: 1500, behavior: 'smooth' }))
  await page.waitForTimeout(60)
  // …while the content grows (an image loading, a list appending).
  await page.evaluate(() => {
    const extra = document.createElement('div')
    extra.style.height = '400px'
    document.querySelector('[data-ybs-sheet]')!.append(extra)
  })
  await expect.poll(async () => (await geometry(page)).st, { timeout: 3000 }).toBeGreaterThan(full + 500)
})

test.describe('page sheet and fullscreen', () => {
  test('a page sheet opens straight to full and fills the screen, even with short content', async ({ page }) => {
    await page.goto('/?open=1#/notes')
    await waitForEvent(page, 'notes: onDetentChange full')
    const g = await geometry(page)
    expect(g.full).toBe(g.H) // not fit-content
    expect(Math.abs(g.st - g.H)).toBeLessThan(3)
    // Header bar: Cancel / title / Save, title centred between them.
    const bar = page.locator('.ybs-bar')
    await expect(bar.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(bar.getByRole('button', { name: 'Save' })).toBeVisible()
    const title = (await bar.locator('.ybs-title').boundingBox())!
    const sheet = (await page.locator('[data-ybs-sheet]').boundingBox())!
    expect(Math.abs(title.x + title.width / 2 - (sheet.x + sheet.width / 2))).toBeLessThan(2)
    await bar.getByRole('button', { name: 'Cancel' }).click()
    await waitForEvent(page, 'notes: onOpenChange false (close-button)')
  })

  test('full width: the sheet spans the window, the content stays in a column', async ({ page }, info) => {
    test.skip(info.project.name !== 'firefox-desktop', 'desktop layout')
    await page.setViewportSize({ width: 1400, height: 880 })
    await page.goto('/?open=1#/notes')
    await waitForEvent(page, 'notes: onDetentChange full')
    expect((await page.locator('[data-ybs-sheet]').boundingBox())!.width).toBe(1400)
    const cancel = (await page.getByRole('button', { name: 'Cancel' }).boundingBox())!
    expect(cancel.x).toBeGreaterThan(200) // (1400 - 960) / 2 = 220
  })

  test('fullscreen: no gap at the top and square corners there', async ({ page }) => {
    await page.goto('/?open=1&fullscreen=1#/notes')
    await waitForEvent(page, 'notes: onDetentChange full')
    const box = (await page.locator('[data-ybs-sheet]').boundingBox())!
    expect(Math.abs(box.y)).toBeLessThan(2)
    const radius = await page.locator('[data-ybs-sheet]').evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius))
    expect(radius).toBeLessThan(0.5)
    await page.keyboard.press('Escape')
    await waitForEvent(page, 'notes: onOpenChange false (escape)')
  })
})

test('floating: inset with a gap at the peek, attached at full', async ({ page }) => {
  await page.goto('/?open=1#/places')
  await waitForEvent(page, 'places: onDetentChange 0.35')
  // The bottom-left corner of the screen is in the floating gap (clipped, so it doesn't hit the sheet)…
  const cornerHitsSheet = () =>
    page.evaluate(() => !!document.elementFromPoint(3, innerHeight - 3)?.closest('[data-ybs-sheet]'))
  const midHitsSheet = () => page.evaluate(() => !!document.elementFromPoint(innerWidth / 2, innerHeight - 40)?.closest('[data-ybs-sheet]'))
  expect(await cornerHitsSheet()).toBe(false)
  expect(await midHitsSheet()).toBe(true)
  // …and part of the sheet once it attaches at full.
  await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('[data-ybs-scroller]')!
    s.scrollTo({ top: s.clientHeight })
  })
  await waitForEvent(page, 'places: onDetentChange full')
  await expect.poll(cornerHitsSheet).toBe(true)
})

test.describe('page behind recedes', () => {
  const state = (page: Page) =>
    page.evaluate(() => ({
      attr: document.documentElement.hasAttribute('data-ybs-recede'),
      scale: new DOMMatrix(getComputedStyle(document.querySelector('[data-ybs-background]')!).transform).a,
    }))

  test('a page sheet recedes the page, and it comes back after closing', async ({ page }) => {
    await page.goto('/#/notes')
    await page.click('#new-note')
    await waitForEvent(page, 'notes: onDetentChange full')
    const open = await state(page)
    expect(open.attr).toBe(true)
    expect(open.scale).toBeLessThan(0.95)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await waitForEvent(page, 'notes: onOpenChange false')
    await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
    expect(await state(page)).toEqual({ attr: false, scale: 1 }) // no transform left behind (fixed elements)
  })

  test('sheets without recede leave the page alone', async ({ page }) => {
    await page.goto('/?open=1#/settings')
    await waitForEvent(page, 'settings: onDetentChange')
    expect((await state(page)).attr).toBe(false)
  })
})

// Native: with the content scrolled, dragging the header moves the whole sheet and keeps the content where it is.
test.describe('header drag while the content is scrolled', () => {
  async function scrolledLab(page: Page) {
    await openLab(page)
    await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>('[data-ybs-scroller]')!
      s.scrollTop = s.clientHeight + 300
    })
    await expect(page.locator('[data-ybs-root]')).toHaveAttribute('data-ybs-scrolled', '')
    await page.waitForTimeout(200)
    await clearEvents(page)
    return (await geometry(page)).st
  }
  const drop = (page: Page) =>
    page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('[data-ybs-scroller]')!).transform).m42)

  test('a short drag moves the sheet, keeps the content offset, and springs back to full', async ({ page }) => {
    const st = await scrolledLab(page)
    const p = await headerPoint(page)
    await page.mouse.move(p.x, p.y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(p.x, p.y + i * 8)
    expect(await drop(page)).toBeGreaterThan(60)
    expect(Math.abs((await geometry(page)).st - st)).toBeLessThan(2)
    await page.waitForTimeout(150) // stop moving: no velocity
    await page.mouse.up()
    await expect.poll(() => drop(page)).toBe(0)
    expect(Math.abs((await geometry(page)).st - st)).toBeLessThan(2)
    await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
  })

  test('a flick down closes the sheet', async ({ page }) => {
    await scrolledLab(page)
    const p = await headerPoint(page)
    await page.mouse.move(p.x, p.y)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(p.x, p.y + i * 50)
    await page.mouse.up()
    await waitForEvent(page, 'lab: onOpenChange false')
  })

  test('touch (CDP): the header drag closes the sheet', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP only')
    await scrolledLab(page)
    const p = await headerPoint(page)
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: string, y: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y }] })
    await touch('touchStart', p.y)
    for (let i = 1; i <= 8; i++) await touch('touchMove', p.y + i * 50)
    await touch('touchEnd', p.y + 400)
    await waitForEvent(page, 'lab: onOpenChange false')
  })
})

// /styled follows the app's color-scheme (inherited from <html>), not only the OS: an app with its own theme
// switch gets a matching sheet.
test('the styled sheet follows the page color-scheme', async ({ page }) => {
  await openLab(page)
  const bg = () => page.evaluate(() => getComputedStyle(document.querySelector('.ybs-sheet')!).backgroundColor)
  await page.evaluate(() => (document.documentElement.style.colorScheme = 'dark'))
  expect(await bg()).toBe('rgb(28, 28, 30)')
  await page.evaluate(() => (document.documentElement.style.colorScheme = 'light'))
  expect(await bg()).toBe('rgb(255, 255, 255)')
})

test('the styled body is padded like the header; --ybs-body-padding: 0 makes it edge to edge', async ({ page }) => {
  const pad = () => page.evaluate(() => getComputedStyle(document.querySelector('.ybs-body')!).paddingLeft)
  await page.goto('/?open=1#/filters')
  await waitForEvent(page, /filters: onDetentChange/)
  expect(await pad()).toBe('16px')
  await openLab(page) // the lab's rows run edge to edge (className="edge")
  expect(await pad()).toBe('0px')
})

// Programmatic moves are our own animation (~400ms up, ~280ms down), not the browser's smooth scroll, which
// took 660-770ms on a phone. Snapping is off only while it runs.
test.describe('glide (programmatic moves)', () => {
  /** Record scrollTop and the glide attribute every frame, from now. */
  const record = (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { __frames: Array<[number, number, boolean]> }
      w.__frames = []
      const t0 = performance.now()
      const tick = () => {
        const s = document.querySelector<HTMLElement>('[data-ybs-scroller]')
        const r = document.querySelector('[data-ybs-root]')
        if (s) w.__frames.push([performance.now() - t0, s.scrollTop, !!r?.hasAttribute('data-ybs-glide')])
        if (performance.now() - t0 < 1500) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  const frames = (page: Page) => page.evaluate(() => (window as unknown as { __frames: Array<[number, number, boolean]> }).__frames)

  test('opening glides with snapping off, then rests with snapping back on', async ({ page }) => {
    await page.goto('/#/lab')
    await record(page)
    await page.locator('#open-lab').click()
    await waitForEvent(page, 'lab: onDetentChange 0.5')
    await page.waitForTimeout(1600)
    const f = await frames(page)
    const { H } = await geometry(page)
    const moving = f.filter(([, st, glide]) => glide && st > 1 && Math.abs(st - H * 0.5) > 2)
    // In-between frames: an animation, not a jump (a jump has none). Two, not more: a slow CI runner drew only 2-3
    // frames in the 400ms.
    expect(moving.length).toBeGreaterThanOrEqual(2)
    expect(f.at(-1)![2]).toBe(false) // snapping restored at rest
  })

  test('reduced motion: programmatic moves jump straight to the detent', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/#/lab')
    await record(page)
    await page.locator('#open-lab').click()
    await waitForEvent(page, 'lab: onDetentChange 0.5')
    const f = await frames(page)
    const { H } = await geometry(page)
    const between = f.filter(([, st]) => st > 2 && Math.abs(st - H * 0.5) > 2)
    expect(between).toEqual([])
    expect(f.some(([, , glide]) => glide)).toBe(false)
  })
})

// Touch taps outside the sheet close it from pointer events: after a swipe on the spacer, Chrome Android spends
// the next tap stopping an invisible fling and sends no click (it took two taps to close).
test('a touch tap on the dimmed area closes once (pointer path, the following click ignored)', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', 'touch emulation: mobile projects only')
  await openLab(page)
  await clearEvents(page)
  await page.touchscreen.tap(40, 120)
  await waitForEvent(page, 'lab: onOpenChange false')
  await page.waitForTimeout(500)
  expect((await events(page)).filter((e) => e === 'lab: onOpenChange false')).toHaveLength(1)
})

// A touch tap closes on pointerup, before the browser's click. That click must land on the closing sheet's own
// overlay, not fall through to a row of the sheet below (reported on the stacked "1000 rows" demo).
test('a tap on the overlay of a stacked sheet closes it without pressing the row underneath', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', 'touch emulation: mobile projects only')
  await page.goto('/?open=1#/thousand')
  await waitForEvent(page, /orders: onDetentChange/)
  await page.locator('[data-order="3"]').tap()
  await waitForEvent(page, /order-3: onDetentChange/)
  // A point on the overlay above the order sheet with a row of the list sheet underneath.
  const sheetTop = (await page.locator('[data-ybs-root]').last().locator('[data-ybs-sheet]').boundingBox())!.y
  const rows = await page.locator('[data-ybs-root]').first().locator('[data-order]').evaluateAll((els) =>
    els.map((e) => ({ id: e.getAttribute('data-order'), ...e.getBoundingClientRect().toJSON() })),
  )
  const row = rows.find((r) => r.y > 60 && r.y + r.height < sheetTop - 10)!
  expect(row).toBeTruthy()
  await clearEvents(page)
  await page.touchscreen.tap(200, row.y + row.height / 2)
  await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
  await page.waitForTimeout(600)
  expect((await events(page)).filter((e) => /^order-\d+: portal mount/.test(e))).toEqual([])
  await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
})

// Native: a tap on a list that is still scrolling only stops it. Chrome and Firefox Android sent the click in our
// snap scroller, so a fling-stopping tap opened a row's sheet. The controller drops the click of a touch that starts
// while the scroller is moving (a scroll event in the last 100ms).
test('a tap on a still-moving list stops it without pressing the row; a tap at rest presses it', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', 'touch emulation: mobile projects only')
  await page.goto('/?open=1#/thousand')
  await waitForEvent(page, /orders: onDetentChange/)
  const row = (await page.locator('[data-order="2"]').boundingBox())!
  const at = { x: row.x + row.width / 2, y: row.y + row.height / 2 }
  // "Moving": scroll events right before the touch.
  await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('[data-ybs-scroller]')!
    s.scrollTop += 1
    s.dispatchEvent(new Event('scroll'))
  })
  await page.touchscreen.tap(at.x, at.y)
  await page.waitForTimeout(500)
  await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
  await waitForEvent(page, 'orders: tap stopped the scroll: click dropped')
  // At rest, the same tap opens the row's sheet.
  await page.waitForTimeout(300)
  const row2 = (await page.locator('[data-order="2"]').boundingBox())!
  await page.touchscreen.tap(row2.x + row2.width / 2, row2.y + row2.height / 2)
  await expect(page.locator('[data-ybs-root]')).toHaveCount(2)
})

// BottomSheet's trigger can be a render function: your own button, with our onClick and ARIA state.
test('a function trigger renders your own button with the open state', async ({ page }) => {
  await page.goto('/#/share')
  const trigger = page.locator('#share-trigger')
  await expect(trigger).toHaveClass('primary') // ours, not wrapped in the preset's trigger button
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(await trigger.evaluate((el) => el.parentElement!.closest('button'))).toBeNull()
  await trigger.click()
  await waitForEvent(page, /share: onDetentChange/)
  await expect(page.getByRole('dialog', { name: 'Share photo' })).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
})

// Arriving at closed only closes the sheet after user input (or our own close). A stray scroll (the browser
// revealing a focused element, an app's scrollIntoView, a test runner) that snaps to closed is undone. Found in
// dapuzzler's tests: Playwright's scroll-into-view snapped the picker sheet closed before it could click.
test('a scroll to closed without user input goes back instead of closing', async ({ page }) => {
  await openLab(page)
  await page.waitForTimeout(3200) // past the input window of the click that opened it
  await clearEvents(page)
  await page.evaluate(() => (document.querySelector<HTMLElement>('[data-ybs-scroller]')!.scrollTop = 0))
  await waitForEvent(page, /lab: scrolled to closed without user input: back to 0\.5/)
  await expect.poll(async () => (await geometry(page)).st, { timeout: 3000 }).toBeGreaterThan(100)
  expect(await events(page)).not.toContain('lab: onOpenChange false')
  await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
})

// A color-scheme set on one sheet also reaches the bleed (the sheet colour behind the keyboard), which is outside it.
test('a color-scheme forced on one sheet reaches its bleed too', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/#/lab')
  await page.evaluate(() => (document.documentElement.style.colorScheme = 'light'))
  await page.addStyleTag({ content: '.ybs-sheet { color-scheme: dark }' })
  await page.locator('#open-lab').click()
  await waitForEvent(page, 'lab: onDetentChange 0.5')
  const bg = (sel: string) => page.evaluate((s) => getComputedStyle(document.querySelector(s)!).backgroundColor, sel)
  expect(await bg('.ybs-sheet')).toBe('rgb(28, 28, 30)')
  expect(await bg('[data-ybs-bleed]')).toBe('rgb(28, 28, 30)')
})

// initialFocus, like Base UI: a function of how the sheet was opened. The persistent demo focuses New board unless
// it was opened by touch.
test.describe('initialFocus', () => {
  test('opened with the mouse: the given element gets focus', async ({ page }) => {
    await page.goto('/#/persistent')
    await page.locator('#solve').click()
    await waitForEvent(page, 'solved: onDetentChange full')
    await expect(page.getByRole('button', { name: 'New board' })).toBeFocused()
  })
  test('opened by touch: the function says no, focus stays put', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'touch emulation: mobile projects only')
    await page.goto('/#/persistent')
    await page.locator('#solve').tap()
    await waitForEvent(page, 'solved: onDetentChange full')
    await expect(page.getByRole('button', { name: 'New board' })).not.toBeFocused()
    expect(await page.evaluate(() => document.activeElement?.closest('[data-ybs-sheet]') ?? null)).toBeNull()
  })
})

// The CSS is a plain stylesheet, so a strict CSP (no style-src 'unsafe-inline', as Holden's micro-app guide
// recommends) works. The policy blocks the demo's own dev-mode styles here; the library's file loads as a stylesheet.
test('works under a strict CSP', async ({ page }) => {
  const css = new URL('../../../packages/bottom-sheet/src/styled.css', import.meta.url).pathname
  await page.route((url) => url.pathname === '/', async (route) => {
    const res = await route.fetch()
    const html = (await res.text()).replace(
      '<head>',
      `<head><meta http-equiv="Content-Security-Policy" content="style-src 'self'"><link rel="stylesheet" href="/@fs${css}">`,
    )
    await route.fulfill({ response: res, body: html })
  })
  const blocked: string[] = []
  page.on('console', (m) => m.type() === 'error' && /Content Security Policy|Content-Security-Policy/i.test(m.text()) && blocked.push(m.text()))
  await page.goto('/?open=1#/lab')
  await waitForEvent(page, 'lab: onDetentChange 0.5')
  // The structural CSS is there (from the file), and the sheet rests at its detent.
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-ybs-scroller]')!).scrollSnapType)).toContain('mandatory')
  const g = await geometry(page)
  expect(Math.abs(g.st - g.H * 0.5)).toBeLessThan(3)
})

// Forgetting the import must be loud, in dev too: a sheet can't work without its CSS.
test('opening a sheet without its CSS logs an error naming the import', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto('/#/lab')
  // As if the file weren't loaded: the markers it sets are what the library checks.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ybs-css-core', '0')
    document.documentElement.style.setProperty('--ybs-css-styled', '0')
  })
  await page.locator('#open-lab').click()
  await expect.poll(() => errors.filter((e) => e.includes('@yourrealm/bottom-sheet')).length).toBeGreaterThan(0)
  expect(errors.find((e) => e.includes('styles.css'))).toContain('@import "@yourrealm/bottom-sheet/styles.css"')
})

// ---------- found by the pre-release review (2026-11-01) ----------

test.describe('closing on purpose', () => {
  test('a wheel during the close animation does not bring the sheet back', async ({ page }, info) => {
    test.skip(info.project.name === 'webkit-mobile', 'no wheel on mobile WebKit')
    await openLab(page)
    await page.mouse.move(200, 600)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(60)
    await page.mouse.wheel(0, 100)
    await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
    expect((await events(page)).filter((e) => e.startsWith('lab: onOpenChange'))).toEqual(['lab: onOpenChange false'])
  })

  test('a mouse header drag released off the header leaves nothing over the page', async ({ page }) => {
    await openLab(page)
    await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>('[data-ybs-scroller]')!
      s.scrollTop = s.clientHeight + 300
    })
    await expect(page.locator('[data-ybs-root]')).toHaveAttribute('data-ybs-scrolled', '')
    await page.waitForTimeout(200)
    const p = await headerPoint(page)
    await page.mouse.move(p.x, p.y)
    await page.mouse.down()
    await page.mouse.move(p.x, p.y + 300) // one jump: the first move already lands on the content
    await page.mouse.up()
    await page.waitForTimeout(300)
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
  })

  test('reopening during the close animation reverses it', async ({ page }, info) => {
    test.skip(info.project.name !== 'firefox-desktop', 'keyboard is a desktop concern')
    await page.goto('/#/lab')
    await page.locator('#open-lab').click()
    await waitForEvent(page, 'lab: onDetentChange 0.5')
    await clearEvents(page)
    await page.keyboard.press('Escape')
    await expect(page.locator('#open-lab')).toBeFocused() // focus is back on the trigger at once
    await page.keyboard.press('Enter') // the demo's button sets open={true}
    await page.waitForTimeout(800)
    await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
    const g = await geometry(page)
    expect(Math.abs(g.st - g.H * 0.5)).toBeLessThan(3)
    expect(await events(page)).not.toContain('lab: finishClose') // it never finished closing
  })
})

// `detent={d} onDetentChange={setD}` must round-trip: reporting 'closed' made the next open start (and end) at closed.
test("onDetentChange never reports 'closed'", async ({ page }) => {
  await openLab(page)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
  expect(await events(page)).not.toContain('lab: onDetentChange closed')
})

test('a tap right after a header drag that springs back presses what it lands on', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP touch')
  await page.goto('/?open=1#/thousand')
  await waitForEvent(page, /orders: onDetentChange/)
  await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('[data-ybs-scroller]')!
    s.scrollTop = s.clientHeight + 300
  })
  await expect(page.locator('[data-ybs-root]')).toHaveAttribute('data-ybs-scrolled', '')
  await page.waitForTimeout(300)
  const b = (await page.locator('[data-ybs-header]').boundingBox())!
  const x = b.x + b.width / 2
  const y = b.y + 20
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: string, yy: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: yy }] })
  await touch('touchStart', y)
  for (let i = 1; i <= 5; i++) await touch('touchMove', y + i * 6)
  await page.waitForTimeout(200) // no velocity: springs back
  await touch('touchEnd', y + 30)
  await page.waitForTimeout(500)
  const rows = await page.locator('[data-order]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))
  const r = rows.find((r) => r.y > b.y + 120 && r.y < 600)!
  await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2)
  await expect(page.locator('[data-ybs-root]')).toHaveCount(2) // the row's own sheet opened on top
})

test('the dialog is named by its title (aria-labelledby points at it)', async ({ page }) => {
  await openLab(page)
  const named = await page.evaluate(() => {
    const id = document.querySelector('[data-ybs-sheet]')!.getAttribute('aria-labelledby')
    return id ? document.getElementById(id)?.textContent ?? null : null
  })
  expect(named).toBeTruthy()
})

test('a right-click above the sheet does not close it', async ({ page }, info) => {
  test.skip(info.project.name === 'webkit-mobile', 'no right-click on mobile WebKit')
  await openLab(page)
  await page.mouse.click(200, 40, { button: 'right' })
  await page.waitForTimeout(500)
  await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
  await page.mouse.click(200, 40)
  await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
})

test('a non-modal sheet ignores Escape while focus is elsewhere on the page', async ({ page }, info) => {
  test.skip(info.project.name !== 'firefox-desktop', 'keyboard is a desktop concern')
  await page.goto('/?open=1#/persistent')
  await waitForEvent(page, 'solved: onDetentChange full')
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  expect(await events(page)).not.toContain('solved: onDetentChange header')
})

// ---------- found by the second pre-release review (2026-11-01) ----------

test('the keyboard opening with the content scrolled keeps the content where it is', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one engine is enough (faked visualViewport resize)')
  await openLab(page)
  await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('[data-ybs-scroller]')!
    s.scrollTop = s.clientHeight + 600
  })
  await page.waitForTimeout(400)
  // How far the content is scrolled (scrollTop past full); scrollTop itself shifts as the scroller gets shorter.
  const offset = async () => {
    const g = await geometry(page)
    return g.st - g.full
  }
  const before = await offset()
  expect(before).toBeGreaterThan(300)
  await page.evaluate(() => {
    const vv = window.visualViewport!
    const h = vv.height
    Object.defineProperty(vv, 'height', { configurable: true, get: () => h - 300 })
    vv.dispatchEvent(new Event('resize'))
  })
  await expect(page.locator('[data-ybs-root]')).toHaveAttribute('data-ybs-keyboard', '')
  await page.waitForTimeout(800)
  expect(await offset()).toBeGreaterThan(before - 50)
})

test('the keyboard opening at a partial detent still takes the sheet to full', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one engine is enough (faked visualViewport resize)')
  await openLab(page)
  await page.evaluate(() => {
    const vv = window.visualViewport!
    const h = vv.height
    Object.defineProperty(vv, 'height', { configurable: true, get: () => h - 300 })
    vv.dispatchEvent(new Event('resize'))
  })
  await waitForEvent(page, 'lab: onDetentChange full')
})

test('a touch drag up during the close animation still closes the sheet', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP touch')
  await openLab(page)
  await page.waitForTimeout(300)
  const cdp = await page.context().newCDPSession(page)
  const x = 200
  const y = 700
  const touch = (type: string, yy: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: yy }] })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(40)
  await touch('touchStart', y)
  for (let i = 1; i <= 30; i++) {
    await touch('touchMove', y - i * 15)
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(300)
  await touch('touchEnd', y - 450)
  await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
})

test('a second finger does not end a header drag', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP multi-touch')
  await openLab(page)
  await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('[data-ybs-scroller]')!
    s.scrollTop = s.clientHeight + 300
  })
  await expect(page.locator('[data-ybs-root]')).toHaveAttribute('data-ybs-scrolled', '')
  await page.waitForTimeout(300)
  const b = (await page.locator('[data-ybs-header]').boundingBox())!
  const x = b.x + b.width / 2
  const y = b.y + 20
  const cdp = await page.context().newCDPSession(page)
  const send = (type: string, pts: Array<{ x: number; y: number; id: number }>) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  const transform = () => page.evaluate(() => document.querySelector<HTMLElement>('[data-ybs-scroller]')!.style.transform)
  await send('touchStart', [{ x, y, id: 1 }])
  for (let i = 1; i <= 10; i++) await send('touchMove', [{ x, y: y + i * 15, id: 1 }])
  const before = await transform()
  expect(before).toContain('translate3d')
  await send('touchStart', [{ x, y: y + 150, id: 1 }, { x: x + 100, y: 600, id: 2 }])
  await page.waitForTimeout(50)
  expect(await transform()).toContain('translate3d') // still dragging: the first finger keeps the sheet
  await send('touchEnd', [])
})

test('reopening during the close animation moves focus into the sheet, and closing gives it back', async ({ page }, info) => {
  test.skip(info.project.name !== 'firefox-desktop', 'keyboard is a desktop concern')
  await page.goto('/#/lab')
  await page.locator('#open-lab').click()
  await waitForEvent(page, 'lab: onDetentChange 0.5')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-ybs-sheet]'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
  await expect(page.locator('#open-lab')).toBeFocused()
})

test('a non-modal sheet with closeOnBack ignores Escape while focus is elsewhere', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CloseWatcher path; one engine is enough')
  await page.goto('/?open=1&modal=0&back=1#/lab')
  await waitForEvent(page, /lab: onDetentChange/)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  expect(await events(page)).not.toContain('lab: onOpenChange false')
  // With focus inside it, Escape closes it (and says so).
  await page.locator('[data-ybs-sheet]').focus()
  await page.keyboard.press('Escape')
  await waitForEvent(page, 'lab: close watcher: escape')
  await waitForEvent(page, 'lab: onOpenChange false')
})

test('a headless sheet whose content arrives after opening waits for it instead of closing', async ({ page }) => {
  await page.goto('/?late=1#/lab')
  await page.locator('#open-late').click()
  await page.waitForTimeout(1200)
  expect(await events(page)).not.toContain('late: onOpenChange false swipe')
  await expect(page.getByText('Loaded')).toBeInViewport()
  await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
})

test('arrow keys and Page Up never scroll the sheet closed', async ({ page }, info) => {
  test.skip(info.project.name !== 'firefox-desktop', 'keyboard is a desktop concern')
  await page.goto('/#/lab')
  await page.locator('#open-lab').click()
  await waitForEvent(page, 'lab: onDetentChange 0.5')
  await page.locator('[data-ybs-sheet]').focus()
  for (const key of ['ArrowUp', 'PageUp', 'Home', 'PageUp']) await page.keyboard.press(key)
  await page.waitForTimeout(800)
  await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
  expect(await events(page)).not.toContain('lab: onOpenChange false')
})

test('Escape during IME composition does not close the sheet', async ({ page }, info) => {
  test.skip(info.project.name !== 'firefox-desktop', 'keyboard is a desktop concern')
  await openLab(page)
  await page.evaluate(() => {
    document.querySelector('[data-ybs-sheet] input')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true }),
    )
  })
  await page.waitForTimeout(500)
  await expect(page.locator('[data-ybs-root]')).toHaveCount(1)
})

test('Portal container: a sheet portalled into an element still makes the rest of the page inert', async ({ page }) => {
  await page.goto('/?late=1&container=1#/lab')
  const trigger = page.locator('#open-late')
  await trigger.click()
  await expect(page.locator('#late-portal [data-ybs-root]')).toHaveCount(1)
  // The trigger is a sibling of the container, not of the sheet's root.
  expect(await trigger.evaluate((el) => !!el.closest('[inert]'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-ybs-root]')).toHaveCount(0)
  expect(await trigger.evaluate((el) => !!el.closest('[inert]'))).toBe(false)
})
