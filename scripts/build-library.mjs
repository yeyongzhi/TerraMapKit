import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'dist'), target = relative(root, output)
if (isAbsolute(target) || target !== 'dist') throw new Error('Library output must be the workspace dist directory')
// dist is generated and ignored. Clean it so removed modules cannot remain in published archives.
rmSync(output, { recursive: true, force: true })
execFileSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', resolve(root, 'tsconfig.build.json')], { cwd: root, stdio: 'inherit' })
