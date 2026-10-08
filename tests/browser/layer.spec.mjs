import { test, expect } from '@playwright/test'
test('basemap UI switches grid, Amap and annotated Tianditu; errors preserve old imagery', async ({ page }, testInfo) => {
  const pixel = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256
    const context = canvas.getContext('2d'); context.fillStyle = '#2a4e74'; context.fillRect(0, 0, 256, 256)
    return canvas.toDataURL('image/png').split(',')[1]
  }), 'base64')
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  const requests = []
  await page.route('**/mock-tiles/**', route => { requests.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'image/png', body: pixel }) })
  await page.route('https://*.tianditu.gov.cn/**', route => { requests.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'image/png', body: pixel }) })
  await page.route('**/failed-tiles/**', route => route.abort())
  await page.goto('/#layer'); await expect(page.locator('#status')).toContainText('离线网格底图已创建')
  await expect(page.locator('#resources')).toContainText('影像 1')
  await page.locator('#basemap-source').selectOption('amap')
  await page.locator('#basemap-url').fill('http://127.0.0.1:5174/mock-tiles/{z}/{x}/{y}.png')
  await page.getByRole('button', { name: '切换底图', exact: true }).click()
  await expect(page.locator('#status')).toContainText('底图切换成功：amap')
  await expect(page.locator('#resources')).toContainText('影像 1')
  await page.locator('#basemap-url').fill('http://127.0.0.1:5174/failed-tiles/{z}/{x}/{y}.png')
  await page.getByRole('button', { name: '切换底图', exact: true }).click()
  await expect(page.locator('#status')).toContainText('保留原底图'); await expect(page.locator('#resources')).toContainText('影像 1')
  await page.locator('#basemap-source').selectOption('tianditu'); await page.locator('#basemap-key').fill('mock-secret')
  await page.getByRole('button', { name: '切换底图', exact: true }).click()
  await expect(page.locator('#status')).toContainText('tianditu + 注记'); await expect(page.locator('#resources')).toContainText('影像 2')
  expect(requests.some(url => new URL(url).searchParams.get('layer') === 'vec')).toBe(true)
  expect(requests.some(url => new URL(url).searchParams.get('layer') === 'cva')).toBe(true)
  await expect(page.locator('#code')).not.toContainText('mock-secret')
  for (const type of ['xyz', 'wmts', 'wms']) {
    await page.locator('#basemap-source').selectOption(type)
    await page.locator('#basemap-url').fill(type === 'xyz' ? 'http://127.0.0.1:5174/mock-tiles/{z}/{x}/{y}.png' : 'http://127.0.0.1:5174/mock-tiles/service')
    await page.getByRole('button', { name: '切换底图', exact: true }).click()
    await expect(page.locator('#status')).toContainText(`底图切换成功：${type}`)
    await expect(page.locator('#resources')).toContainText('影像 1')
  }
  expect(requests.some(url => url.toLowerCase().includes('request=getmap'))).toBe(true)
  expect(requests.some(url => url.toLowerCase().includes('tilematrixset=w'))).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('basemap-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: '移除底图', exact: true }).click(); await expect(page.locator('#resources')).toContainText('影像 0')
  await page.locator('#cleanup').click(); await expect(page.locator('#resources')).toContainText('容器残留 0')
  expect(errors).toEqual([])
})
