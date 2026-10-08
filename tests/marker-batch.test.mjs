import assert from 'node:assert/strict'
import test from 'node:test'
import { Color, EntityCollection, JulianDate } from 'cesium'
import { MarkerKit } from 'terra-map-kit/marker'
const item = id => ({ id, position: { longitude: 116.39, latitude: 39.9 }, point: { color: Color.CYAN } })
function fixture() {
  let renders = 0, notifications = 0
  const viewer = { entities: new EntityCollection(), scene: { requestRender() { renders++ } }, isDestroyed: () => false }
  viewer.entities.collectionChanged.addEventListener(() => notifications++)
  return { viewer, kit: new MarkerKit(viewer), reset() { renders = notifications = 0 }, stats: () => ({ renders, notifications }) }
}
test('batch add/patch/remove merge render requests and collection notifications while retaining identities', () => {
  const app = fixture(), { kit } = app
  const handles = kit.addMarkers(Array.from({ length: 100 }, (_, i) => item(String(i))))
  assert.deepEqual(app.stats(), { renders: 1, notifications: 1 }); assert.ok(Object.isFrozen(handles))
  kit.edit(handles[0], { interactive: false }); app.reset()
  kit.patchMarkers(handles.map(handle => ({ id: handle.id, patch: { position: { longitude: 116.4, latitude: 39.91 }, point: { color: Color.RED } } })))
  assert.deepEqual(app.stats(), { renders: 1, notifications: 1 })
  assert.equal(kit.getMarker('0'), handles[0]); assert.equal(handles[0].position.longitude, 116.4)
  assert.ok(Color.equals(handles[0].entity.point.color.getValue(JulianDate.now()), Color.RED))
  app.reset(); assert.equal(kit.removeMarkers(['0', '0', 'missing', '1']), 2)
  assert.deepEqual(app.stats(), { renders: 1, notifications: 1 }); assert.equal(kit.getMarkers().length, 98)
  app.reset(); kit.clear(); assert.deepEqual(app.stats(), { renders: 1, notifications: 1 }); kit.dispose()
})
test('batch validation rejects entire input before touching geometry, snapshots or editing', () => {
  const { kit, viewer, reset, stats } = fixture(), [a, b] = kit.addMarkers([item('a'), item('b')])
  const editor = kit.edit(a, { interactive: false }); reset()
  assert.throws(() => kit.addMarkers([item('c'), { ...item('d'), position: { longitude: NaN, latitude: 0 } }]))
  assert.throws(() => kit.addMarkers([item('c'), item('c')]), /Duplicate/)
  assert.throws(() => kit.patchMarkers([{ id: 'a', patch: { show: false } }, { id: 'b', patch: { point: { pixelSize: -1 } } }]))
  assert.throws(() => kit.patchMarkers([{ id: 'a', patch: {} }, { id: 'a', patch: {} }]), /Duplicate/)
  assert.throws(() => kit.removeMarkers(['a', '']), /id/)
  assert.throws(() => kit.addMarkers(Array(10001)), /10000/)
  assert.throws(() => kit.addMarkers(Array(2)), /options/)
  assert.equal(viewer.entities.values.length, 2); assert.equal(a.entity.show, true); assert.equal(b.entity.show, true)
  assert.deepEqual(stats(), { renders: 0, notifications: 0 }); editor.moveTo({ longitude: 116.4, latitude: 39.9 }); editor.cancel(); kit.dispose()
})
test('native addition failure rolls back only new batch entities and restores event suspension', () => {
  const { kit, viewer } = fixture(); kit.addMarker(item('existing'))
  const add = viewer.entities.add.bind(viewer.entities); let calls = 0
  viewer.entities.add = entity => { if (++calls === 2) throw new Error('native add failed'); return add(entity) }
  assert.throws(() => kit.addMarkers([item('a'), item('b')]), /native add/)
  assert.equal(viewer.entities.values.length, 1); viewer.entities.add = add
  kit.addMarkers([item('a'), item('b')]); assert.equal(viewer.entities.values.length, 3); kit.dispose()
})
test('runtime patch failure rolls back completed updates on the original entities', () => {
  const { kit } = fixture(); const [a, b] = kit.addMarkers([item('a'), item('b')])
  const update = kit.updateMarker.bind(kit)
  kit.updateMarker = (id, options) => { if (id === 'b' && options.show === false) throw new Error('native update failed'); update(id, options) }
  assert.throws(() => kit.patchMarkers([{ id: 'a', patch: { show: false } }, { id: 'b', patch: { show: false } }]), /native update/)
  assert.equal(a.entity.show, true); assert.equal(b.entity.show, true); assert.equal(kit.getMarker('a'), a); kit.dispose()
})
test('collection callbacks may dispose a batch; no objects or stale handles survive', () => {
  const { kit, viewer } = fixture(); viewer.entities.collectionChanged.addEventListener(() => kit.dispose())
  assert.throws(() => kit.addMarkers([item('a'), item('b')]), /disposed/)
  assert.equal(viewer.entities.values.length, 0)
})
