import { Cartesian3, Cartographic, Ellipsoid, Matrix4, Transforms } from 'cesium'
import { clonePosition } from './index.js'

/** Local ENU projected area, not ellipsoid/terrain surface area. */
export function localArea(input: readonly Cartesian3[]): number {
  if (!Array.isArray(input)) throw new TypeError('positions must be an array')
  const points = Array.from(input, clonePosition)
  if (points.length > 1 && Cartesian3.equalsEpsilon(points[0]!, points[points.length - 1]!, 0, 1e-6)) points.pop()
  if (points.length < 3 || points.length > 512) throw new RangeError('A local polygon requires 3–512 vertices')
  const longitudes = points.map(point => Cartographic.fromCartesian(point, Ellipsoid.WGS84)?.longitude)
  if (longitudes.some(value => value === undefined)) throw new RangeError('Polygon positions require valid WGS84 coordinates')
  for (let i = 0; i < longitudes.length; i++) {
    if (Math.abs(longitudes[i]! - longitudes[(i + 1) % longitudes.length]!) > Math.PI) throw new RangeError('Date-line crossing polygons are unsupported')
  }
  const inverse = Matrix4.inverseTransformation(Transforms.eastNorthUpToFixedFrame(points[0]!, Ellipsoid.WGS84), new Matrix4())
  const xy = points.map(point => {
    if (Cartesian3.distance(point, points[0]!) > 100000) throw new RangeError('Local area supports vertices within 100 km of the first point')
    return Matrix4.multiplyByPoint(inverse, point, new Cartesian3())
  })
  const cross = (a: Cartesian3, b: Cartesian3, c: Cartesian3) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const on = (a: Cartesian3, b: Cartesian3, p: Cartesian3) => Math.abs(cross(a, b, p)) < 1e-6
    && p.x >= Math.min(a.x, b.x) - 1e-6 && p.x <= Math.max(a.x, b.x) + 1e-6
    && p.y >= Math.min(a.y, b.y) - 1e-6 && p.y <= Math.max(a.y, b.y) + 1e-6
  let area = 0
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i]!, b = xy[(i + 1) % xy.length]!, prev = xy[(i + xy.length - 1) % xy.length]!
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6 || on(prev, a, b) || on(a, b, prev)) throw new RangeError('Repeated or overlapping polygon vertices')
    area += a.x * b.y - b.x * a.y
    for (let j = i + 2; j < xy.length; j++) {
      if (i === 0 && j === xy.length - 1) continue
      const c = xy[j]!, d = xy[(j + 1) % xy.length]!
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
        || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)) throw new RangeError('Self-intersecting polygon')
    }
  }
  if (Math.abs(area) < 1e-6) throw new RangeError('Polygon area must be non-zero')
  return Math.abs(area) / 2
}

/** One local ENU projection for an outer ring and strictly contained, disjoint holes. */
export function localAreaWithHoles(outer: readonly Cartesian3[], holes: readonly (readonly Cartesian3[])[]): number {
  if (!Array.isArray(holes) || holes.length > 128) throw new TypeError('holes must be an array of rings')
  localArea(outer)
  const origin = clonePosition(outer[0]!), inverse = Matrix4.inverseTransformation(Transforms.eastNorthUpToFixedFrame(origin, Ellipsoid.WGS84), new Matrix4())
  let count = 0
  const rings = [outer, ...holes].map(input => {
    localArea(input); const positions = Array.from(input, clonePosition)
    if (Cartesian3.equalsEpsilon(positions[0]!, positions.at(-1)!, 0, 1e-6)) positions.pop()
    count += positions.length; if (count > 512) throw new RangeError('Polygon with holes supports at most 512 total vertices')
    return positions.map(p => { if (Cartesian3.distance(p, origin) > 100000) throw new RangeError('Polygon with holes supports 100 km local regions'); return Matrix4.multiplyByPoint(inverse, p, new Cartesian3()) })
  })
  const cross = (a: Cartesian3, b: Cartesian3, c: Cartesian3) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const on = (a: Cartesian3, b: Cartesian3, p: Cartesian3) => Math.abs(cross(a, b, p)) <= 1e-6 && p.x >= Math.min(a.x, b.x) - 1e-6 && p.x <= Math.max(a.x, b.x) + 1e-6 && p.y >= Math.min(a.y, b.y) - 1e-6 && p.y <= Math.max(a.y, b.y) + 1e-6
  const intersects = (a: Cartesian3, b: Cartesian3, c: Cartesian3, d: Cartesian3) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0 || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)
  const contains = (ring: Cartesian3[], p: Cartesian3) => {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i]!, b = ring[j]!; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside }
    return inside
  }
  for (let r = 0; r < rings.length; r++) for (let s = r; s < rings.length; s++) {
    const a = rings[r]!, b = rings[s]!
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
      if (r === s && (i === j || (i + 1) % a.length === j || (j + 1) % a.length === i)) continue
      if (intersects(a[i]!, a[(i + 1) % a.length]!, b[j]!, b[(j + 1) % b.length]!)) throw new RangeError('Polygon rings intersect or touch')
    }
    if (s > 0 && r === 0 && !contains(a, b[0]!)) throw new RangeError('Hole must lie inside outer ring')
    if (s > r && r > 0 && (contains(a, b[0]!) || contains(b, a[0]!))) throw new RangeError('Nested holes are unsupported')
  }
  const area = (ring: Cartesian3[]) => Math.abs(ring.reduce((sum, a, i) => { const b = ring[(i + 1) % ring.length]!; return sum + a.x * b.y - b.x * a.y }, 0)) / 2
  const result = area(rings[0]!) - rings.slice(1).reduce((sum, ring) => sum + area(ring), 0)
  if (!Number.isFinite(result) || result <= 1e-6) throw new RangeError('Polygon area must be positive')
  return result
}
