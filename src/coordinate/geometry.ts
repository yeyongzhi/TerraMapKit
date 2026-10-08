import { Cartesian3 } from 'cesium'
import { finite } from '../internal/index.js'
import { localArea } from '../internal/geometry.js'

export interface CartesianBounds { minimum: Cartesian3; maximum: Cartesian3; center: Cartesian3 }
export interface SegmentProjection { position: Cartesian3; fraction: number; distance: number }

function point(p: Cartesian3): Cartesian3 {
  if (!p) throw new TypeError('point is required')
  finite(p.x, 'point.x'); finite(p.y, 'point.y'); finite(p.z, 'point.z')
  return Cartesian3.clone(p)
}
function points(input: readonly Cartesian3[], minimum: number): Cartesian3[] {
  if (!Array.isArray(input)) throw new TypeError('positions must be an array')
  if (input.length < minimum || input.length > 10000) throw new RangeError(`Expected ${minimum}–10000 positions`)
  return Array.from(input, point)
}
function checked(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Geometry exceeds finite numeric range')
  return value
}

/** Stateless Cartesian geometry; lengths are straight 3D segments, never surface distances. */
export class GeometryKit {
  static bounds(input: readonly Cartesian3[]): CartesianBounds {
    const values = points(input, 1)
    const minimum = point(values[0]!), maximum = point(values[0]!)
    for (const p of values) for (const axis of ['x', 'y', 'z'] as const) {
      minimum[axis] = Math.min(minimum[axis], p[axis]); maximum[axis] = Math.max(maximum[axis], p[axis])
    }
    const center = new Cartesian3(minimum.x / 2 + maximum.x / 2, minimum.y / 2 + maximum.y / 2, minimum.z / 2 + maximum.z / 2)
    return { minimum, maximum, center }
  }

  static closestPointOnSegment(position: Cartesian3, start: Cartesian3, end: Cartesian3): SegmentProjection {
    const p = point(position), a = point(start), b = point(end)
    const direction = Cartesian3.subtract(b, a, new Cartesian3())
    const length = checked(Cartesian3.magnitude(direction))
    let fraction = 0
    if (length > 0) {
      Cartesian3.divideByScalar(direction, length, direction)
      fraction = Math.max(0, Math.min(1, checked(Cartesian3.dot(Cartesian3.subtract(p, a, new Cartesian3()), direction)) / length))
    }
    const nearest = Cartesian3.lerp(a, b, fraction, new Cartesian3())
    return { position: nearest, fraction, distance: checked(Cartesian3.distance(p, nearest)) }
  }

  static distanceToSegment(position: Cartesian3, start: Cartesian3, end: Cartesian3): number {
    return GeometryKit.closestPointOnSegment(position, start, end).distance
  }

  static polylineLength(input: readonly Cartesian3[]): number {
    const values = points(input, 1)
    let length = 0
    for (let i = 1; i < values.length; i++) length = checked(length + Cartesian3.distance(values[i - 1]!, values[i]!))
    return length
  }

  /** Distance in metres from the first vertex; clamps to the end and skips zero-length segments. */
  static interpolatePolyline(input: readonly Cartesian3[], distance: number): Cartesian3 {
    const values = points(input, 1)
    finite(distance, 'distance', 0)
    for (let i = 1; i < values.length; i++) {
      const a = values[i - 1]!, b = values[i]!, length = checked(Cartesian3.distance(a, b))
      if (length > 0 && distance <= length) return Cartesian3.lerp(a, b, distance / length, new Cartesian3())
      distance -= length
    }
    return point(values[values.length - 1]!)
  }

  /** Validates finite input, 2–10000 vertices, consecutive duplicates and zero total length. */
  static validatePolyline(input: readonly Cartesian3[]): void {
    const values = points(input, 2)
    for (let i = 1; i < values.length; i++) {
      if (checked(Cartesian3.distance(values[i - 1]!, values[i]!)) <= 1e-6) throw new RangeError('Consecutive duplicate vertices')
    }
    GeometryKit.polylineLength(values)
  }

  /** Shared DrawKit/MeasureKit/EffectKit validator: local ENU, one ring, optional closing vertex. */
  static validatePolygon(input: readonly Cartesian3[]): void { localArea(input) }
  static localPolygonArea(input: readonly Cartesian3[]): number { return localArea(input) }
}
