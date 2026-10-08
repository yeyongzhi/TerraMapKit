import assert from 'node:assert/strict'
import test from 'node:test'
import { EntityCollection, Color, JulianDate, Cartesian2 } from 'cesium'
import { MarkerKit, CoordinateKit } from 'terra-map-kit'
import { PickKit } from 'terra-map-kit/pick'
const position = { longitude: 116.39, latitude: 39.9, height: 100 }, now = JulianDate.now()
const options = (id = 'point') => ({ id, position: { ...position }, point: { color: Color.BLUE }, label: { text: 'marker' }, properties: { name: '标记', nested: { enabled: false } } })
const fixture = () => { const viewer = { entities: new EntityCollection(), scene: { requestRender() {} }, isDestroyed: () => false }; return { viewer, kit: new MarkerKit(viewer) } }

test('marker patch preserves explicit styles and isolated metadata without application states', () => {
  const { kit } = fixture(), input = options(), marker = kit.addMarker(input), entity = marker.entity
  input.properties.nested.enabled = true; input.position.longitude = 0
  marker.patch({ label: { text: 'updated' } }); marker.setPosition({ ...position, height: 200 })
  assert.equal(marker.entity, entity); assert.equal(marker.entity.label.text.getValue(now), 'updated')
  assert.equal(marker.properties.nested.enabled, false); assert.equal(marker.position.height, 200)
  assert.ok(Color.equals(marker.entity.point.color.getValue(now), Color.BLUE))
  assert.throws(() => marker.patch({ id: 'renamed' }), /id/)
  assert.throws(() => marker.patch({ properties: { bad: NaN } }), /JSON/)
  assert.throws(() => marker.patch({ status: 'alarm' }), /status/)
  assert.equal('setStatus' in marker, false); assert.equal('onSelect' in kit, false); kit.dispose()
})

test('generic click and hover events filter identity and release subscriptions', () => {
  const oldClick = PickKit.prototype.onClick, oldMove = PickKit.prototype.onMove
  let click, move, clicks = 0, clickOff = 0, moveOff = 0
  PickKit.prototype.onClick = function(fn) { click = fn; return () => clickOff++ }
  PickKit.prototype.onMove = function(fn) { move = fn; return () => moveOff++ }
  const { kit } = fixture(), phases = []
  try {
    const a = kit.addMarker({ ...options('a'), onClick: () => clicks++ }), b = kit.addMarker(options('b'))
    const off = kit.onHover(event => phases.push(`${event.phase}:${event.id}`))
    const event = marker => ({ screenPosition: new Cartesian2(1, 2), picked: { id: marker?.entity }, position: undefined })
    click(event(a)); click(event(undefined)); assert.equal(clicks, 1)
    move(event(a)); move(event(a)); move(event(b)); move(event(undefined))
    assert.deepEqual(phases, ['enter:a', 'leave:a', 'enter:b', 'leave:b'])
    off(); kit.clear(); assert.equal(clickOff, 1); assert.equal(moveOff, 1)
  } finally { kit.dispose(); PickKit.prototype.onClick = oldClick; PickKit.prototype.onMove = oldMove }
})

test('marker JSON round-trips styles, RGBA, metadata and visibility; validation is atomic', () => {
  const { kit } = fixture()
  const first = kit.addMarker({ ...options('a'), image: { image: '/pin.svg', color: Color.WHITE }, label: { text: 'name', pixelOffset: new Cartesian2(3, -10) }, show: false })
  const data = kit.toJSON(); assert.deepEqual(data[0].point.color, [0, 0, 1, 1])
  const other = fixture(); const [again] = other.kit.fromJSON(JSON.parse(JSON.stringify(data)))
  assert.deepEqual(other.kit.toJSON(), data); assert.equal(again.entity.show, false)
  data[0].properties.nested.enabled = true; assert.equal(first.properties.nested.enabled, false)
  const before = other.viewer.entities.values.length
  assert.throws(() => other.kit.fromJSON([{ ...data[0], id: 'valid' }, { ...data[0], id: 'invalid', position: { longitude: 999, latitude: 0 } }]), /longitude/)
  assert.equal(other.viewer.entities.values.length, before)
  assert.throws(() => other.kit.fromJSON([{ ...data[0], id: 'x' }, { ...data[0], id: 'x' }]), /Duplicate/)
  assert.throws(() => other.kit.fromJSON([{ ...data[0], id: 'rgba', point: { color: [1, 0, 0] } }]), /RGBA/)
  assert.throws(() => other.kit.fromJSON([{ ...data[0], id: '' }]), /id/)
  kit.dispose(); other.kit.dispose()
})

