import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/docs', workers: 1, fullyParallel: false, timeout: 60000,
  expect: { timeout: 15000 },
  outputDir: 'test-results/docs',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/docs', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5175/TerraMapKit/', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  // Never reuse an old preview: the tests must inspect this turn's built content and search index.
  webServer: { command: 'node scripts/serve-docs-test.mjs', url: 'http://127.0.0.1:5175/TerraMapKit/', reuseExistingServer: false, timeout: 180000 }
})
