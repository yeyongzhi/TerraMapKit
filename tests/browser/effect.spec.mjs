import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
test('real Viewer renders all effects, retains partial updates, completes and cleans resources', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/validation.html')
  await page.waitForFunction(() => window.effectValidation?.viewer.scene.frameState.frameNumber > 2)
  const ids = await page.evaluate(() => window.effectValidation.create())
  expect(ids).toHaveLength(10)
  await page.evaluate(() => window.effectValidation.tick(1))
  await page.waitForFunction(() => window.effectValidation.viewer.scene.frameState.frameNumber > 10)
  const before = await page.screenshot({ path: testInfo.outputPath('all-effects.png') })
  const controls = await page.evaluate(() => {
    const { kit, viewer } = window.effectValidation, h = kit.getEffects().find(h => h.kind === 'wave')
    const entity = h.entities[0], time = h.currentTime
    h.patch({ amplitude: 800 }); h.setVisible(false); kit.pauseAll()
    const paused = kit.getEffects().every(h => h.paused), hidden = !entity.show
    const listeners = viewer.clock.onTick.numberOfListeners
    h.setVisible(true); kit.resumeAll(); h.seek(2); h.setSpeed(2)
    return { paused, hidden, listeners, same: entity === h.entities[0], time, count: kit.size }
  })
  expect(controls).toMatchObject({ paused: true, hidden: true, same: true, time: 1, count: 10 })
  // Viewer has its own listener; compare against the baseline after clearing the Kit.
  await page.evaluate(() => window.effectValidation.tick(3))
  await page.waitForTimeout(400)
  expect(await page.screenshot()).not.toEqual(before)
  const result = await page.evaluate(() => {
    const app = window.effectValidation, { kit, viewer } = app
    kit.clear(); const baseline = viewer.clock.onTick.numberOfListeners
    app.tick(0); const id = app.once(); app.tick(2)
    const h = kit.getEffect(id), complete = h.completed && h.paused
    app.tick(3); const completions = app.completions
    kit.clear(); const remaining = viewer.entities.values.length, listeners = viewer.clock.onTick.numberOfListeners
    kit.addPulsePoint({ position: { longitude: 116.39, latitude: 39.9, height: 100 } }); kit.dispose()
    const kitClean = viewer.entities.values.length === 0 && viewer.clock.onTick.numberOfListeners === baseline
    viewer.destroy()
    return { complete, completions, remaining, listeners, baseline, kitClean, destroyed: viewer.isDestroyed(), errors: app.errors }
  })
  expect(result.complete).toBe(true); expect(result.completions).toBe(1); expect(result.remaining).toBe(0)
  expect(result.listeners).toBe(result.baseline); expect(result.kitClean).toBe(true); expect(result.destroyed).toBe(true)
  expect(result.errors).toEqual([]); expect(errors).toEqual([])
})

test('rendered performance samples record counts, FPS and cleanup across all benchmark types', async ({ page }, testInfo) => {
  test.setTimeout(180000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#effect-performance')
  const samples = []
  for (const kind of ['pulse', 'ripple', 'wave']) for (const count of ['10', '100', '500']) {
    await page.locator('#param-kind').selectOption(kind); await page.locator('#param-count').selectOption(count)
    await page.locator('#apply').click(); await expect(page.locator('#status')).toContainText(`${count} 个 ${kind}`)
    await page.getByRole('button', { name: '测量帧率（预热 1 秒 + 采样 5 秒）', exact: true }).click()
    await expect(page.locator('#status')).toContainText('FPS', { timeout: 25000 })
    const measurement = await page.locator('#status').textContent()
    expect(measurement).not.toContain('NaN')
    await page.getByRole('button', { name: '清空并检查资源', exact: true }).click()
    await expect(page.locator('#status')).toContainText('Entity 0')
    samples.push({ kind, count: Number(count), measurement, cleanup: await page.locator('#status').textContent() })
  }
  const result = { date: new Date().toISOString(), renderer: 'Chromium / SwiftShader software WebGL', viewport: { width: 1440, height: 1000 }, samples }
  const path = testInfo.outputPath('effect-performance.json')
  writeFileSync(path, JSON.stringify(result, null, 2))
  await testInfo.attach('effect-performance', { path, contentType: 'application/json' })
  expect(errors).toEqual([])
})
test('example center switches all effects without rendering errors', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#effect')
  await expect(page.locator('#status')).toContainText('ripple')
  for (const kind of ['diffusion', 'wave', 'pulse', 'glow', 'radar', 'flow', 'arc', 'wall', 'polygon']) {
    await page.locator('#param-kind').selectOption(kind); await page.locator('#apply').click()
    await expect(page.locator('#status')).toContainText(`${kind} ·`)
    await page.waitForTimeout(200)
    await expect(page.locator('#status')).not.toContainText('失败')
  }
  await page.getByRole('button', { name: '局部更新颜色', exact: true }).click()
  await page.getByRole('button', { name: '显示／隐藏', exact: true }).click()
  await page.getByRole('button', { name: '清空特效', exact: true }).click()
  await expect(page.locator('#resources')).toContainText('Entity 0')
  await page.locator('#cleanup').click(); await expect(page.locator('#resources')).toContainText('容器残留 0')
  expect(errors).toEqual([])
})
test('performance scenarios expose 10, 100 and 500 effects and return to zero entities', async ({ page }) => {
  await page.goto('/#effect-performance')
  for (const count of ['10', '100', '500']) {
    await page.locator('#param-count').selectOption(count); await page.locator('#apply').click()
    await expect(page.locator('#status')).toContainText(`${count} 个 pulse`)
    await expect(page.locator('#resources')).toContainText(`Entity ${count}`)
    await page.getByRole('button', { name: '清空并检查资源', exact: true }).click()
    await expect(page.locator('#status')).toContainText('Entity 0')
  }
})
