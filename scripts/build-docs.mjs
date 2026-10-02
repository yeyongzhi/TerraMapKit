import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Build the same example app under the documentation base, including offline assets.
const docsBase = process.env.DOCS_BASE || '/'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const staging = resolve(root, 'artifacts/docs-examples')
const env = { ...process.env, EXAMPLES_BASE: `${docsBase.replace(/\/?$/, '/')}examples/`, EXAMPLES_OUT_DIR: staging }
const target = resolve(root, 'docs/public/examples')
const ownedPath = relative(root, target)
if (isAbsolute(ownedPath) || ownedPath.startsWith('..') || ownedPath.replaceAll('\\', '/') !== 'docs/public/examples') throw new Error('Example output must remain inside the repository')
execSync('pnpm example:build', { stdio: 'inherit', env, cwd: root })
// This ignored directory contains generated files only. Remove stale hashed bundles.
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(staging, target, { recursive: true })
execSync(process.argv.includes('--dev') ? 'pnpm exec vitepress dev docs' : 'pnpm exec vitepress build docs', { stdio: 'inherit', cwd: root })
