import test from 'node:test'
import assert from 'node:assert/strict'
import { Cartesian2, Cartesian3, Color, Matrix4, JulianDate, Event, EntityCollection, PrimitiveCollection, DataSourceCollection, CustomDataSource, EllipsoidTerrainProvider, GeographicTilingScheme, HeightmapTerrainData, ImageryLayerCollection } from 'cesium'
import { TerrainKit, TransformKit, PrimitiveKit, MaterialKit, DataSourceKit, SceneKit, SnapshotKit, CoordinateKit as C, CameraKit, MeasureKit, DrawKit, MarkerKit, LayerKit, PickKit, snapPosition } from 'terra-map-kit'
const origin = C.fromDegrees(116.39, 39.9, 100)
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function fixture() {
  const camera = { positionWC: origin, heading: 0, pitch: -.5, roll: 0, transform: Matrix4.clone(Matrix4.IDENTITY), setView(value) { this.last = value }, moveStart: new Event(), moveEnd: new Event(), changed: new Event(), lookAt() {}, lookAtTransform() {} }
  const viewer = { camera, isDestroyed: () => false, terrainProvider: new EllipsoidTerrainProvider(), entities: new EntityCollection(), dataSources: new DataSourceCollection(), imageryLayers: new ImageryLayerCollection(), resolutionScale: 1, shadows: false, clock: { currentTime: JulianDate.now(), onTick: new Event() }, scene: { primitives: new PrimitiveCollection(), requestRender() {}, postRender: new Event(), renderError: new Event(), requestRenderMode: true, maximumRenderTimeChange: Infinity, backgroundColor: Color.clone(Color.BLACK), globe: { depthTestAgainstTerrain: false, enableLighting: false }, fog: { enabled: true }, postProcessStages: { fxaa: { enabled: false } }, screenSpaceCameraController: { minimumZoomDistance: 1, maximumZoomDistance: Infinity, enableZoom: true } } }
  return viewer
}
test('terrain samples clone input, handle ellipsoid and real HeightmapTerrainData interpolation', async () => {
  const v = fixture(), kit = new TerrainKit(v), point = Object.freeze({ longitude: 116, latitude: 39, height: 1000 })
  const sample = await kit.sampleHeight(point, { offset: 5 }); assert.equal(sample.height, 5); assert.equal(point.height, 1000)
  const provider = { tilingScheme: new GeographicTilingScheme(), requestTileGeometry: async () => new HeightmapTerrainData({ buffer: new Float32Array([25, 25, 25, 25]), width: 2, height: 2 }) }
  await kit.setTerrain(provider)
  assert.equal((await kit.sampleHeight(point, { level: 0 })).height, 25)
  const profile = await kit.getHeightProfile([{ longitude: 116, latitude: 39 }, { longitude: 116.001, latitude: 39 }], 50, { level: 0 })
  assert.ok(profile.length >= 2); assert.equal(profile[0].distance, 0); assert.ok(profile.at(-1).distance > 0)
  kit.dispose(); assert.ok(v.terrainProvider instanceof EllipsoidTerrainProvider)
})
test('terrain switches discard stale completion, preserve external replacements and cancel on dispose', async () => {
  const v = fixture(), kit = new TerrainKit(v), pending = deferred(), old = kit.setTerrain(pending.promise)
  const next = new EllipsoidTerrainProvider(); await kit.setTerrain(next); pending.resolve(new EllipsoidTerrainProvider())
  await assert.rejects(old, /superseded/); assert.equal(v.terrainProvider, next)
  const external = new EllipsoidTerrainProvider(); v.terrainProvider = external; kit.dispose(); assert.equal(v.terrainProvider, external)
  const second = new TerrainKit(v), waiting = second.setTerrain(new Promise(() => {})); second.dispose(); await assert.rejects(waiting, /disposed/)
  assert.throws(() => TerrainKit.densify([{ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 }], 1), /10000/)
})
test('transforms compose, decompose, invert and rotate without mutating input', () => {
  const matrix = TransformKit.matrix(origin, { heading: .3, pitch: .1, scale: 2 }), parts = TransformKit.decompose(matrix)
  const restored = Matrix4.fromTranslationQuaternionRotationScale(parts.position, parts.quaternion, parts.scale)
  assert.ok(Matrix4.equalsEpsilon(matrix, restored, 1e-6))
  const point = new Cartesian3(2, 3, 4), world = TransformKit.apply(matrix, point)
  assert.ok(Cartesian3.distance(TransformKit.apply(TransformKit.inverse(matrix), world), point) < 1e-6)
  const rotation = TransformKit.rotateAround(Matrix4.IDENTITY, origin, new Cartesian3(0, 0, 1), Math.PI / 2)
  const result = TransformKit.apply(rotation, Cartesian3.add(origin, new Cartesian3(10, 0, 0), new Cartesian3()))
  assert.ok(Cartesian3.distance(result, Cartesian3.add(origin, new Cartesian3(0, 10, 0), new Cartesian3())) < 1e-6)
  assert.throws(() => TransformKit.matrix(origin, { scale: 0 }), RangeError)
})
test('primitive prevalidation and native insertion failure roll back without removing foreign objects', () => {
  const v = fixture(), foreign = v.scene.primitives.add({ destroy() {}, isDestroyed: () => false }), kit = new PrimitiveKit(v)
  const box = { geometry: { type: 'box', dimensions: new Cartesian3(10, 10, 10) }, modelMatrix: TransformKit.matrix(origin) }
  const existing = kit.add({ ...box, id: 'existing' }); assert.equal(v.scene.primitives.length, 2)
  assert.throws(() => kit.addBatch([{ ...box, id: 'new' }, { ...box, id: 'existing' }]), /duplicate/)
  const nativeAdd = v.scene.primitives.add; let calls = 0
  v.scene.primitives.add = function(p) { if (++calls === 2) throw new Error('insertion'); return nativeAdd.call(this, p) }
  assert.throws(() => kit.addBatch([{ ...box, id: 'new' }, { ...box, id: 'next' }]), /insertion/)
  assert.equal(v.scene.primitives.length, 2); assert.equal(kit.get('new'), undefined)
  kit.dispose(); assert.equal(v.scene.primitives.get(0), foreign); assert.equal(existing.primitive.isDestroyed(), true)
})
test('material factories return independent native properties and validate inputs', () => {
  const color = Color.clone(Color.RED), property = MaterialKit.solid(color); color.red = 0
  assert.equal(property.getValue(JulianDate.now()).color.red, 1)
  for (const property of [MaterialKit.dash(), MaterialKit.arrow(), MaterialKit.glow(), MaterialKit.outline(), MaterialKit.grid(), MaterialKit.image('/pin.svg')]) assert.ok(property.getType(JulianDate.now()))
  assert.throws(() => MaterialKit.glow(Color.CYAN, 2), RangeError)
})
test('data source ownership, replacement failure, cancellation and late completion are safe', async () => {
  const v = fixture(), foreign = await v.dataSources.add(new CustomDataSource('foreign')), kit = new DataSourceKit(v)
  await assert.rejects(kit.add(foreign), /already belongs/); assert.ok(v.dataSources.contains(foreign))
  const original = await kit.addCustom('a', { id: 'a' })
  await assert.rejects(kit.replace('a', Promise.reject(new Error('loading'))), /loading/); assert.equal(kit.get('a'), original)
  const replacement = new CustomDataSource('replacement'); await kit.replace('a', replacement); assert.equal(kit.get('a'), replacement); assert.equal(v.dataSources.contains(original), false)
  const pending = deferred(), loading = kit.add(pending.promise, { id: 'late' }); kit.dispose(); await assert.rejects(loading, /disposed/)
  pending.resolve(new CustomDataSource('late')); await Promise.resolve(); await Promise.resolve(); assert.equal(v.dataSources.length, 1)
})
test('scene restoration restores only values still owned and removes event subscriptions', () => {
  const v = fixture(), kit = new SceneKit(v)
  assert.throws(() => kit.configure({ lighting: true, resolutionScale: -1 }), RangeError); assert.equal(v.scene.globe.enableLighting, false)
  kit.configure({ lighting: true, resolutionScale: .5, fog: false }); kit.onRenderError(() => {})
  v.resolutionScale = .75; kit.dispose(); assert.equal(v.resolutionScale, .75); assert.equal(v.scene.globe.enableLighting, false); assert.equal(v.scene.fog.enabled, true); assert.equal(v.scene.renderError.numberOfListeners, 0)
})
test('drawing snap, scale and rotation participate in draft history and cancellation', () => {
  const v = fixture(), kit = new DrawKit(v), target = C.offset(origin, 10, 0)
  assert.ok(Cartesian3.distance(snapPosition(C.offset(origin, 12, 0), { targets: [target], tolerance: 3 }), target) < 1e-6)
  const session = kit.start({ type: 'polyline', interactive: false, snap: { targets: [target], tolerance: 3 } })
  session.addPoint(origin); session.addPoint(C.offset(origin, 12, 0)); const result = session.finish(), edit = kit.edit(result, { interactive: false })
  edit.scale(origin, 2); assert.ok(Math.abs(MeasureKit.distance(edit.positions) - 20) < 1e-5); edit.undo()
  edit.rotate(origin, TransformKit.direction(Cartesian3.add(origin, new Cartesian3(1, 0, 0), new Cartesian3()), origin), .1); edit.undo(); edit.cancel()
  assert.ok(Math.abs(MeasureKit.distance(result.positions) - 10) < 1e-5); kit.dispose()
})
test('extended measures compute horizontal distance, slope, bearing, angle and unit conversion', () => {
  assert.ok(Math.abs(MeasureKit.horizontalDistance(origin, C.offset(origin, 3, 4)) - 5) < 1e-6)
  assert.ok(Math.abs(MeasureKit.angle(C.offset(origin, 10, 0), origin, C.offset(origin, 0, 10)) - Math.PI / 2) < 1e-6)
  assert.equal(MeasureKit.format(1234, 'km'), '1.23 km')
  assert.ok(Math.abs(MeasureKit.bearing({ longitude: 0, latitude: 0 }, { longitude: .01, latitude: 0 }) - Math.PI / 2) < 1e-6)
  assert.throws(() => MeasureKit.angle(origin, origin, origin), RangeError)
})
test('local area with holes uses a common projection and rejects outside, touching and nested rings', () => {
  const ring = (x, y, width) => [[x, y], [x + width, y], [x + width, y + width], [x, y + width]].map(([a, b]) => C.offset(origin, a, b))
  const outer = ring(0, 0, 100), hole = ring(20, 20, 20)
  assert.ok(Math.abs(MeasureKit.areaWithHoles(outer, [hole]) - 9600) < 1e-4)
  for (const holes of [[ring(200, 200, 10)], [ring(0, 0, 10)], [hole, ring(25, 25, 5)], [hole, ring(30, 30, 20)]]) assert.throws(() => MeasureKit.areaWithHoles(outer, holes), RangeError)
})
test('snapshots round-trip owned data and reject malformed versions before changing the camera', async () => {
  const v = fixture(), kit = new SnapshotKit(v), markers = new MarkerKit(v), drawings = new DrawKit(v)
  markers.addMarker({ id: 'point', position: { longitude: 116, latitude: 39 }, point: {} })
  drawings.fromGeoJSON({ type: 'LineString', coordinates: [[116, 39], [116.01, 39]] })
  const saved = JSON.parse(JSON.stringify(kit.capture({ markers, drawings }))); assert.equal(saved.scene.maximumRenderTimeChange, 'infinity')
  markers.clear(); drawings.clear(); await kit.restore(saved, { markers, drawings })
  assert.equal(markers.toJSON().length, 1); assert.equal(drawings.getResults().length, 1)
  const before = v.camera.last; await assert.rejects(kit.restore({ ...saved, version: 2 }), /Unsupported/); assert.equal(v.camera.last, before)
  const snapshot = kit.screenshot(); kit.dispose(); await assert.rejects(snapshot, /disposed/); assert.equal(v.scene.postRender.numberOfListeners, 0)
  markers.dispose(); drawings.dispose()
})
test('imagery configuration, appearance, order and error subscriptions preserve foreign layers', async () => {
  const v = fixture(), kit = new LayerKit(v)
  await kit.addSourceLayer({ type: 'xyz', options: { url: 'https://example.test/{z}/{x}/{y}.png?key=secret' } }, { id: 'a' })
  await kit.addSourceLayer({ type: 'xyz', options: { url: 'https://example.test/other/{z}/{x}/{y}.png' } }, { id: 'b' })
  const a = kit.getImageLayer('a'); kit.setAppearance('a', { brightness: .5, gamma: 2 }); kit.moveImageLayer('a', 1); assert.equal(v.imageryLayers.indexOf(a), 1)
  assert.throws(() => kit.setAppearance('a', { brightness: .8, gamma: 0 }), RangeError); assert.equal(a.brightness, .5)
  const saved = kit.exportConfiguration(); assert.ok(saved[0].source.options.url.includes('REDACTED')); assert.ok(kit.exportConfiguration(true)[0].source.options.url.includes('secret'))
  const count = a.imageryProvider.errorEvent.numberOfListeners; kit.onTileError('a', () => {}); assert.equal(a.imageryProvider.errorEvent.numberOfListeners, count + 1)
  kit.removeImageLayer('a'); assert.equal(a.imageryProvider.errorEvent.numberOfListeners, count)
  kit.dispose()
})
test('camera subscriptions and constraints restore only their own values', () => {
  const v = fixture(), kit = new CameraKit(v), c = v.scene.screenSpaceCameraController
  kit.setConstraints({ minimumZoomDistance: 10, enableZoom: false }); kit.onMove('start', () => {}); c.enableZoom = true
  kit.dispose(); assert.equal(c.minimumZoomDistance, 1); assert.equal(c.enableZoom, true); assert.equal(v.camera.moveStart.numberOfListeners, 0)
})
test('drill picking limits, filters and stable identity use native pick results', () => {
  const v = fixture(), entity = { id: 'one' }; v.scene.drillPick = () => [{ id: entity }, { primitive: { id: 'two' } }]
  const kit = new PickKit(v), results = kit.pickAll(new Cartesian2(10, 10), { filter: p => PickKit.identity(p) === entity })
  assert.equal(results.length, 1); assert.equal(PickKit.identity(results[0]), entity); kit.dispose()
})
