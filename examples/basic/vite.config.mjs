import { cpSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)
const root = dirname(fileURLToPath(import.meta.url))
const cesiumRoot = resolve(dirname(require.resolve('cesium/package.json')), 'Build/Cesium')

// The consuming application hosts Cesium resources; they are not part of the library.
function copyCesiumResources() {
  const target = resolve(root, 'public/cesium')
  mkdirSync(target, { recursive: true })
  for (const directory of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) {
    cpSync(resolve(cesiumRoot, directory), resolve(target, directory), { recursive: true })
  }
}

export default defineConfig({
  root,
  base: '/',
  define: { CESIUM_BASE_URL: JSON.stringify('/cesium/') },
  plugins: [{ name: 'cesium-static-resources', buildStart: copyCesiumResources }],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 }
})
