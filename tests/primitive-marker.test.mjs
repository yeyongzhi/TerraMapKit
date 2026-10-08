import test from 'node:test'
import assert from 'node:assert/strict'
import { PrimitiveCollection, PointPrimitiveCollection, EntityCollection, Color, JulianDate, Cartesian2 } from 'cesium'
import { PrimitiveMarkerKit, MarkerKit, createMarkerDisplayOptions } from 'terra-map-kit'
import { PrimitiveMarkerKit as Subpath } from 'terra-map-kit/marker'
const position = { longitude: 116, latitude: 39, height: 100 }
const display = { distance: { near: 10, far: 10000 }, scale: { near: 10, far: 10000, nearValue: 1, farValue: .2 }, translucency: { near: 10, far: 10000, nearValue: 1, farValue: 0 }, disableDepthTestDistance: Infinity }
function fixture() {
  let requests = 0, picked
  const viewer = { isDestroyed: () => false, entities: new EntityCollection(), scene: { primitives: new PrimitiveCollection(), requestRender() { requests++ }, pick() { return picked } } }
  return { viewer, requests: () => requests, pick: value => { picked = value } }
}
test('primitive batches retain identity, clone styles and request one render per operation', () => {
  assert.equal(PrimitiveMarkerKit, Subpath)
  const f = fixture(), kit = new PrimitiveMarkerKit(f.viewer), color = Color.clone(Color.RED)
  const markers = kit.addMarkers(Array.from({ length: 1000 }, (_, i) => ({ id: `${i}`, position, color, display })))
  color.red = 0
  assert.equal(markers[0].primitive.color.red, 1); assert.equal(f.requests(), 1)
  const native = markers[0].primitive
  kit.patchMarkers(markers.map(h => ({ id: h.id, patch: { show: false } })))
  assert.equal(markers[0].primitive, native); assert.equal(native.show, false); assert.equal(f.requests(), 2)
  assert.equal(kit.removeMarkers(markers.map(h => h.id)), 1000); assert.equal(f.requests(), 3)
  assert.equal(kit.size, 0); kit.dispose(); assert.equal(f.viewer.scene.primitives.length, 0)
})
test('validation is atomic and stale handles cannot replace or remove current markers', () => {
  const f = fixture(), kit = new PrimitiveMarkerKit(f.viewer), a = kit.addMarker({ id: 'a', position })
  assert.throws(() => kit.addMarkers([{ id: 'b', position }, { id: 'a', position }]), /Duplicate/)
  assert.throws(() => kit.patchMarkers([{ id: 'a', patch: { show: false } }, { id: 'missing', patch: {} }]), /active/)
  assert.equal(a.primitive.show, true)
  assert.throws(() => kit.addMarkers(new Array(2)), TypeError)
  assert.throws(() => kit.addMarkers(new Array(50001)), RangeError)
  assert.throws(() => kit.patchMarkers([{ id: 'a', patch: { id: 'changed' } }]), TypeError)
  a.remove(); kit.addMarker({ id: 'a', position })
  assert.throws(() => a.setVisible(false), /Stale/); assert.equal(a.remove(), false)
  kit.dispose()
})
test('native insertion failure rolls back the batch and preserves foreign collections', () => {
  const f = fixture(), foreign = f.viewer.scene.primitives.add(new PointPrimitiveCollection()), kit = new PrimitiveMarkerKit(f.viewer)
  const collection = f.viewer.scene.primitives.get(1), add = collection.add
  let calls = 0
  collection.add = function(o) { if (++calls === 2) throw new Error('insertion'); return add.call(this, o) }
  assert.throws(() => kit.addMarkers([{ position }, { position }]), /insertion/)
  assert.equal(collection.length, 0); assert.equal(kit.size, 0)
  kit.dispose(); kit.dispose(); assert.equal(foreign.isDestroyed(), false)
  assert.equal(f.viewer.scene.primitives.length, 1)
})
test('picking uses owned identity and rejects hidden, stale and foreign objects', () => {
  const f = fixture(), kit = new PrimitiveMarkerKit(f.viewer), h = kit.addMarker({ id: 'a', position })
  f.pick({ id: h }); assert.equal(kit.pick(new Cartesian2(1, 1)), h)
  f.pick({ id: { id: 'a' } }); assert.equal(kit.pick(new Cartesian2(1, 1)), undefined)
  f.pick({ primitive: h.primitive }); h.setVisible(false); assert.equal(kit.pick(new Cartesian2(1, 1)), undefined)
  h.setVisible(true); kit.setVisible(false); assert.equal(kit.pick(new Cartesian2(1, 1)), undefined)
  f.viewer.scene.primitives.remove(f.viewer.scene.primitives.get(0))
  assert.throws(() => h.patch({ show: true }), /active/); kit.dispose()
})
test('display validation and Entity JSON round trips preserve native distance controls', () => {
  const f = fixture(), kit = new MarkerKit(f.viewer)
  const h = kit.addMarker({ id: 'a', position, point: {}, image: { image: '/pin.svg' }, label: { text: 'a' }, display })
  const time = JulianDate.now()
  for (const graphics of [h.entity.point, h.entity.billboard, h.entity.label]) {
    assert.equal(graphics.distanceDisplayCondition.getValue(time).far, 10000)
    assert.equal(graphics.disableDepthTestDistance.getValue(time), Infinity)
  }
  const json = JSON.parse(JSON.stringify(kit.toJSON())); assert.equal(json[0].display.disableDepthTestDistance, 'infinity')
  kit.clear(); const [restored] = kit.fromJSON(json)
  assert.equal(restored.entity.point.disableDepthTestDistance.getValue(time), Infinity)
  restored.patch({ display: undefined }); assert.equal(restored.entity.point.distanceDisplayCondition, undefined)
  for (const invalid of [{ distance: { near: 1, far: 1 } }, { translucency: { near: 0, far: 10, nearValue: 2, farValue: 0 } }, { disableDepthTestDistance: -1 }]) assert.throws(() => createMarkerDisplayOptions(invalid), RangeError)
  assert.throws(() => createMarkerDisplayOptions({ scale: { near: 0, far: Infinity, nearValue: 1, farValue: 0 } }), TypeError)
  assert.throws(() => createMarkerDisplayOptions({ disableDepthTestDistance: null }), TypeError)
  assert.throws(() => kit.fromJSON([{ id: 'invalid', position, point: {}, display: null }]), TypeError)
  kit.dispose()
})

