import { test, expect } from '@playwright/test'
async function idle(page) {
  await page.waitForFunction(() => window.onDemand.viewer.scene.globe.tilesLoaded)
  await expect.poll(async () => { const before = await page.evaluate(() => window.onDemand.frames); await page.waitForTimeout(600); return await page.evaluate(() => window.onDemand.frames) - before }, { timeout: 15000 }).toBeLessThanOrEqual(1)
}
async function refresh(page, action) { const before = await page.evaluate(() => window.onDemand.frames); await page.evaluate(action); await expect.poll(() => page.evaluate(() => window.onDemand.frames)).toBeGreaterThan(before) }
test('requestRenderMode refreshes marker batches, visibility, editing, geometry and asynchronous imagery', async ({ page }) => {
  await page.goto('/render-validation.html'); await page.waitForFunction(() => window.onDemand?.frames > 2); await idle(page)
  await refresh(page, () => window.onDemand.add()); await idle(page)
  await refresh(page, () => window.onDemand.markers.patchMarkers([{ id: 'a', patch: { show: false } }])); await idle(page)
  await refresh(page, () => window.onDemand.markers.getMarker('a').setVisible(true))
  await refresh(page, () => { const edit = window.onDemand.markers.edit('a', { interactive: false }); edit.moveTo({ longitude: 116.4, latitude: 39.9, height: 100 }); edit.finish() })
  await refresh(page, () => window.onDemand.geometry()); await idle(page)
  await refresh(page, () => window.onDemand.measure()); await idle(page)
  await refresh(page, () => window.onDemand.imagery()); await idle(page)
  await refresh(page, () => window.onDemand.dispose()); await idle(page)
  expect(await page.evaluate(() => window.onDemand.errors)).toEqual([])
})
test('animated effects render continuously and paused/removed effects return to idle', async ({ page }) => {
  await page.goto('/render-validation.html'); await page.waitForFunction(() => window.onDemand?.frames > 2)
  for (const kind of ['ripple', 'wave']) {
    await page.evaluate(kind => window.onDemand.animate(kind), kind)
    const before = await page.evaluate(() => window.onDemand.frames); await page.waitForTimeout(500)
    expect(await page.evaluate(() => window.onDemand.frames)).toBeGreaterThan(before + 2)
    await page.evaluate(() => window.onDemand.effect.pause()); await idle(page)
    await refresh(page, () => window.onDemand.effect.seek(0.8)); await idle(page)
    await refresh(page, () => window.onDemand.effect.resume()); await page.waitForTimeout(300)
    await page.evaluate(() => window.onDemand.effect.remove()); await idle(page)
  }
  expect(await page.evaluate(() => window.onDemand.errors)).toEqual([])
})
