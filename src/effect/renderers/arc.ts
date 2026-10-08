import { Cartesian3, Cartographic, Ellipsoid, Entity } from 'cesium'
import type { RenderContext } from './context.js'
export function renderArc({ config, glow, width }: RenderContext): Entity[] {
  const c = config(), start = c.points[0]!, end = c.points[1]!, a = Cartographic.fromCartesian(start, Ellipsoid.WGS84), b = Cartographic.fromCartesian(end, Ellipsoid.WGS84), scratch = new Cartesian3()
  const points = Array.from({ length: c.segments + 1 }, (_, i) => {
    const t = i / c.segments; Cartesian3.lerp(start, end, t, scratch)
    const p = Cartographic.fromCartesian(scratch, Ellipsoid.WGS84)
    p.height = a.height + (b.height - a.height) * t + 4 * c.arcHeight * t * (1 - t)
    return Ellipsoid.WGS84.cartographicToCartesian(p)
  })
  return [new Entity({ polyline: { positions: points, width, material: glow, clampToGround: false } })]
}
