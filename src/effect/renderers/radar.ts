import { Cartesian3, Entity, Matrix4, PolygonHierarchy } from 'cesium'
import type { RenderContext } from './context.js'
export function renderRadar({ phase, config, material , callback }: RenderContext): Entity[] {
  const points = Array.from({ length: config().segments + 2 }, () => new Cartesian3()), hierarchy = new PolygonHierarchy(points), local = new Cartesian3()
  return [new Entity({ polygon: { hierarchy: callback(time => {
    const c = config(), heading = (c.heading + 360 * phase(time)) * Math.PI / 180
    Cartesian3.clone(c.position, points[0]!)
    for (let i = 0; i <= c.segments; i++) {
      const angle = heading + (i / c.segments - 0.5) * c.angle * Math.PI / 180
      local.x = c.radius * Math.sin(angle); local.y = c.radius * Math.cos(angle); local.z = 0
      Matrix4.multiplyByPoint(c.frame, local, points[i + 1]!)
    }
    return hierarchy
  }), perPositionHeight: true, material } })]
}
