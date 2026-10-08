import test from 'node:test'
import assert from 'node:assert/strict'
import { Cartesian3, Ellipsoid } from 'cesium'
import { CoordinateKit as C, GeometryKit as G, MeasureKit } from 'terra-map-kit'
import { GeometryKit } from 'terra-map-kit/coordinate'
const p = (x, y, z = 0) => new Cartesian3(x, y, z)
const near = (a, b) => assert.ok(Cartesian3.distance(a, b) < 1e-6)

test('ENU axes, round trips, offsets and fixed WGS84 without a Viewer', () => {
  const origin = C.fromDegrees(0, 0)
  near(C.offset(origin, 10, 20, 30), p(6378167, 10, 20))
  near(C.toLocal(origin, C.localCenter(origin, [C.offset(origin, 0, 0), C.offset(origin, 20, 40, 60)])), p(10, 20, 30))
  assert.throws(() => C.localCenter(origin, new Array(2)), TypeError)
  for (const degrees of [[0, 90], [179.99, 20], [-73, -45]]) {
    const origin = C.fromDegrees(...degrees), local = p(30, -40, 50)
    near(C.toLocal(origin, C.fromLocal(origin, local)), local)
  }
  const previous = Ellipsoid.default
  try { Ellipsoid.default = Ellipsoid.UNIT_SPHERE; near(C.offset(origin, 10, 20, 30), p(6378167, 10, 20)) }
  finally { Ellipsoid.default = previous }
  assert.throws(() => C.createLocalFrame(Cartesian3.ZERO), RangeError)
  assert.throws(() => C.offset(origin, undefined, 0), TypeError)
  assert.throws(() => C.fromLocal(origin, p(Infinity, 0)), TypeError)
})

test('Cartesian bounds return independent objects and support arbitrary local coordinates', () => {
  assert.equal(G, GeometryKit)
  const input = Object.freeze([Object.freeze(p(-2, 4, 10)), Object.freeze(p(6, -8, 20))])
  const bounds = G.bounds(input)
  assert.deepEqual(bounds, { minimum: p(-2, -8, 10), maximum: p(6, 4, 20), center: p(2, -2, 15) })
  bounds.minimum.x = 99
  assert.equal(input[0].x, -2)
})

test('segment projection clamps endpoints, handles degenerate segments and uses 3D distances', () => {
  assert.deepEqual(G.closestPointOnSegment(p(3, 4), p(0, 0), p(10, 0)), { position: p(3, 0), fraction: .3, distance: 4 })
  assert.equal(G.closestPointOnSegment(p(-3, 0), p(0, 0), p(10, 0)).fraction, 0)
  assert.equal(G.closestPointOnSegment(p(20, 0), p(0, 0), p(10, 0)).fraction, 1)
  assert.equal(G.distanceToSegment(p(0, 0, 8), p(0, 0), p(0, 0)), 8)
})

test('polyline length and distance interpolation skip duplicates and clamp beyond the end', () => {
  const points = [p(0, 0), p(0, 0), p(3, 0), p(3, 4)]
  assert.equal(G.polylineLength(points), 7)
  near(G.interpolatePolyline(points, 5), p(3, 2))
  near(G.interpolatePolyline(points, 100), p(3, 4))
  near(G.interpolatePolyline(points, 0), p(0, 0))
  assert.throws(() => G.validatePolyline(points), RangeError)
  G.validatePolyline([p(0, 0), p(3, 4)])
  assert.throws(() => G.interpolatePolyline(points, -1), RangeError)
})

test('shared polygon validation accepts closure, rejects degeneracy, crossings and date-line rings', () => {
  const origin = C.fromDegrees(116, 39)
  const ring = [[0, 0], [100, 0], [100, 100], [0, 100]].map(([x, y]) => C.offset(origin, x, y))
  assert.ok(Math.abs(G.localPolygonArea(ring) - 10000) < 1e-4)
  assert.equal(G.localPolygonArea(ring), MeasureKit.area(ring))
  G.validatePolygon([...ring, ring[0]])
  for (const invalid of [[ring[0], ring[2], ring[1], ring[3]], [ring[0], ring[1], ring[1]], [ring[0], C.offset(origin, 1, 0), C.offset(origin, 2, 0)]]) assert.throws(() => G.validatePolygon(invalid), RangeError)
  assert.throws(() => G.validatePolygon(C.fromDegreesArray([{ longitude: 179.99, latitude: 0 }, { longitude: -179.99, latitude: 0 }, { longitude: 179.99, latitude: .01 }])), /Date-line/)
  assert.throws(() => G.validatePolygon([ring[0], C.offset(origin, 100001, 0), ring[2]]), /100 km/)
})

test('all array helpers reject holes and nonfinite input; numeric overflow is explicit', () => {
  for (const method of ['bounds', 'polylineLength', 'validatePolyline', 'validatePolygon']) {
    assert.throws(() => G[method](new Array(3)), TypeError)
    assert.throws(() => G[method]([p(NaN, 0), p(1, 0), p(0, 1)]), TypeError)
  }
  assert.throws(() => G.bounds([]), RangeError)
  assert.throws(() => G.polylineLength([p(-1e308, 0), p(1e308, 0)]), RangeError)
})
