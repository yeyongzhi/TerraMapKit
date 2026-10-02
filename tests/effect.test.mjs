import assert from 'node:assert/strict'
import test from 'node:test'
import { Clock, Color, Entity, EntityCollection, JulianDate, Cartesian3, Matrix4, Transforms } from 'cesium'
import { EffectKit, CoordinateKit } from 'terra-map-kit'
import { EffectKit as SubpathKit } from 'terra-map-kit/effect'

const origin = JulianDate.fromIso8601('2026-10-02T00:00:00Z')
const position = { longitude: 116.39, latitude: 39.9, height: 100 }
function fixture() {
  const viewer = { entities: new EntityCollection(), clock: new Clock({ currentTime: JulianDate.clone(origin) }), isDestroyed: () => false, scene: { requestRender() {} } }
  const at = seconds => JulianDate.addSeconds(origin, seconds, new JulianDate())
  return { viewer, kit: new EffectKit(viewer), at }
}

test('ripple exposes native entities with evenly staggered radii and fading color', () => {
  assert.equal(EffectKit, SubpathKit)
  const { viewer, kit, at } = fixture()
  const handle = kit.addRipple({ position, radius: 1000, minRadius: 100, count: 3, duration: 3 })
  assert.equal(handle.entities.length, 3)
  assert.ok(handle.entities.every(entity => entity instanceof Entity))
  assert.ok(Object.isFrozen(handle.entities))
  const ellipse = handle.entities[0].ellipse
  assert.equal(ellipse.semiMajorAxis.getValue(at(0)), 100)
  assert.equal(ellipse.semiMajorAxis.getValue(at(1.5)), 550)
  assert.equal(ellipse.semiMajorAxis.getValue(at(3)), 100)
  assert.ok(Math.abs(handle.entities[1].ellipse.semiMajorAxis.getValue(at(0)) - 400) < 1e-6)
  assert.equal(ellipse.outline.getValue(at(0)), true)
  assert.ok(Math.abs(ellipse.outlineColor.getValue(at(1.5)).alpha - 0.4) < 1e-10)
  assert.equal(viewer.clock.onTick.numberOfListeners, 1)
  kit.dispose()
})

test('diffusion is a filled disk; pause/resume retains phase and releases idle listener', () => {
  const { viewer, kit, at } = fixture()
  const handle = kit.addDiffusionCircle({ position, radius: 1000, duration: 4 })
  assert.equal(handle.entities[0].ellipse.fill.getValue(at(0)), true)
  viewer.clock.currentTime = at(1)
  const radius = handle.entities[0].ellipse.semiMajorAxis.getValue(at(1))
  handle.pause(); handle.pause()
  assert.equal(handle.paused, true)
  assert.equal(handle.entities[0].ellipse.semiMajorAxis.getValue(at(100)), radius)
  assert.equal(viewer.clock.onTick.numberOfListeners, 0)
  viewer.clock.currentTime = at(10)
  handle.resume(); handle.resume()
  assert.equal(handle.paused, false)
  assert.equal(handle.entities[0].ellipse.semiMajorAxis.getValue(at(10)), radius)
  assert.equal(viewer.clock.onTick.numberOfListeners, 1)
  kit.dispose()
})

test('wave is a sampled ENU sine polyline with predictable amplitude and time evolution', () => {
  const { kit, at } = fixture()
  const handle = kit.addWave({ position, length: 1000, wavelength: 1000, amplitude: 100, segments: 8, duration: 4 })
  const line = handle.entities[0].polyline
  const points = line.positions.getValue(at(0))
  assert.equal(points.length, 9)
  const frame = Transforms.eastNorthUpToFixedFrame(CoordinateKit.fromDegrees(position.longitude, position.latitude, position.height))
  const inverse = Matrix4.inverseTransformation(frame, new Matrix4())
  const local = Matrix4.multiplyByPoint(inverse, points[6], new Cartesian3())
  assert.ok(Math.abs(local.x - 250) < 1e-6)
  assert.ok(Math.abs(local.y - 100) < 1e-6)
  assert.notDeepEqual(line.positions.getValue(at(0)), line.positions.getValue(at(1)))
  kit.dispose()
})

