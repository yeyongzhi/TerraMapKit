import { cpSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)
const root = dirname(fileURLToPath(import.meta.url))
const cesiumRoot = resolve(dirname(require.resolve('cesium/package.json')), 'Build/Cesium')
const workspace = resolve(root, '../..')
const output = process.env.EXAMPLES_OUT_DIR ? resolve(workspace, process.env.EXAMPLES_OUT_DIR) : resolve(root, 'dist')
const outputRelative = relative(workspace, output)
if (!outputRelative || isAbsolute(outputRelative) || outputRelative.startsWith('..')) throw new Error('Example build output must remain inside the workspace')

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
  base: process.env.EXAMPLES_BASE || '/',
  define: { CESIUM_BASE_URL: JSON.stringify(`${process.env.EXAMPLES_BASE || '/'}cesium/`) },
  plugins: [{ name: 'cesium-static-resources', buildStart: copyCesiumResources }],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: output, emptyOutDir: true, chunkSizeWarningLimit: 2000, rollupOptions: { input: { center: resolve(root, 'index.html'), legacy: resolve(root, 'legacy.html') } } }
})
