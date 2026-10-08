import { test, expect } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
const base = '/TerraMapKit/'
const pages = ['index.md', ...readdirSync(resolve('docs')).filter(p => p.endsWith('.md') && p !== 'index.md'), ...readdirSync(resolve('docs/kits')).filter(p => p.endsWith('.md')).map(p => `kits/${p}`)]
const route = file => file === 'index.md' ? base : `${base}${file.replace(/\.md$/, '.html')}`
function errorsOn(page) {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === 'http://127.0.0.1:5175') errors.push(`${response.status()} ${response.url()}`) })
  return errors
}

test('home introduces current capabilities; navigation and all Kit sidebar entries work', async ({ page }, testInfo) => {
  const errors = errorsOn(page)
  await page.goto(base)
  await expect(page.locator('.VPHomeHero')).toContainText('绘制编辑')
  for (const title of ['十种特效与播放控制', '绘制、编辑与 GeoJSON', '标记、交互与位置编辑']) await expect(page.locator('.VPFeatures')).toContainText(title)
  await page.screenshot({ path: testInfo.outputPath('home-desktop.png'), fullPage: true })
  await page.getByRole('link', { name: '查看 Kit API', exact: true }).click()
  await expect(page.locator('h1')).toContainText('API')
  const kitLinks = page.locator('.VPSidebar a[href*="/kits/"]')
  expect(await kitLinks.count()).toBe(13)
  const links = await kitLinks.evaluateAll(items => items.map(item => ({ href: item.href, label: item.textContent })))
  for (const link of links) {
    await page.locator('.VPSidebar').getByRole('link', { name: link.label.trim(), exact: true }).click()
    await expect(page.locator('h1')).not.toHaveText('404')
    await expect(page.locator('h1')).toContainText(link.label.split('·')[0].trim())
  }
  await page.locator('.VPNavBar').getByRole('link', { name: '项目说明书', exact: true }).click()
  await expect(page.locator('h1')).toHaveText('TerraMapKit 项目说明书')
  await expect(page.locator('.vp-doc')).toContainText('当前功能范围')
  await page.locator('.VPNavBar').getByRole('link', { name: '示例中心', exact: true }).click()
  await expect(page.locator('h1')).toHaveText('示例中心')
  await expect(page.locator('a[href*="device-monitor"], a[href*="fence-editor"], a[href*="effect-scenarios"], a[href*="legacy.html"]')).toHaveCount(0)
  const exampleIDs = await page.locator('table a[href*="/examples/"]').evaluateAll(items => items.map(item => new URL(item.href).hash.slice(1)))
  expect(new Set(exampleIDs).size).toBe(16)
  const monitor = page.locator('a[href$="#draw"]')
  await expect(monitor).toHaveAttribute('href', `${base}examples/index.html#draw`)
  expect(errors).toEqual([])
})

test('built local search finds new APIs, follows results and reports an empty query result', async ({ page }) => {
  const errors = errorsOn(page); await page.goto(base)
  await page.getByRole('button', { name: '搜索文档', exact: true }).click()
  const input = page.locator('#localsearch-input')
  await input.fill('MarkerEditSession')
  const result = page.locator('.VPLocalSearchBox a.result[href*="/kits/MarkerKit"]')
  await expect(result.first()).toBeVisible()
  await result.first().click(); await expect(page.locator('h1')).toContainText('MarkerKit')
  await expect(page.locator('.VPLocalSearchBox')).toHaveCount(0)
  await page.getByRole('button', { name: '搜索文档', exact: true }).click()
  await input.fill('setBaseLayer'); await expect(page.locator('.VPLocalSearchBox a.result[href*="/kits/LayerKit"]').first()).toBeVisible()
  await input.fill('GeoJSON'); await expect(page.locator('.VPLocalSearchBox a.result[href*="/kits/DrawKit"]').first()).toBeVisible()
  await input.fill('zzzz_unavailable_937104'); await expect(page.locator('.VPLocalSearchBox .no-results')).toContainText('没有找到结果')
  await page.keyboard.press('Escape'); await expect(page.locator('.VPLocalSearchBox')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('every document has working internal links and heading anchors under the deployment base', async ({ page, request }) => {
  test.setTimeout(180000)
  const errors = errorsOn(page), links = new Map()
  for (const file of pages) {
    const response = await page.goto(route(file)); expect(response.status(), file).toBe(200)
    await expect(page.locator('.VPContent')).toBeVisible()
    const hrefs = await page.locator('a[href]').evaluateAll(items => items.map(item => item.href))
    for (const href of hrefs) {
      const url = new URL(href)
      if (url.origin !== 'http://127.0.0.1:5175') continue
      expect(url.pathname.startsWith(base), `Escaped deployment base: ${href} in ${file}`).toBe(true)
      if (!links.has(href)) links.set(href, file)
    }
  }
  const documents = new Map()
  for (const [href, source] of links) {
    const url = new URL(href), target = `${url.origin}${url.pathname}${url.search}`
    if (!documents.has(target)) {
      const response = await request.get(target); expect(response.status(), `${source} -> ${target}`).toBe(200)
      documents.set(target, await response.text())
    }
    if (url.hash && !url.pathname.includes('/examples/')) {
      const anchor = decodeURIComponent(url.hash.slice(1))
      const exists = await page.evaluate(({ html, anchor }) => Boolean(new DOMParser().parseFromString(html, 'text/html').getElementById(anchor)), { html: documents.get(target), anchor })
      expect(exists, `${source} -> ${href}`).toBe(true)
    }
  }
  expect(links.size).toBeGreaterThan(30); expect(errors).toEqual([])
})

test('mobile home, menu, sidebar, tables and search stay usable without page overflow', async ({ page }, testInfo) => {
  const errors = errorsOn(page)
  for (const width of [375, 390]) {
    await page.setViewportSize({ width, height: 844 }); await page.goto(base)
    await expect(page.getByRole('link', { name: '打开示例中心', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`home-mobile-${width}.png`) })
    await page.getByRole('button', { name: 'mobile navigation', exact: true }).click()
    await page.locator('.VPNavScreen').getByRole('link', { name: 'Kit API', exact: true }).click()
    await expect(page.locator('h1')).toContainText('API')
    await expect(page.locator('.VPNavScreen')).not.toBeVisible()
    await page.getByRole('button', { name: '文档目录', exact: true }).click()
    await page.locator('.VPSidebar').getByRole('link', { name: 'MarkerKit · 地图标记', exact: true }).click()
    await expect(page.locator('h1')).toContainText('MarkerKit')
    await expect(page.locator('.VPSidebar')).not.toHaveClass(/open/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    const table = page.locator('.vp-doc table').first()
    const size = await table.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth, overflow: getComputedStyle(el).overflowX }))
    if (size.scroll > size.client) {
      expect(['auto', 'scroll']).toContain(size.overflow)
      expect(await table.evaluate(el => { el.scrollLeft = 20; return el.scrollLeft })).toBeGreaterThan(0)
    }
    await page.getByRole('button', { name: '搜索文档', exact: true }).click()
    await page.locator('#localsearch-input').fill('DrawKit')
    await expect(page.locator('.VPLocalSearchBox a.result').first()).toBeVisible()
    expect(await page.evaluate(() => document.querySelector('.VPLocalSearchBox .shell').getBoundingClientRect().right <= window.innerWidth + 1)).toBe(true)
    await page.getByRole('button', { name: '关闭搜索', exact: true }).click()
    await expect(page.locator('.VPLocalSearchBox')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`marker-mobile-${width}.png`) })
  }
  expect(errors).toEqual([])
})