test('update validates atomically, replaces entities, resets cycle and keeps pause state', () => {
  const { viewer, kit, at } = fixture()
  const handle = kit.addRipple({ id: 'a', position, count: 3 })
  const old = handle.entities
  assert.throws(() => handle.update({ position, radius: -1 }), RangeError)
  assert.equal(handle.entities[0], old[0])
  handle.pause()
  handle.update({ position, count: 2, radius: 500, minRadius: 10, color: Color.RED })
  assert.equal(handle.entities.length, 2)
  assert.equal(viewer.entities.values.length, 2)
  assert.ok(old.every(entity => !viewer.entities.contains(entity)))
  assert.equal(handle.paused, true)
  assert.equal(handle.entities[0].ellipse.semiMajorAxis.getValue(at(100)), 10)
  kit.dispose()
})

test('instances, foreign objects and stale handles are isolated; cleanup removes tick subscription', () => {
  const { viewer, kit } = fixture()
  const other = new EffectKit(viewer)
  const foreign = viewer.entities.add(new Entity())
  const first = kit.addRipple({ id: 'same', position })
  const second = other.addWave({ id: 'same', position })
  assert.equal(kit.removeEffect(second), false)
  assert.throws(() => kit.addWave({ id: 'same', position }), /Duplicate/)
  assert.equal(kit.getEffect('same'), first)
  assert.equal(first.remove(), true)
  assert.equal(first.remove(), false)
  assert.throws(() => first.resume(), /removed/)
  kit.dispose(); kit.dispose()
  assert.equal(viewer.entities.contains(foreign), true)
  assert.equal(viewer.entities.contains(second.entities[0]), true)
  other.dispose()
  assert.equal(viewer.clock.onTick.numberOfListeners, 0)
  assert.equal(viewer.entities.values.length, 1)
})

test('external partial removal is pruned as a whole on the next clock tick', () => {
  const { viewer, kit } = fixture()
  const handle = kit.addRipple({ id: 'a', position })
  viewer.entities.remove(handle.entities[0])
  viewer.clock.onTick.raiseEvent(viewer.clock)
  assert.equal(kit.getEffect('a'), undefined)
  assert.equal(viewer.entities.values.length, 0)
  assert.equal(viewer.clock.onTick.numberOfListeners, 0)
})

test('rejects invalid parameters and clones caller input', () => {
  const { kit, at } = fixture()
  for (const options of [undefined, {}, { position, duration: NaN }, { position, color: {} }]) {
    assert.throws(() => kit.addRipple(options), TypeError)
  }
  for (const options of [{ position, count: 2.5 }, { position, count: 9 }, { position, radius: 0 }, { position, minRadius: 2000 }]) {
    assert.throws(() => kit.addRipple(options), RangeError)
  }
  assert.throws(() => kit.addWave({ position, segments: 7 }), RangeError)
  const color = Color.RED.withAlpha(0.5)
  const input = { ...position }
  const handle = kit.addDiffusionCircle({ position: input, color })
  input.longitude = 0; color.alpha = 1
  assert.ok(Cartesian3.equals(handle.entities[0].position.getValue(at(0)), CoordinateKit.fromDegrees(position.longitude, position.latitude, position.height)))
  assert.equal(handle.entities[0].ellipse.material.getValue(at(0)).color.alpha, 0.5)
  kit.dispose()
})

test('destroyed Viewer and disposed Kit reject use while cleanup is idempotent', () => {
  const { viewer, kit } = fixture()
  const handle = kit.addWave({ position })
  viewer.isDestroyed = () => true
  assert.throws(() => handle.pause(), /destroyed/)
  viewer.clock.onTick.raiseEvent(viewer.clock)
  assert.equal(viewer.entities.values.length, 0)
  assert.equal(viewer.clock.onTick.numberOfListeners, 0)
  kit.dispose()
  assert.throws(() => kit.addWave({ position }), /disposed/)
})
