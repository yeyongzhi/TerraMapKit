import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
for (const count of [1000, 10000, 50000]) test(`Entity and native collections benchmark ${count} markers without resource residue`, async ({ page }, testInfo) => {
  test.setTimeout(240000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#primitive-performance')
  await expect(page.locator('#status')).toContainText('Primitive 点位已创建')
  await page.locator('#param-count').selectOption(String(count))
  await page.locator('#apply').click()
  await expect(page.locator('#status')).toContainText(`${count} 个 Primitive`)
  await page.getByRole('button', { name: '运行 Entity / Primitive 对比', exact: true }).click()
  await expect(page.locator('#status')).toContainText('对比完成：3 组', { timeout: 180000 })
  const record = JSON.parse(await page.locator('#primitive-benchmark').inputValue())
  expect(record.samples.map(s => s.mode)).toEqual(['entity-point', 'primitive-point', 'primitive-billboard'])
  for (const sample of record.samples) {
    expect(sample.count).toBe(count); expect(sample.residualEntities).toBe(0); expect(sample.residualCollections).toBe(0); expect(sample.residualListeners).toEqual([0, 0, 0])
    for (const metric of ['add', 'patch', 'remove', 'frameWait']) expect(Number.isFinite(sample[metric])).toBe(true)
  }
  mkdirSync('artifacts/performance', { recursive: true })
  const path = 'artifacts/performance/primitives-browser.json'
  const previous = count !== 1000 && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []
  writeFileSync(path, JSON.stringify([...previous.filter(r => r.samples[0].count !== count), record], null, 2))
  await page.screenshot({ path: testInfo.outputPath(`primitives-${count}.png`) })
  await page.locator('#cleanup').click(); expect(errors).toEqual([])
})
