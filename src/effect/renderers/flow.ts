import { Cartesian3, Entity } from 'cesium'
import type { RenderContext } from './context.js'
export function renderFlow({ phase, config, glow, width , callback }: RenderContext): Entity[] {
  const c = config(), lengths = [0]
  for (let i = 1; i < c.points.length; i++) lengths.push(lengths[i - 1]! + Cartesian3.distance(c.points[i - 1]!, c.points[i]!))
  const total = lengths.at(-1)!, buffer = Array.from({ length: c.points.length + 2 }, () => new Cartesian3()), output: Cartesian3[] = []
  const sample = (distance: number, result: Cartesian3) => {
    let i = 1; while (i < lengths.length - 1 && lengths[i]! < distance) i++
    return Cartesian3.lerp(c.points[i - 1]!, c.points[i]!, (distance - lengths[i - 1]!) / (lengths[i]! - lengths[i - 1]!), result)
  }
  return [new Entity({ polyline: { positions: callback(time => {
    const head = phase(time) * (1 + config().trailLength) * total
    const from = Math.max(0, Math.min(total, head - config().trailLength * total)), to = Math.min(total, head)
    let n = 0; sample(from, buffer[n]!); output[n] = buffer[n++]!
    for (let i = 1; i < lengths.length - 1; i++) if (lengths[i]! > from && lengths[i]! < to) { Cartesian3.clone(c.points[i]!, buffer[n]!); output[n] = buffer[n++]! }
    sample(to, buffer[n]!); output[n] = buffer[n++]!; output.length = n; return output
  }), width, material: glow, clampToGround: false } })]
}
