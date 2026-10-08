import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
const output = 'artifacts/performance/markers-browser.json'
for (const count of [100, 1000, 5000]) test(`marker benchmark performance ${count} records and cleans three rounds`, async ({ page }) => {
  test.setTimeout(180000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#marker-performance'); await expect(page.locator('#status')).toContainText('批量创建')
  await page.locator('#param-count').selectOption(String(count)); await page.locator('#apply').click()
  await expect(page.locator('#status')).toContainText(`${count} 个标记`)
  await page.getByRole('button', { name: '运行对比基准（三轮）', exact: true }).click()
  await expect(page.locator('#status')).toContainText('基准完成：6 组', { timeout: 150000 })
  const report = JSON.parse(await page.locator('#marker-benchmark').inputValue())
  expect(report.samples).toHaveLength(6)
  for (const sample of report.samples) {
    expect(sample.count).toBe(count); expect(sample.residualEntities).toBe(0)
    expect(sample.residualListeners).toEqual([0, 0, 0])
    for (const operation of ['add', 'patch', 'remove']) {
      expect(sample[operation].ms).toBeGreaterThanOrEqual(0)
      expect(sample[operation].notifications).toBe(sample.mode === 'batch' ? 1 : count)
    }
  }
  mkdirSync('artifacts/performance', { recursive: true })
  const reports = count === 100 || !existsSync(output) ? [] : JSON.parse(readFileSync(output, 'utf8'))
  writeFileSync(output, JSON.stringify([...reports.filter(item => item.count !== count), { count, ...report }], null, 2))
  await page.locator('#cleanup').click(); await expect(page.locator('#resources')).toContainText('容器残留 0')
  expect(errors).toEqual([])
})
