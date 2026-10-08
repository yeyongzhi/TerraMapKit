import { test, expect } from '@playwright/test'

test('coordinate example displays ENU offset, straight distance and reusable code', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#coordinate')
  await expect(page.locator('#status')).toContainText('东 500 米 / 北 300 米')
  await expect(page.locator('#status')).toContainText('583.10 米')
  await expect(page.locator('#code')).toContainText('GeometryKit.polylineLength')
  await expect(page.locator('#resources')).toContainText('Entity 3')
  await page.locator('#cleanup').click()
  await expect(page.locator('#status')).toContainText('已清理')
  expect(errors).toEqual([])
})
