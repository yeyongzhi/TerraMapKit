import assert from 'node:assert/strict'
import test from 'node:test'
import { Cartesian2, Cartesian3, Clock, EntityCollection, Ellipsoid, Event, JulianDate, Matrix4, PrimitiveCollection, Cesium3DTileset, SceneTransforms } from 'cesium'
import { PickKit, DrawKit, CameraKit, MeasureKit, TilesetKit, TrackKit, PopupKit, CoordinateKit } from 'terra-map-kit'

const point = (lon = 116.39, lat = 39.9, height = 100) => CoordinateKit.fromDegrees(lon, lat, height)
const origin = JulianDate.fromIso8601('2026-10-02T00:00:00Z')
const at = seconds => JulianDate.addSeconds(origin, seconds, new JulianDate())
function fixture() {
  const camera = { positionWC: point(), heading: 0, pitch: -Math.PI / 2, roll: 0, transform: Matrix4.clone(Matrix4.IDENTITY),
    setView(options) { this.lastView = options }, lookAt(center, offset) { this.lastOrbit = { center, offset } }, lookAtTransform(value) { this.transform = value },
    flyTo(options) { this.flight = options }, cancelFlight() { this.flight?.cancel() }, getPickRay() { return {} }, pickEllipsoid() { return point(1) } }
  const viewer = { camera, entities: new EntityCollection(), clock: new Clock({ currentTime: at(0) }), isDestroyed: () => false,
    scene: { requestRender() {}, primitives: new PrimitiveCollection(), postRender: new Event(), globe: { ellipsoid: Ellipsoid.WGS84, pick() { return point(2) } }, pick() { return { id: 'native' } }, pickPositionSupported: true, pickPosition() { return point(3) } }, flyTo: async () => true }
  return viewer
}

