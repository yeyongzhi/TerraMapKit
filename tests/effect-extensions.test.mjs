import assert from 'node:assert/strict'
import test from 'node:test'
import { Clock, Color, Entity, EntityCollection, JulianDate, Cartesian3, Cartographic, Matrix4, Transforms } from 'cesium'
import { EffectKit, CoordinateKit } from 'terra-map-kit'
const origin = JulianDate.fromIso8601('2026-10-03T00:00:00Z')
const position = { longitude: 116.39, latitude: 39.9, height: 100 }
const route = [position, { ...position, longitude: 116.4 }, { ...position, longitude: 116.4, latitude: 39.91 }]

test('paused and completed animations expose constant geometry while seek, patch and resume invalidate it', () => {
  const { kit, tick, at } = fixture()
  const ripple = kit.addRipple({ position, radius: 1000, duration: 2, loop: false })
  const wave = kit.addWave({ position, length: 1000 })
  const pulse = kit.addPulsePoint({ position })
  const properties = [ripple.entities[0].ellipse.semiMajorAxis, wave.entities[0].polyline.positions, pulse.entities[0].point.pixelSize]
  assert.ok(properties.every(property => !property.isConstant))
  tick(0.5); kit.pauseAll(); assert.ok(properties.every(property => property.isConstant))
  const before = properties[0].getValue(at(1))
  ripple.seek(1); ripple.patch({ radius: 2000 })
  assert.equal(properties[0].isConstant, true); assert.notEqual(properties[0].getValue(at(1)), before)
  kit.resumeAll(); assert.ok(properties.every(property => !property.isConstant))
  tick(4); assert.equal(ripple.completed, true); assert.equal(properties[0].isConstant, true)
  kit.dispose()
})
function fixture() {
  let renders = 0
  const viewer = { entities: new EntityCollection(), clock: new Clock({ currentTime: JulianDate.clone(origin) }), isDestroyed: () => false, scene: { requestRender: () => renders++ } }
  const at = seconds => JulianDate.addSeconds(origin, seconds, new JulianDate())
  const tick = seconds => { viewer.clock.currentTime = at(seconds); viewer.clock.onTick.raiseEvent(viewer.clock) }
  return { kit: new EffectKit(viewer), viewer, at, tick, renders: () => renders }
}
test('partial updates preserve native entities, cursor and isolated caller inputs', () => {
  const { kit, viewer, at } = fixture()
  const p = { ...position }, color = Color.RED.withAlpha(0.5)
  const handle = kit.addRipple({ position: p, radius: 1000, duration: 4, color })
  const entities = handle.entities
  viewer.clock.currentTime = at(1)
  handle.patch({ radius: 2000, color: Color.BLUE })
  assert.equal(handle.entities[0], entities[0]); assert.equal(handle.currentTime, 1)
  assert.equal(handle.entities[0].ellipse.semiMajorAxis.getValue(at(1)), 500.75)
  p.longitude = 0; color.alpha = 0
  assert.ok(Cartesian3.equals(handle.entities[0].position.getValue(at(1)), CoordinateKit.fromDegrees(116.39, 39.9, 100)))
  handle.pause(); handle.patch({ count: 2 })
  assert.equal(handle.paused, true); assert.equal(handle.currentTime, 1); assert.equal(handle.entities.length, 2)
  assert.ok(entities.every(entity => !viewer.entities.contains(entity)))
  assert.throws(() => handle.patch({ id: 'other' }), TypeError)
  const current = handle.entities[0]
  assert.throws(() => handle.patch({ radius: NaN }), TypeError)
  assert.equal(handle.entities[0], current); assert.equal(handle.currentTime, 1)
  kit.dispose()
})
test('visibility retains timeline; speed changes are continuous; seek and restart render while paused', () => {
  const { kit, viewer, at, renders } = fixture()
  const h = kit.addPulsePoint({ position, duration: 8 })
  viewer.clock.currentTime = at(2); h.setSpeed(2)
  assert.equal(h.currentTime, 2)
  viewer.clock.currentTime = at(3); assert.equal(h.currentTime, 4)
  h.setVisible(false); assert.equal(h.entities[0].show, false)
  viewer.clock.currentTime = at(4); assert.equal(h.currentTime, 6)
  h.pause(); const n = renders(); h.seek(1); assert.equal(h.currentTime, 1); assert.ok(renders() > n)
  h.patch({ color: Color.ORANGE }); assert.equal(h.visible, false); assert.equal(h.speed, 2)
  h.restart(); assert.equal(h.currentTime, 0); assert.equal(h.paused, false)
  assert.throws(() => h.setSpeed(0), RangeError); assert.throws(() => h.seek(9), RangeError)
  assert.throws(() => h.setVisible(1), TypeError)
  kit.dispose()
})
test('one-shot completion is committed once, final phase is retained, callbacks may dispose', () => {
  const { kit, viewer, at, tick } = fixture()
  let completions = 0
  const h = kit.addDiffusionCircle({ position, loop: false, duration: 2, radius: 500, onComplete: handle => { assert.equal(handle.completed, true); completions++ } })
  tick(4); assert.equal(h.completed, true); assert.equal(h.paused, true); assert.equal(completions, 1)
  assert.equal(h.entities[0].ellipse.semiMajorAxis.getValue(at(10)), 500)
  assert.equal(h.entities[0].ellipse.material.getValue(at(10)).color.alpha, 0)
  assert.equal(viewer.clock.onTick.numberOfListeners, 0)
  h.resume(); tick(5); assert.equal(completions, 1)
  h.seek(1); h.resume(); tick(6); assert.equal(completions, 2)
  h.restart(); tick(10); assert.equal(completions, 3)
  kit.addPulsePoint({ position, loop: false, duration: 1, onComplete: () => kit.dispose() })
  tick(11); assert.equal(viewer.entities.values.length, 0); assert.equal(viewer.clock.onTick.numberOfListeners, 0)
})
test('bulk operations prune external deletions, snapshots are read-only, clear permits reuse', () => {
  const { kit, viewer } = fixture()
  const foreign = viewer.entities.add(new Entity())
  const a = kit.addRipple({ position }), b = kit.addWave({ position })
  assert.equal(kit.size, 2); assert.ok(Object.isFrozen(kit.getEffects()))
  kit.pauseAll(); assert.equal(viewer.clock.onTick.numberOfListeners, 0)
  kit.resumeAll(); assert.equal(viewer.clock.onTick.numberOfListeners, 1)
  viewer.entities.remove(a.entities[0]); assert.equal(kit.size, 1)
  assert.throws(() => a.pause(), /removed/)
  kit.clear(); assert.equal(kit.size, 0); assert.deepEqual(viewer.entities.values, [foreign])
  assert.throws(() => b.pause(), /removed/)
  kit.addPulsePoint({ position }); assert.equal(kit.size, 1); kit.dispose()
  assert.throws(() => kit.clear(), /disposed/)
})
test('pulse and radar animate in screen size and cached local ENU coordinates', () => {
  const { kit, at } = fixture()
  const h = kit.addPulsePoint({ position, duration: 4, pixelSize: 30, minPixelSize: 10 })
  assert.equal(h.entities[0].point.pixelSize.getValue(at(0)), 10)
  assert.equal(h.entities[0].point.pixelSize.getValue(at(2)), 30)
  const scan = kit.addRadarScan({ position, duration: 4, radius: 500, angle: 60, segments: 8 })
  const polygon = scan.entities[0].polygon
  const points = polygon.hierarchy.getValue(at(0)).positions.map(p => Cartesian3.clone(p))
  assert.equal(points.length, 10)
  const inverse = Matrix4.inverseTransformation(Transforms.eastNorthUpToFixedFrame(CoordinateKit.fromDegrees(116.39, 39.9, 100)), new Matrix4())
  const middle = Matrix4.multiplyByPoint(inverse, points[5], new Cartesian3())
  assert.ok(Math.abs(middle.x) < 1e-6 && Math.abs(middle.y - 500) < 1e-6)
  assert.notDeepEqual(points, polygon.hierarchy.getValue(at(1)).positions)
  kit.dispose()
})
test('flow follows route corners by length and flight arc keeps endpoints and elevated midpoint', () => {
  const { kit, at } = fixture()
  const flow = kit.addFlowLine({ positions: route, duration: 4, trailLength: 1 })
  const points = flow.entities[0].polyline.positions.getValue(at(2))
  assert.equal(points.length, 3)
  assert.ok(Cartesian3.equals(points[1], CoordinateKit.fromDegrees(route[1].longitude, route[1].latitude, 100)))
  const arc = kit.addFlightArc({ from: route[0], to: route[2], arcHeight: 500, segments: 8 })
  const arcPoints = arc.entities[0].polyline.positions.getValue(at(0))
  assert.ok(Cartesian3.equalsEpsilon(arcPoints[0], CoordinateKit.fromDegrees(116.39, 39.9, 100), 0, 1e-6))
  assert.ok(Math.abs(Cartographic.fromCartesian(arcPoints[4]).height - 600) < 1e-6)
  const entity = arc.entities[0]; arc.patch({ color: Color.RED }); assert.equal(arc.entities[0], entity)
  arc.patch({ arcHeight: 1000 }); assert.notEqual(arc.entities[0], entity)
  kit.dispose()
})
test('polygon and wall validate local geometry, copy input and close the wall', () => {
  const { kit, at } = fixture()
  const positions = route.map(p => ({ ...p }))
  const wall = kit.addWall({ positions, wallHeight: 300 })
  assert.equal(wall.entities[0].wall.positions.getValue(at(0)).length, 4)
  assert.deepEqual(wall.entities[0].wall.maximumHeights.getValue(at(0)), [400, 400, 400, 400])
  const polygon = kit.addPolygonPulse({ positions })
  positions[0].longitude = 0
  assert.ok(Cartesian3.equals(polygon.entities[0].polygon.hierarchy.getValue(at(0)).positions[0], CoordinateKit.fromDegrees(116.39, 39.9, 100)))
  assert.throws(() => kit.addPolygonPulse({ positions: [route[0], route[1], route[0]] }), RangeError)
  assert.throws(() => kit.addWall({ positions: route, wallHeight: -1 }), RangeError)
  assert.throws(() => kit.addFlightArc({ from: position, to: { longitude: 0, latitude: 0 } }), RangeError)
  for (const options of [{ position, loop: 1 }, { position, show: 'yes' }, { position, onComplete: true }]) assert.throws(() => kit.addPulsePoint(options), TypeError)
  kit.dispose()
})
test('rebuild failure rolls back configuration, entities and cursor', () => {
  const { kit, viewer, at } = fixture()
  const h = kit.addRipple({ position, duration: 4 }); viewer.clock.currentTime = at(1)
  const old = h.entities, add = viewer.entities.add.bind(viewer.entities)
  let calls = 0
  viewer.entities.add = entity => { if (++calls === 2) throw new Error('injected failure'); return add(entity) }
  assert.throws(() => h.patch({ count: 4, radius: 500 }), /injected failure/)
  assert.equal(h.entities[0], old[0]); assert.equal(h.entities.length, 3); assert.equal(h.currentTime, 1)
  assert.equal(viewer.entities.values.length, 3)
  viewer.entities.add = add; kit.dispose()
})
test('cached wave buffers evolve and rebuild when segment count changes', () => {
  const { kit, at } = fixture()
  const h = kit.addWave({ position, segments: 8 })
  const a = h.entities[0].polyline.positions.getValue(at(0)), first = a.map(p => Cartesian3.clone(p))
  const b = h.entities[0].polyline.positions.getValue(at(1))
  assert.equal(a, b); assert.notDeepEqual(first, b)
  h.patch({ segments: 16 }); assert.equal(h.entities[0].polyline.positions.getValue(at(0)).length, 17)
  kit.dispose()
})
test('completion callbacks cannot suppress unrelated completions when one callback throws', () => {
  const { kit, tick } = fixture(); let notified = 0
  kit.addPulsePoint({ position, loop: false, duration: 1, onComplete: () => { throw new Error('user callback') } })
  const second = kit.addPulsePoint({ position, loop: false, duration: 1, onComplete: () => notified++ })
  assert.throws(() => tick(2), /user callback/)
  assert.equal(second.completed, true); assert.equal(notified, 1)
  tick(3); assert.equal(notified, 1); kit.dispose()
})
