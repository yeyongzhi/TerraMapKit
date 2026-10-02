import assert from 'node:assert/strict'
import test from 'node:test'
import { Cartesian3, Ellipsoid } from 'cesium'
import { CoordinateKit } from 'terra-map-kit'
import { CoordinateKit as SubpathKit } from 'terra-map-kit/coordinate'

test('root and coordinate subpath expose the same implementation', () => {
  assert.equal(CoordinateKit, SubpathKit)
})

test('known WGS84 equatorial point and default height', () => {
  const point = CoordinateKit.fromDegrees(0, 0)
  assert.ok(point instanceof Cartesian3)
  assert.equal(point.x, 6378137)
  assert.equal(point.y, 0)
  assert.equal(point.z, 0)
})

test('matches native Cesium conversion and round trips within tolerance', () => {
  for (const [longitude, latitude, height] of [
    [116.39, 39.9, 1234], [-73.9857, 40.7484, -100], [0, 0, 0],
    [-180, -45, 100], [180, 45, 100], [90, 0, 35786000]
  ]) {
    const point = CoordinateKit.fromDegrees(longitude, latitude, height)
    assert.deepEqual(point, Cartesian3.fromDegrees(longitude, latitude, height, Ellipsoid.WGS84))
    const result = CoordinateKit.toDegrees(point)
    assert.ok(Math.abs(result.longitude - longitude) < 1e-8)
    assert.ok(Math.abs(result.latitude - latitude) < 1e-8)
    assert.ok(Math.abs(result.height - height) < 1e-4)
  }
})

test('accepts poles without assuming a unique longitude there', () => {
  for (const latitude of [-90, 90]) {
    const result = CoordinateKit.toDegrees(CoordinateKit.fromDegrees(120, latitude, 10))
    assert.ok(Math.abs(result.latitude - latitude) < 1e-8)
    assert.ok(Math.abs(result.height - 10) < 1e-4)
  }
})

test('always uses WGS84 even when the Cesium default ellipsoid changes', () => {
  const original = Ellipsoid.default
  try {
    Ellipsoid.default = Ellipsoid.UNIT_SPHERE
    assert.equal(CoordinateKit.fromDegrees(0, 0).x, 6378137)
    assert.equal(CoordinateKit.toDegrees(new Cartesian3(6378137, 0, 0)).height, 0)
  } finally {
    Ellipsoid.default = original
  }
})

test('batch preserves order, supports readonly input and returns independent points', () => {
  const points = Object.freeze([
    Object.freeze({ longitude: 0, latitude: 0 }),
    Object.freeze({ longitude: 90, latitude: 0, height: 20 }),
    Object.freeze({ longitude: 0, latitude: 0 })
  ])
  const result = CoordinateKit.fromDegreesArray(points)
  assert.equal(result.length, 3)
  assert.deepEqual(result[1], CoordinateKit.fromDegrees(90, 0, 20))
  assert.notEqual(result[0], result[2])
  assert.deepEqual(CoordinateKit.fromDegreesArray([]), [])
})

test('rejects invalid numbers and coordinates outside the documented ranges', () => {
  for (const value of [NaN, Infinity, -Infinity, '1', null]) {
    assert.throws(() => CoordinateKit.fromDegrees(value, 0), TypeError)
    assert.throws(() => CoordinateKit.fromDegrees(0, value), TypeError)
    assert.throws(() => CoordinateKit.fromDegrees(0, 0, value), TypeError)
  }
  for (const longitude of [-180.001, 180.001]) {
    assert.throws(() => CoordinateKit.fromDegrees(longitude, 0), RangeError)
  }
  for (const latitude of [-90.001, 90.001]) {
    assert.throws(() => CoordinateKit.fromDegrees(0, latitude), RangeError)
  }
})

test('rejects malformed batches, holes and invalid batch members', () => {
  for (const points of [null, {}, [null], [{}], new Array(1)]) {
    assert.throws(() => CoordinateKit.fromDegreesArray(points), TypeError)
  }
  assert.throws(() => CoordinateKit.fromDegreesArray([{ longitude: 0, latitude: 91 }]), RangeError)
})

test('rejects invalid Cartesian components and undefined centre conversion', () => {
  for (const point of [null, undefined, {}, new Cartesian3(NaN, 0, 0), { x: 1, y: Infinity, z: 0 }]) {
    assert.throws(() => CoordinateKit.toDegrees(point), TypeError)
  }
  assert.throws(() => CoordinateKit.toDegrees(Cartesian3.ZERO), RangeError)
})