test('seven Kits have usable root and subpath exports', async () => {
  for (const [path, Kit] of Object.entries({ pick: PickKit, draw: DrawKit, camera: CameraKit, popup: PopupKit, measure: MeasureKit, tileset: TilesetKit, track: TrackKit })) {
    assert.equal((await import(`terra-map-kit/${path}`))[Kit.name], Kit)
  }
})
test('PickKit follows depth/terrain/ellipsoid precedence and clones results', () => {
  const viewer = fixture(), kit = new PickKit(viewer), screen = new Cartesian2(2, 4)
  assert.deepEqual(kit.toWorld(screen), point(3))
  assert.deepEqual(kit.toWorld(screen, 'terrain'), point(2))
  assert.deepEqual(kit.toWorld(screen, 'ellipsoid'), point(1))
  viewer.scene.pickPosition = () => undefined
  assert.deepEqual(kit.toWorld(screen), point(2))
  assert.equal(kit.toWorld(screen, 'depth'), undefined)
  viewer.scene.globe.pick = () => undefined
  assert.deepEqual(kit.toWorld(screen), point(1))
  assert.equal(kit.toWorld(screen, 'terrain'), undefined)
  assert.deepEqual(kit.pick(screen), { id: 'native' })
  assert.throws(() => kit.toWorld(new Cartesian2(NaN, 0)))
  kit.dispose(); kit.dispose(); assert.throws(() => kit.pick(screen), /disposed/)
})
test('DrawKit supports undo, immutable snapshots, GeoJSON and owned cleanup', () => {
  const viewer = fixture(), kit = new DrawKit(viewer), foreign = viewer.entities.add({})
  const session = kit.start({ id: 'line', type: 'polyline', interactive: false })
  const input = point(); session.addPoint(input); input.x += 1000
  assert.throws(() => session.finish(), /At least/)
  session.addPoint(point(116.4)); assert.equal(session.undo(), true); session.addPoint(point(116.41))
  const result = session.finish()
  assert.deepEqual(result.positions[0], point()); assert.ok(Object.isFrozen(result.positions[0]))
  assert.equal(kit.toGeoJSON(result).geometry.type, 'LineString')
  assert.throws(() => session.undo(), /no longer/)
  const pending = kit.start({ type: 'point', interactive: false }); pending.cancel(); pending.cancel()
  kit.dispose(); assert.deepEqual(viewer.entities.values, [foreign])
})
test('DrawKit validates polygons and clears active sessions', () => {
  const viewer = fixture(), kit = new DrawKit(viewer)
  const session = kit.start({ type: 'polygon', interactive: false })
  for (const p of [point(116.39, 39.9), point(116.4, 39.91), point(116.39, 39.91), point(116.4, 39.9)]) session.addPoint(p)
  assert.throws(() => session.finish(), /intersect/)
  session.cancel()
  const polygon = kit.start({ type: 'polygon', interactive: false })
  for (const p of [point(), point(116.4), point(116.4, 39.91)]) polygon.addPoint(p)
  const result = polygon.finish(), ring = kit.toGeoJSON(result).geometry.coordinates[0]
  assert.deepEqual(ring[0], ring.at(-1))
  kit.clear(); assert.equal(viewer.entities.values.length, 0)
})
test('DrawKit and TrackKit roll back when collection callbacks dispose during creation', () => {
  for (const Kit of [DrawKit, TrackKit]) {
    const viewer = fixture(), kit = new Kit(viewer)
    const off = viewer.entities.collectionChanged.addEventListener(() => { off(); kit.dispose() })
    assert.throws(() => Kit === DrawKit ? kit.start({ type: 'point', interactive: false }) : kit.addTrack({ samples: [
      { time: at(0), position: { longitude: 0, latitude: 0 } }, { time: at(1), position: { longitude: 1, latitude: 0 } }
    ] }), /disposed/)
    assert.equal(viewer.entities.values.length, 0); assert.equal(viewer.clock.onTick.numberOfListeners, 0)
  }
})
test('MeasureKit reports metres, square metres and signed ellipsoid height difference', () => {
  assert.ok(Math.abs(MeasureKit.surfaceDistance([{ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 }]) - 111319.4908) < 0.01)
  assert.ok(Math.abs(MeasureKit.heightDifference(point(116.39, 39.9, 50), point(116.39, 39.9, 150)) - 100) < 1e-6)
  const points = [point(), point(116.4), point(116.4, 39.91)]
  assert.ok(MeasureKit.area(points) > 400000)
  assert.throws(() => MeasureKit.area([point(), point(118), point(118, 40)]), /100/)
  const viewer = fixture(), kit = new MeasureKit(viewer); let result
  const session = kit.start({ type: 'height', interactive: false, onFinish: r => { result = r } })
  session.addPoint(point()); session.addPoint(point(116.39, 39.9, 200))
  assert.equal(result.unit, 'm'); assert.ok(Math.abs(result.value - 100) < 1e-6)
  assert.equal(viewer.entities.values.length, 2)
  assert.equal(kit.remove(result.id), true); kit.dispose(); assert.equal(viewer.entities.values.length, 0)
})
test('user callback failure keeps completed measurements consistently removable', () => {
  const viewer = fixture(), kit = new MeasureKit(viewer)
  const session = kit.start({ type: 'distance', interactive: false, onFinish: () => { throw new Error('consumer callback') } })
  session.addPoint(point()); session.addPoint(point(116.4))
  assert.throws(() => session.finish(), /consumer callback/)
  assert.equal(viewer.entities.values.length, 2); kit.clear(); assert.equal(viewer.entities.values.length, 0)
})
test('MeasureKit cleans labels if disposed during a collection callback', () => {
  const viewer = fixture(), kit = new MeasureKit(viewer)
  const session = kit.start({ type: 'distance', interactive: false })
  session.addPoint(point()); session.addPoint(point(116.4))
  const off = viewer.entities.collectionChanged.addEventListener((_collection, added) => {
    if (added.some(entity => entity.label)) { off(); kit.dispose() }
  })
  assert.throws(() => session.finish(), /disposed/)
  assert.equal(viewer.entities.values.length, 0)
})
test('CameraKit saves independent state, cancels flights and restores orbit transform', async () => {
  const viewer = fixture(), kit = new CameraKit(viewer), saved = kit.saveView()
  saved.position.x += 10; assert.notEqual(saved.position.x, viewer.camera.positionWC.x)
  kit.restoreView(saved); assert.deepEqual(viewer.camera.lastView.destination, saved.position)
  const flight = kit.flyToPosition({ longitude: 1, latitude: 2, height: 500 })
  kit.cancelFlight(); assert.equal(await flight, false)
  const completed = kit.flyToPosition({ longitude: 1, latitude: 2 }); viewer.camera.flight.complete(); assert.equal(await completed, true)
  const stop = kit.startOrbit({ longitude: 1, latitude: 2 }, { speed: 0.5 })
  viewer.clock.currentTime = at(2); viewer.clock.onTick.raiseEvent(viewer.clock)
  assert.equal(viewer.camera.lastOrbit.offset.heading, 1)
  assert.equal(viewer.clock.onTick.numberOfListeners, 1); stop(); stop(); assert.equal(viewer.clock.onTick.numberOfListeners, 0)
  viewer.flyTo = () => new Promise(() => {})
  const unresolved = kit.flyTo({}); kit.dispose(); assert.equal(await unresolved, false)
})
test('TilesetKit owns loaded primitives and destroys late async arrivals', async () => {
  const original = Cesium3DTileset.fromUrl
  const make = () => { let destroyed = false; return { isDestroyed: () => destroyed, destroy() { destroyed = true }, show: true } }
  try {
    const viewer = fixture(), kit = new TilesetKit(viewer), native = make()
    Cesium3DTileset.fromUrl = async () => native
    assert.equal(await kit.addTileset({ id: 'a', url: '/local.json' }), native)
    kit.setVisible('a', false); assert.equal(native.show, false)
    kit.setStyle('a', { color: "color('red')" }); assert.ok(native.style)
    assert.equal(await kit.flyTo('a'), true)
    const foreign = make(); viewer.scene.primitives.add(foreign)
    kit.removeTileset('a'); assert.equal(native.isDestroyed(), true); assert.equal(foreign.isDestroyed(), false)
    let resolve; Cesium3DTileset.fromUrl = () => new Promise(r => { resolve = r })
    const pending = kit.addTileset({ id: 'late', url: '/local.json' })
    await assert.rejects(kit.addTileset({ id: 'late', url: '/local.json' }), /Duplicate/)
    kit.dispose(); const late = make(); resolve(late); await assert.rejects(pending, /disposed/)
    assert.equal(late.isDestroyed(), true); assert.equal(viewer.scene.primitives.length, 1)
  } finally { Cesium3DTileset.fromUrl = original }
})
test('TrackKit interpolates, pauses, seeks, changes speed and releases listeners', () => {
  const viewer = fixture(), kit = new TrackKit(viewer), initial = JulianDate.clone(viewer.clock.currentTime)
  const a = point(), b = point(116.4), track = kit.addTrack({ samples: [{ time: at(0), position: { longitude: 116.39, latitude: 39.9, height: 100 } }, { time: at(10), position: { longitude: 116.4, latitude: 39.9, height: 100 } }] })
  viewer.clock.currentTime = at(5)
  assert.ok(Cartesian3.distance(track.entity.position.getValue(at(999)), Cartesian3.midpoint(a, b, new Cartesian3())) < 1e-6)
  track.pause(); assert.equal(viewer.clock.onTick.numberOfListeners, 0)
  viewer.clock.currentTime = at(20); assert.equal(JulianDate.secondsDifference(track.currentTime, initial), 5)
  track.play(); track.setSpeed(2); viewer.clock.currentTime = at(22); assert.equal(JulianDate.secondsDifference(track.currentTime, initial), 9)
  viewer.clock.currentTime = at(30); viewer.clock.onTick.raiseEvent(viewer.clock); assert.equal(track.paused, true)
  track.seek(2); assert.equal(JulianDate.secondsDifference(track.currentTime, initial), 2)
  assert.throws(() => track.seek(11)); assert.throws(() => track.setSpeed(0))
  const foreign = viewer.entities.add({}); kit.dispose(); assert.deepEqual(viewer.entities.values, [foreign]); assert.throws(() => track.play(), /disposed/)
})
test('TrackKit loops, validates order and cleans externally removed tracks', () => {
  const viewer = fixture(), kit = new TrackKit(viewer)
  const samples = [{ time: at(0), position: { longitude: 0, latitude: 0 } }, { time: at(10), position: { longitude: 1, latitude: 0 } }]
  assert.throws(() => kit.addTrack({ samples: samples.toReversed() }), /increasing/)
  const options = { samples, loop: true }, track = kit.addTrack(options); options.loop = false
  viewer.clock.currentTime = at(12); assert.equal(JulianDate.secondsDifference(track.currentTime, origin), 2)
  viewer.entities.remove(track.entity); viewer.clock.onTick.raiseEvent(viewer.clock)
  assert.equal(viewer.entities.values.length, 0); assert.equal(viewer.clock.onTick.numberOfListeners, 0)
  kit.dispose()
})

