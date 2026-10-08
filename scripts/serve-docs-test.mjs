import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Exercise the same repository subpath used by Pages, with fresh production artifacts.
const env = { ...process.env, DOCS_BASE: '/TerraMapKit/' }
execSync('pnpm docs:build', { cwd: root, env, stdio: 'inherit' })
execSync('pnpm docs:preview --host 127.0.0.1 --port 5175 --strictPort', { cwd: root, env, stdio: 'inherit' })
