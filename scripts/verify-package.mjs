import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^npm_config_(cache[-_]dir|store[-_]dir|verify[-_]deps[-_]before[-_]run)$/i.test(key)))
const raw = JSON.parse(execSync('npm pack --dry-run --json --ignore-scripts', { encoding: 'utf8', env }))
// npm versions return either an array or an object keyed by package name.
const packed = Array.isArray(raw) ? raw[0] : Object.values(raw)[0]
const paths = new Set(packed.files.map(file => file.path))
for (const entry of Object.values(manifest.exports)) {
  for (const path of Object.values(entry)) assert.ok(paths.has(path.replace(/^\.\//, '')), `Missing export: ${path}`)
}
for (const path of paths) {
  assert.ok(path.startsWith('dist/') || ['README.md', 'CHANGELOG.md', 'package.json', 'LICENSE', 'LICENSE.md'].includes(path), `Unexpected packed file: ${path}`)
  if (path.startsWith('dist/')) {
    const source = path.replace(/^dist\//, 'src/').replace(/(?:\.d\.ts\.map|\.d\.ts|\.js\.map|\.js)$/, '.ts')
    assert.ok(existsSync(source), `Stale or unsupported build artifact: ${path}`)
  }
}
assert.equal(packed.bundled.length, 0, 'Cesium must not be bundled')
mkdirSync('artifacts/release', { recursive: true })
execSync('npm pack --pack-destination artifacts/release --ignore-scripts --json', { encoding: 'utf8', env })
console.log(`Package verified: ${paths.size} files, ${packed.size} compressed bytes, all export targets present; no bundled dependencies.`)
console.log(`Local archive: artifacts/release/${packed.filename}; no publish performed.`)
