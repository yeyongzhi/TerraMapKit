import { Cartesian3 } from 'cesium'
import { CoordinateKit, GeometryKit } from '../coordinate/index.js'
import { clonePosition, finite } from '../internal/index.js'
export interface DrawSnapOptions { targets?: readonly Cartesian3[]; segments?: readonly (readonly [Cartesian3, Cartesian3])[]; tolerance?: number; grid?: { origin: Cartesian3; size: number } }
export function copySnap(options: DrawSnapOptions): DrawSnapOptions {
  if (!options || typeof options !== 'object') throw new TypeError('Invalid snap options')
  const tolerance = finite(options.tolerance ?? 10, 'tolerance', 0, 100000)
  if (options.targets && (!Array.isArray(options.targets) || options.targets.length > 10000) || options.segments && (!Array.isArray(options.segments) || options.segments.length > 10000)) throw new RangeError('Too many snap candidates')
  return { tolerance, ...(options.targets && { targets: Array.from(options.targets, clonePosition) }), ...(options.segments && { segments: Array.from(options.segments, segment => { if (!Array.isArray(segment) || segment.length !== 2) throw new TypeError('Expected segment endpoints'); return [clonePosition(segment[0]), clonePosition(segment[1])] as const }) }), ...(options.grid && { grid: { origin: clonePosition(options.grid.origin), size: finite(options.grid.size, 'grid.size', .001, 100000) } }) }
}
/** Nearest 3D target/segment or horizontal ENU grid point within tolerance in metres. */
export function snapPosition(position: Cartesian3, input: DrawSnapOptions): Cartesian3 {
  const point = clonePosition(position), options = copySnap(input)
  let nearest = point, distance = options.tolerance!
  const consider = (candidate: Cartesian3) => { const d = Cartesian3.distance(point, candidate); if (d <= distance) { distance = d; nearest = candidate } }
  for (const target of options.targets ?? []) consider(target)
  for (const [start, end] of options.segments ?? []) consider(GeometryKit.closestPointOnSegment(point, start, end).position)
  if (options.grid) { const local = CoordinateKit.toLocal(options.grid.origin, point); local.x = Math.round(local.x / options.grid.size) * options.grid.size; local.y = Math.round(local.y / options.grid.size) * options.grid.size; consider(CoordinateKit.fromLocal(options.grid.origin, local)) }
  return Cartesian3.clone(nearest)
}
