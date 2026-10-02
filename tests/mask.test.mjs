import assert from 'node:assert/strict'
import test from 'node:test'
import { Color, Entity, EntityCollection, JulianDate, ClassificationType, ArcType } from 'cesium'
import { MaskKit } from 'terra-map-kit'
import { MaskKit as SubpathKit } from 'terra-map-kit/mask'

const square = [
  { longitude: 110, latitude: 30 }, { longitude: 112, latitude: 30 },
  { longitude: 112, latitude: 32 }, { longitude: 110, latitude: 32 }
]
const bounds = { west: 108, east: 114, south: 28, north: 34 }
function fixture() {
  const viewer = { entities: new EntityCollection(), isDestroyed: () => false, scene: { requestRender() {} } }
  return { viewer, kit: new MaskKit(viewer) }
}

test('mask creates native Entity with a hole, copies input/color and uses terrain classification', () => {
  assert.equal(MaskKit, SubpathKit)
  const { viewer, kit } = fixture()
  const color = Color.BLACK.withAlpha(0.4)
  const handle = kit.addRegionMask({ id: 'a', positions: Object.freeze(square), outerBounds: bounds, color })
  assert.ok(handle.entity instanceof Entity)
  assert.equal(viewer.entities.contains(handle.entity), true)
  const time = JulianDate.now()
  const hierarchy = handle.entity.polygon.hierarchy.getValue(time)
  assert.equal(hierarchy.positions.length, 4)
  assert.equal(hierarchy.holes.length, 1)
  assert.equal(hierarchy.holes[0].positions.length, 4)
  assert.equal(handle.entity.polygon.classificationType.getValue(time), ClassificationType.TERRAIN)
  assert.equal(handle.entity.polygon.arcType.getValue(time), ArcType.RHUMB)
  color.alpha = 1
  assert.equal(handle.entity.polygon.material.getValue(time).color.alpha, 0.4)
  kit.dispose()
})

test('update is atomic on invalid input; valid update keeps the entity and replaces geometry', () => {
  const { kit } = fixture()
  const handle = kit.addRegionMask({ positions: [...square, square[0]] })
  const old = handle.entity.polygon
  assert.throws(() => handle.update({ positions: [] }), RangeError)
  assert.equal(handle.entity.polygon, old)
  handle.update({ positions: square, color: Color.RED.withAlpha(0.2) })
  assert.notEqual(handle.entity.polygon, old)
  assert.equal(handle.remove(), true)
  assert.equal(handle.remove(), false)
  assert.throws(() => handle.update({ positions: square }), /removed/)
})

test('instances and foreign entities remain isolated; external removal and duplicate IDs are safe', () => {
  const { viewer, kit } = fixture()
  const foreign = viewer.entities.add(new Entity())
  const other = new MaskKit(viewer)
  const first = kit.addRegionMask({ id: 'same', positions: square })
  const second = other.addRegionMask({ id: 'same', positions: square })
  assert.throws(() => kit.addRegionMask({ id: 'same', positions: square }), /Duplicate/)
  assert.equal(kit.removeRegionMask(second), false)
  viewer.entities.remove(first.entity)
  assert.equal(first.remove(), false)
  kit.addRegionMask({ id: 'same', positions: square })
  kit.dispose(); kit.dispose()
  assert.equal(viewer.entities.contains(foreign), true)
  assert.equal(viewer.entities.contains(second.entity), true)
  assert.equal(viewer.isDestroyed(), false)
  other.dispose()
  assert.equal(viewer.entities.values.length, 1)
})

test('rejects self intersections, duplicate vertices, degeneracy, date-line and polar regions', () => {
  const { viewer, kit } = fixture()
  const invalid = [[], [square[0], square[1]], [square[0], square[1], square[0], square[2]],
    [square[0], square[2], square[1], square[3]],
    [{ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 1 }, { longitude: 2, latitude: 2 }],
    [{ longitude: 179, latitude: 1 }, { longitude: -179, latitude: 1 }, { longitude: 179, latitude: 2 }],
    [{ longitude: 0, latitude: 81 }, { longitude: 1, latitude: 81 }, { longitude: 1, latitude: 82 }]]
  for (const positions of invalid) assert.throws(() => kit.addRegionMask({ positions }), RangeError)
  assert.throws(() => kit.addRegionMask({ positions: new Array(3) }), TypeError)
  assert.throws(() => kit.addRegionMask({ positions: square, outerBounds: { ...bounds, west: 110 } }), RangeError)
  assert.throws(() => kit.addRegionMask({ positions: square, color: new Color(0, 0, 0, 2) }), TypeError)
  assert.equal(viewer.entities.values.length, 0)
})

test('disposed or destroyed Viewer rejects new/update calls while cleanup stays safe', () => {
  const { viewer, kit } = fixture()
  const handle = kit.addRegionMask({ positions: square })
  viewer.isDestroyed = () => true
  assert.throws(() => handle.update({ positions: square }), /destroyed/)
  assert.throws(() => kit.addRegionMask({ positions: square }), /destroyed/)
  kit.dispose(); kit.dispose()
  assert.equal(viewer.entities.values.length, 0)
  assert.equal(handle.remove(), false)
})
