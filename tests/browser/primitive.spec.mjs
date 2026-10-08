import { test, expect } from '@playwright/test'
test('real point and image collections render, pick, update distance controls and release ownership', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/primitive-validation.html')
  await page.waitForFunction(() => window.primitives?.billboard.primitive.ready && window.primitives.frames > 2)
  for (const kind of ['point', 'billboard']) {
    const expected = kind === 'point' ? 'point' : 'image'
    await expect.poll(() => page.evaluate(kind => window.primitives.picked(kind), kind)).toBe(expected)
    const screen = await page.evaluate(kind => window.primitives.screen(kind), kind)
    await page.mouse.click(screen.x, screen.y)
    await expect.poll(() => page.evaluate(() => window.primitives.clicks)).toContain(expected)
  }
  await page.evaluate(() => window.primitives.hideByDistance())
  await expect.poll(() => page.evaluate(() => window.primitives.picked('point'))).toBe(undefined)
  await page.evaluate(() => window.primitives.move())
  await expect.poll(() => page.evaluate(() => window.primitives.picked('point'))).toBe('point')
  await page.evaluate(() => window.primitives.dispose())
  expect(await page.evaluate(() => ({ count: window.primitives.viewer.scene.primitives.length, foreign: window.primitives.foreign.isDestroyed(), errors: window.primitives.errors }))).toEqual({ count: 1, foreign: false, errors: [] })
  const before = await page.evaluate(() => window.primitives.clicks.length)
  await page.mouse.click(500, 400); expect(await page.evaluate(() => window.primitives.clicks.length)).toBe(before)
  expect(errors).toEqual([])
})
