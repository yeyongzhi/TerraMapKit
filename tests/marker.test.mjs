import assert from 'node:assert/strict'
import test from 'node:test'
import { Cartesian2, Color, EntityCollection, JulianDate } from 'cesium'
import { MarkerKit } from 'terra-map-kit'
import { MarkerKit as Subpath } from 'terra-map-kit/marker'
import { PickKit } from 'terra-map-kit/pick'
const position = { longitude: 116.39, latitude: 39.9, height: 100 }
const now = JulianDate.now()
function fixture() { const viewer = { entities: new EntityCollection(), scene: { requestRender() {} }, isDestroyed: () => false }; return { viewer, kit: new MarkerKit(viewer) } }

test('marker exports, combined native graphics, snapshots and atomic validation', () => {
  assert.equal(MarkerKit, Subpath)
  const { viewer, kit } = fixture()
  const foreign = viewer.entities.add({ id: 'foreign' })
  assert.throws(() => kit.addMarker({ id: 'foreign', position, point: {} }), /already exists/)
  assert.equal(viewer.entities.getById('foreign'), foreign)
  const tint = Color.clone(Color.RED), offset = new Cartesian2(2, -20)
  const handle = kit.addMarker({ id: 'a', position, point: { color: tint }, image: { image: '/pin.svg' }, label: { text: 'sensor', pixelOffset: offset } })
  tint.red = 0; offset.x = 100
  assert.equal(handle.entity.point.color.getValue(now).red, 1)
  assert.equal(handle.entity.label.pixelOffset.getValue(now).x, 2)
  assert.equal(handle.entity.billboard.image.getValue(now), '/pin.svg')
  assert.throws(() => handle.update({ position, point: { pixelSize: -1 } }), /pixelSize/)
  assert.equal(handle.entity.label.text.getValue(now), 'sensor')
  const entity = handle.entity
  handle.update({ position: { ...position, height: 200 }, label: { text: 'updated' } })
  assert.equal(handle.entity, entity); assert.equal(entity.point, undefined); assert.equal(entity.billboard, undefined)
  handle.setVisible(false); assert.equal(entity.show, false)
  assert.throws(() => kit.addMarker({ id: 'a', position, point: {} }), /Duplicate/)
  kit.dispose(); kit.dispose()
  assert.deepEqual(viewer.entities.values, [foreign])
})

test('stale handles cannot update replacement markers; external removal is pruned', () => {
  const { viewer, kit } = fixture()
  const old = kit.addMarker({ id: 'same', position, point: {} }); old.remove()
  const current = kit.addMarker({ id: 'same', position, label: { text: 'new' } })
  assert.throws(() => old.update({ position, point: {} }), /active/)
  assert.equal(old.remove(), false); assert.equal(kit.getMarker('same'), current)
  viewer.entities.remove(current.entity); assert.equal(kit.getMarker('same'), undefined)
  const stale = kit.addMarker({ id: 'same', position, point: {} })
  viewer.entities.remove(stale.entity)
  const foreign = viewer.entities.add({ id: 'same' })
  assert.equal(stale.remove(), false)
  assert.equal(viewer.entities.getById('same'), foreign)
  kit.dispose()
})

test('marker clicks filter identity and hidden objects and release lazy subscription', () => {
  const original = PickKit.prototype.onClick
  let dispatch, offCount = 0, subscriptions = 0
  PickKit.prototype.onClick = function(callback) { subscriptions++; dispatch = callback; return () => { offCount++ } }
  const { viewer, kit } = fixture()
  try {
    let local = 0, all = 0
    const handle = kit.addMarker({ id: 'a', position, point: {}, onClick: event => { assert.equal(event.marker, handle); local++ } })
    const off = kit.onClick(() => all++)
    const event = entity => ({ screenPosition: new Cartesian2(1, 2), position: undefined, picked: { primitive: { id: entity } } })
    dispatch(event(viewer.entities.add({ id: 'foreign' })))
    dispatch(event(handle.entity)); assert.equal(local, 1); assert.equal(all, 1); assert.equal(subscriptions, 1)
    handle.setVisible(false); dispatch(event(handle.entity)); assert.equal(local, 1)
    off(); handle.remove(); assert.equal(offCount, 1)
    kit.dispose(); assert.equal(offCount, 1)
  } finally { kit.dispose(); PickKit.prototype.onClick = original }
})

test('marker validation, reentrant disposal and destroyed Viewer reject creation safely', () => {
  const { viewer, kit } = fixture()
  assert.throws(() => kit.addMarker({ position }), /style/)
  assert.throws(() => kit.addMarker({ position, image: { image: '' } }), /image/)
  assert.throws(() => kit.addMarker({ position, label: { text: 1 } }), /text/)
  viewer.entities.collectionChanged.addEventListener(() => kit.dispose())
  assert.throws(() => kit.addMarker({ position, point: {} }), /disposed/)
  assert.equal(viewer.entities.values.length, 0)
  assert.throws(() => kit.onClick(() => {}), /disposed/)
  viewer.isDestroyed = () => true
  assert.throws(() => new MarkerKit(viewer), /destroyed/)
})
