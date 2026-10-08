import { test, expect } from '@playwright/test'
test('native geometry batching, ground lines, flow shader, data sources, tiles and screenshot render and clean', async ({ page }, testInfo) => {
  test.setTimeout(120000); const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto('/infrastructure-validation.html'); await page.waitForFunction(() => window.infrastructure)
  await page.evaluate(() => window.infrastructure.geometry()); await page.waitForFunction(() => window.infrastructure.ready())
  await page.evaluate(() => { window.infrastructure.mutate(); window.infrastructure.ground(); window.infrastructure.flow() })
  await expect.poll(() => page.evaluate(() => window.infrastructure.viewer.clock.onTick.numberOfListeners)).toBeGreaterThan(0)
  const pause = await page.evaluate(() => window.infrastructure.pause()); expect(pause.constant).toBe(true); expect(pause.phase).toBe(1)
  await page.evaluate(() => window.infrastructure.resume())
  expect(await page.evaluate(() => window.infrastructure.data())).toBe(1)
  expect(await page.evaluate(() => window.infrastructure.tile())).toBeGreaterThan(0)
  expect(await page.evaluate(() => window.infrastructure.view())).toEqual({ visible: true, rectangle: true, screen: true })
  expect((await page.evaluate(() => window.infrastructure.parse())).identifier).toBe('base')
  expect(await page.evaluate(() => window.infrastructure.errors)).toEqual([])
  const screenshot = await page.evaluate(() => window.infrastructure.screenshot()); expect(screenshot.type).toBe('image/png'); expect(screenshot.size).toBeGreaterThan(1000)
  await page.screenshot({ path: testInfo.outputPath('infrastructure.png') })
  expect(await page.evaluate(() => window.infrastructure.errors)).toEqual([])
  const baseline = await page.evaluate(() => window.infrastructure.baselineListeners)
  const cleanup = await page.evaluate(() => window.infrastructure.dispose()); expect(cleanup.dataSources).toBe(0); expect(cleanup.shaderDestroyed).toBe(true); expect(cleanup.listeners).toBe(baseline)
  expect(errors).toEqual([])
})
test('seven infrastructure example entries run offline and can restore a snapshot', async ({ page }) => {
  test.setTimeout(120000); const errors = []; page.on('pageerror', e => errors.push(e.message))
  for (const [id, message] of [['terrain', '采样高度'], ['primitive', '已创建 polygon'], ['material', '已创建 flow'], ['data-source', 'GeoJSON 数据源已加载'], ['transform', '矩阵缩放'], ['scene', '能力'], ['snapshot', '快照已生成']]) {
    await page.goto(`/#${id}`); await expect(page.locator('#status')).toContainText(message)
    if (id === 'snapshot') { await page.getByRole('button', { name: '清理并恢复快照', exact: true }).click(); await expect(page.locator('#status')).toContainText('快照已恢复') }
    await page.locator('#cleanup').click(); await expect(page.locator('#resources')).toContainText('容器残留 0')
  }
  expect(errors).toEqual([])
})