test('PopupKit uses text nodes, clones DOM, updates projection and releases render listeners', () => {
  class Element {
    style = {}; children = []; scrollLeft = 0; scrollTop = 0; clientLeft = 0; clientTop = 0
    constructor(document) { this.ownerDocument = document }
    setAttribute() {} replaceChildren(...children) { this.children = children }
    appendChild(child) { this.children.push(child); child.parent = this }
    cloneNode() { const copy = new Element(this.ownerDocument); copy.children = [...this.children]; return copy }
    remove() { this.parent.children = this.parent.children.filter(c => c !== this) }
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 } }
  }
  const document = { defaultView: { HTMLElement: Element }, createElement() { return new Element(this) }, createTextNode(text) { return { textContent: text } } }
  const viewer = fixture(); viewer.container = new Element(document); viewer.scene.canvas = new Element(document)
  const original = SceneTransforms.worldToWindowCoordinates
  try {
    SceneTransforms.worldToWindowCoordinates = () => new Cartesian2(100, 200)
    const kit = new PopupKit(viewer), popup = kit.addPopup({ id: 'a', position: { longitude: 1, latitude: 2 }, content: '<script>literal</script>' })
    assert.equal(popup.element.children[0].textContent, '<script>literal</script>')
    viewer.scene.postRender.raiseEvent(); assert.equal(popup.element.style.left, '100px'); assert.equal(popup.element.style.top, '188px')
    const content = new Element(document); popup.update({ position: { longitude: 1, latitude: 2 }, content }); assert.notEqual(popup.element.children[0], content)
    popup.setVisible(false); viewer.scene.postRender.raiseEvent(); assert.equal(popup.element.style.visibility, 'hidden')
    assert.equal(popup.remove(), true); assert.throws(() => popup.update({ position: { longitude: 1, latitude: 2 }, content: 'removed' }), /removed/)
    kit.addPopup({ id: 'a', position: { longitude: 1, latitude: 2 }, content: 'replacement' }); assert.equal(popup.remove(), false)
    kit.dispose(); assert.equal(viewer.container.children.length, 0); assert.equal(viewer.scene.postRender.numberOfListeners, 0)
  } finally { SceneTransforms.worldToWindowCoordinates = original }
})