test('native update failure restores previous styles across the entire batch', () => {
  const f = fixture(), kit = new PrimitiveMarkerKit(f.viewer)
  const [a, b] = kit.addMarkers([{ id: 'a', position, pixelSize: 5 }, { id: 'b', position, pixelSize: 5 }])
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(b.primitive), 'pixelSize')
  let rejected = false
  Object.defineProperty(b.primitive, 'pixelSize', { configurable: true, get() { return descriptor.get.call(this) }, set(value) { if (!rejected && value === 9) { rejected = true; throw new Error('setter failure') }; descriptor.set.call(this, value) } })
  assert.throws(() => kit.patchMarkers([{ id: 'a', patch: { pixelSize: 9 } }, { id: 'b', patch: { pixelSize: 9 } }]), /setter failure/)
  assert.equal(a.primitive.pixelSize, 5); assert.equal(b.primitive.pixelSize, 5)
  kit.dispose()
})

test('Viewer destruction and detached undestroyed collections still allow final cleanup', () => {
  const f = fixture(), kit = new PrimitiveMarkerKit(f.viewer)
  f.viewer.scene.primitives.destroyPrimitives = false
  const collection = f.viewer.scene.primitives.get(0)
  f.viewer.scene.primitives.remove(collection)
  assert.equal(collection.isDestroyed(), false)
  kit.dispose(); assert.equal(collection.isDestroyed(), true)
  const other = fixture(), destroyedKit = new PrimitiveMarkerKit(other.viewer)
  other.viewer.scene.primitives.destroy(); other.viewer.isDestroyed = () => true
  destroyedKit.dispose(); destroyedKit.dispose()
})
