import { Cartesian3, Entity, Matrix4 } from 'cesium'
import type { RenderContext } from './context.js'
export function renderWave({ phase, config, material, width , callback }: RenderContext): Entity[] {
  const points = Array.from({ length: config().segments + 1 }, () => new Cartesian3()), local = new Cartesian3()
  return [new Entity({ polyline: { positions: callback(time => {
    const c = config(), angle = phase(time) * Math.PI * 2
    for (let i = 0; i < points.length; i++) {
      local.x = (i / c.segments - 0.5) * c.length; local.y = c.amplitude * Math.sin(local.x / c.wavelength * Math.PI * 2 - angle); local.z = 0
      Matrix4.multiplyByPoint(c.frame, local, points[i]!)
    }
    return points
  }), material, width, clampToGround: false } })]
}
