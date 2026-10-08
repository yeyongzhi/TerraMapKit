import assert from 'node:assert/strict'
import { execFileSync, execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
assert.match(manifest.name, /^[@a-z0-9/._-]+$/); assert.match(manifest.version, /^[a-zA-Z0-9.+-]+$/)
mkdirSync(resolve(root, 'artifacts/consumer'), { recursive: true })
const consumer = mkdtempSync(resolve(root, 'artifacts/consumer/install-'))
const archive = resolve(root, 'artifacts/release', `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`)
writeFileSync(resolve(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module', packageManager: manifest.packageManager, dependencies: { [manifest.name]: `file:${archive.replaceAll('\\', '/')}`, cesium: '1.145.0' }, pnpm: { overrides: { '@cesium/engine': '26.3.0', '@cesium/widgets': '16.2.0' } } }, null, 2))
// Install an actual archive, independently from workspace self-references.
const pnpmVersion = execSync('pnpm --version', { cwd: consumer, encoding: 'utf8' }).trim()
assert.equal(pnpmVersion, manifest.packageManager.split('@').at(-1), 'Consumer must use the repository package manager version')
execSync('pnpm install --ignore-scripts', { cwd: consumer, stdio: 'inherit' })
const entries = Object.keys(manifest.exports).map(key => key === '.' ? manifest.name : `${manifest.name}${key.slice(1)}`)
writeFileSync(resolve(consumer, 'check.mjs'), `import assert from 'node:assert/strict'\nconst modules = await Promise.all(${JSON.stringify(entries)}.map(path => import(path)))\nassert.equal(modules[0].EffectKit, modules[${entries.indexOf(`${manifest.name}/effect`)}].EffectKit)\nassert.equal(modules[0].CoordinateKit.fromDegrees(0, 0, 0).x, 6378137)\nconsole.log('Consumer ESM imports: ${entries.length} entry points passed')\n`)
writeFileSync(resolve(consumer, 'check.ts'), `import { EffectKit, type EffectHandle, type RippleEffectOptions, type FlowLineOptions } from '${manifest.name}/effect'\nimport { Color, type Viewer } from 'cesium'\ndeclare const viewer: Viewer\nconst effects = new EffectKit(viewer)\nconst ripple: EffectHandle<RippleEffectOptions> = effects.addRipple({ position: { longitude: 0, latitude: 0 } })\nripple.patch({ radius: 500, color: Color.RED })\nconst flow: EffectHandle<FlowLineOptions> = effects.addFlowLine({ positions: [{ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 1 }] })\nflow.seek(1); flow.setVisible(false)\n// @ts-expect-error A flow line requires positions.\neffects.addFlowLine({ position: { longitude: 0, latitude: 0 } })\n// @ts-expect-error A ripple has no route geometry.\nripple.patch({ positions: [] })\n// @ts-expect-error IDs cannot be updated.\nripple.patch({ id: 'changed' })\n`)
writeFileSync(resolve(consumer, 'check.ts'), readFileSync(resolve(consumer, 'check.ts'), 'utf8') + `
import { DrawKit, type DrawEditSession, type DrawGeoJSON } from '${manifest.name}/draw'
import { Cartesian3 } from 'cesium'
import { CoordinateKit, GeometryKit, type CartesianBounds, type SegmentProjection } from '${manifest.name}/coordinate'
const origin = CoordinateKit.fromDegrees(116, 39)
const moved = CoordinateKit.offset(origin, 10, 20, 30)
const local = CoordinateKit.toLocal(origin, moved)
CoordinateKit.fromLocal(origin, local); CoordinateKit.createLocalFrame(origin)
CoordinateKit.localCenter(origin, [origin, moved])
const bounds: CartesianBounds = GeometryKit.bounds([origin, moved])
const projection: SegmentProjection = GeometryKit.closestPointOnSegment(origin, origin, moved)
GeometryKit.interpolatePolyline([origin, moved], GeometryKit.polylineLength([origin, moved]) / 2)
GeometryKit.validatePolyline([origin, moved]); GeometryKit.distanceToSegment(origin, origin, moved)
// @ts-expect-error Offsets are numeric metres.
CoordinateKit.offset(origin, '10', 0)
import { MarkerKit, type MarkerData, type MarkerEditSession } from '${manifest.name}/marker'
import { PrimitiveMarkerKit, createMarkerDisplayOptions, type PrimitiveMarkerHandle, type MarkerDisplayOptions } from '${manifest.name}/marker'
const display: MarkerDisplayOptions = { distance: { near: 0, far: 100000 }, disableDepthTestDistance: Infinity }
const nativeDisplay = createMarkerDisplayOptions(display)
import { PointGraphics, BillboardGraphics, LabelGraphics } from 'cesium'
new PointGraphics(nativeDisplay); new BillboardGraphics(nativeDisplay); new LabelGraphics(nativeDisplay)
const primitiveMarkers = new PrimitiveMarkerKit(viewer, 'point')
const primitiveHandle: PrimitiveMarkerHandle = primitiveMarkers.addMarker({ position: { longitude: 0, latitude: 0 }, display })
primitiveMarkers.patchMarkers([{ id: primitiveHandle.id, patch: { pixelSize: 10, display: undefined } }])
primitiveMarkers.onClick(event => console.log(event.marker.id))
primitiveMarkers.removeMarkers([primitiveHandle.id]); primitiveMarkers.dispose()
// @ts-expect-error IDs cannot be patched.
primitiveHandle.patch({ id: 'changed' })
const markers = new MarkerKit(viewer)
const marker = markers.addMarker({ position: { longitude: 0, latitude: 0 }, point: {}, properties: { name: 'point' } })
marker.patch({ label: { text: 'changed' } }); marker.setPosition({ longitude: 1, latitude: 1 })
const markerEdit: MarkerEditSession = markers.edit(marker, { interactive: false })
markerEdit.moveTo({ longitude: 1, latitude: 1 }); markerEdit.finish()
markers.onHover(({ phase, marker }) => { const transition: 'enter' | 'leave' = phase; console.log(transition, marker.id) })
const markerData: MarkerData[] = markers.toJSON(); markers.fromJSON(markerData)
const batch = markers.addMarkers([{ position: { longitude: 0, latitude: 0 }, point: {} }])
markers.patchMarkers(batch.map(h => ({ id: h.id, patch: { show: false } })))
const removedCount: number = markers.removeMarkers(batch.map(h => h.id))
// @ts-expect-error Batch patches cannot change IDs.
markers.patchMarkers([{ id: 'a', patch: { id: 'b' } }])
// @ts-expect-error Application state is outside the marker API.
marker.setStatus('unknown')
// @ts-expect-error IDs are immutable in patches.
marker.patch({ id: 'changed' })
// @ts-expect-error Metadata must contain JSON values.
marker.patch({ properties: { callback: () => {} } })
const draws = new DrawKit(viewer)
import { LayerKit, createAmapImageryProvider, createTiandituImageryProvider, createImageryProvider, type BaseLayerOptions, type ImagerySource } from '${manifest.name}/layer'
const layers = new LayerKit(viewer)
const source: ImagerySource = { type: 'wms', options: { url: 'https://example.com/wms', layers: 'base' } }
const baseOptions: BaseLayerOptions = { provider: createImageryProvider(source), timeoutMs: 1000 }
layers.setBaseLayer(baseOptions); layers.getBaseLayer(); layers.removeBaseLayer()
// @ts-expect-error WMTS requires layer and matrix configuration.
createImageryProvider({ type: 'wmts', options: { url: 'https://example.com/wmts' } })
const amap = createAmapImageryProvider({ url: 'https://example.com/{z}/{x}/{y}.png' })
const tianditu = createTiandituImageryProvider({ key: 'test-key', layer: 'vec' })
layers.addAmapLayer({ url: 'https://example.com/{z}/{x}/{y}.png', alpha: 0.5 })
layers.addTiandituLayer({ key: 'test-key', layer: 'cva' })
// @ts-expect-error A service key is required.
createTiandituImageryProvider({ layer: 'img' })
// @ts-expect-error Only defined tile layers are accepted.
layers.addTiandituLayer({ key: 'test-key', layer: 'unknown' })
const [drawing] = draws.fromGeoJSON({ type: 'Point', coordinates: [0, 0] })
const edit: DrawEditSession = draws.edit(drawing!, { interactive: false })
edit.moveVertex(0, new Cartesian3(6378137, 1, 1))
edit.undo(); edit.redo(); edit.finish()
const exported: DrawGeoJSON = draws.toGeoJSON(drawing!)
if (exported.geometry.type === 'Polygon') exported.geometry.coordinates[0][0][0].toFixed(2)
// @ts-expect-error Only known edit modes are accepted.
edit.setMode('unknown')
// @ts-expect-error Vertices require Cartesian3 values.
edit.moveVertex(0, [0, 0])
`)
writeFileSync(resolve(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, skipLibCheck: true, noEmit: true }, include: ['check.ts'] }))
execFileSync(process.execPath, [resolve(consumer, 'check.mjs')], { cwd: consumer, stdio: 'inherit' })
execFileSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', resolve(consumer, 'tsconfig.json')], { cwd: consumer, stdio: 'inherit' })
console.log(`Consumer archive installation and TypeScript declarations verified: ${consumer}`)

