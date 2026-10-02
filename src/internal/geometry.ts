import { Cartesian3, Matrix4, Transforms } from 'cesium'
import { clonePosition } from './index.js'

/** Local ENU projected area, not ellipsoid/terrain surface area. */
export function localArea(input: readonly Cartesian3[]): number {
  if (!Array.isArray(input)) throw new TypeError('positions must be an array')
  const points = input.map(clonePosition)
  if (points.length > 1 && Cartesian3.equalsEpsilon(points[0]!, points[points.length - 1]!, 0, 1e-6)) points.pop()
  if (points.length < 3 || points.length > 512) throw new RangeError('A local polygon requires 3–512 vertices')
  const inverse = Matrix4.inverseTransformation(Transforms.eastNorthUpToFixedFrame(points[0]!), new Matrix4())
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