test('marker batch rolls back when native addition fails or disposes its owner', () => {
  const { viewer, kit } = fixture(), foreign = viewer.entities.add({ id: 'foreign' })
  const add = viewer.entities.add.bind(viewer.entities)
  const json = id => ({ id, position, point: {}, properties: { name: '标记' } })
  viewer.entities.add = entity => { if (entity.id === 'b') throw new Error('native failure'); return add(entity) }
  assert.throws(() => kit.fromJSON([json('a'), json('b')]), /native failure/)
  assert.deepEqual(viewer.entities.values, [foreign]); assert.equal(kit.getMarkers().length, 0)
  viewer.entities.add = add; viewer.entities.collectionChanged.addEventListener(() => kit.dispose())
  assert.throws(() => kit.fromJSON([json('a')]), /disposed/)
  assert.deepEqual(viewer.entities.values, [foreign])
})

test('marker editor separates committed/exported position from draft and restores on cancel', () => {
  const { kit } = fixture(), marker = kit.addMarker(options()), entity = marker.entity, original = marker.position
  const changes = [], editor = kit.edit(marker, { interactive: false, onChange: point => changes.push(point) })
  editor.moveTo({ ...position, longitude: 116.4, height: 150 })
  assert.equal(marker.position, original); assert.equal(kit.toJSON()[0].position.longitude, 116.39)
  assert.equal(CoordinateKit.toDegrees(entity.position.getValue(now)).longitude.toFixed(2), '116.40')
  assert.throws(() => editor.moveTo({ longitude: 999, latitude: 0 }), /longitude/)
  assert.equal(editor.position.longitude, 116.4); assert.equal(changes.length, 1)
  assert.equal(editor.finish(), marker); assert.equal(marker.entity, entity); assert.equal(marker.position.height, 150)
  assert.throws(() => editor.finish(), /active/)
  const second = kit.edit(marker, { interactive: false }); second.moveTo(position); second.cancel(); second.cancel()
  assert.equal(marker.position.height, 150); assert.ok(Math.abs(CoordinateKit.toDegrees(entity.position.getValue(now)).height - 150) < 1e-5)
  kit.dispose()
})

test('marker editing switches, updates, removes and disposes without stale ownership or callbacks', () => {
  const { kit, viewer } = fixture(), marker = kit.addMarker(options()), other = kit.addMarker(options('b'))
  let cancelled = 0
  const edit = kit.edit(marker, { interactive: false, onCancel: () => cancelled++ })
  edit.moveTo({ ...position, height: 200 }); kit.edit(other, { interactive: false })
  assert.equal(cancelled, 1); assert.throws(() => edit.moveTo(position), /active/)
  const current = kit.edit(marker, { interactive: false }); marker.patch({ label: { text: 'new' } })
  assert.throws(() => current.finish(), /active/)
  const stale = kit.edit(marker, { interactive: false }); viewer.entities.remove(marker.entity)
  assert.equal(kit.getMarker(marker.id), undefined); assert.throws(() => stale.finish(), /active/)
  assert.throws(() => kit.edit(marker, { interactive: false }), /owned/)
  const active = kit.edit(other, { interactive: false }); kit.dispose()
  assert.equal(viewer.entities.values.length, 0); assert.throws(() => active.finish(), /active/)
})

test('callback errors preserve valid marker edits and cleanup all resources', () => {
  const { kit, viewer } = fixture(), marker = kit.addMarker(options())
  const edit = kit.edit(marker, { interactive: false, onChange: () => { throw new Error('change'); }, onFinish: () => { throw new Error('finish'); } })
  assert.throws(() => edit.moveTo({ ...position, height: 200 }), /change/)
  assert.throws(() => edit.finish(), /finish/); assert.equal(marker.position.height, 200)
  kit.edit(marker, { interactive: false, onCancel: () => { throw new Error('cancel'); } })
  kit.addMarker(options('b'))
  assert.throws(() => kit.clear(), /cancel/); assert.equal(viewer.entities.values.length, 0)
  kit.dispose()
})

test('an editor created by a cancellation callback is not overwritten by an outer update', () => {
  const { kit } = fixture(), marker = kit.addMarker(options())
  let replacement
  kit.edit(marker, { interactive: false, onCancel: () => { replacement = kit.edit(marker, { interactive: false }) } })
  assert.throws(() => marker.patch({ label: { text: 'outer' } }), /Another editor/)
  assert.equal(marker.entity.label.text.getValue(now), 'marker')
  replacement.moveTo({ ...position, height: 250 }); replacement.finish()
  assert.equal(marker.position.height, 250); kit.dispose()
})
