import {
  ArcType, ClassificationType, Color, createGuid, Entity, PolygonGraphics,
  PolygonHierarchy, type Viewer
} from 'cesium'
import { CoordinateKit, type DegreesPoint } from '../coordinate/index.js'

export interface MaskBounds { west: number; south: number; east: number; north: number }
export interface RegionMaskUpdateOptions {
  positions: readonly Pick<DegreesPoint, 'longitude' | 'latitude'>[]
  outerBounds?: MaskBounds
  color?: Color
}
export interface RegionMaskOptions extends RegionMaskUpdateOptions { id?: string }
export interface RegionMaskHandle {
  readonly id: string
  readonly entity: Entity
  update(options: RegionMaskUpdateOptions): void
  remove(): boolean
}

type Point = Pick<DegreesPoint, 'longitude' | 'latitude'>
const EPSILON = 1e-10

function cross(a: Point, b: Point, c: Point): number {
  return (b.longitude - a.longitude) * (c.latitude - a.latitude)
    - (b.latitude - a.latitude) * (c.longitude - a.longitude)
}
function onSegment(a: Point, b: Point, p: Point): boolean {
  return Math.abs(cross(a, b, p)) <= EPSILON
    && p.longitude >= Math.min(a.longitude, b.longitude) - EPSILON
    && p.longitude <= Math.max(a.longitude, b.longitude) + EPSILON
    && p.latitude >= Math.min(a.latitude, b.latitude) - EPSILON
    && p.latitude <= Math.max(a.latitude, b.latitude) + EPSILON
}
function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c), abD = cross(a, b, d)
  const cdA = cross(c, d, a), cdB = cross(c, d, b)
  return ((abC > EPSILON && abD < -EPSILON || abC < -EPSILON && abD > EPSILON)
    && (cdA > EPSILON && cdB < -EPSILON || cdA < -EPSILON && cdB > EPSILON))
    || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)
}

function createPolygon(options: RegionMaskUpdateOptions): PolygonGraphics {
  if (!options || !Array.isArray(options.positions)) throw new TypeError('positions must be an array')
  const points: Point[] = Array.from(options.positions, point => {
    if (!point || typeof point !== 'object') throw new TypeError('Each position must have longitude/latitude')
    CoordinateKit.fromDegrees(point.longitude, point.latitude)
    if (Math.abs(point.latitude) > 80) throw new RangeError('Masks do not support polar regions beyond ±80 degrees')
    return { longitude: point.longitude, latitude: point.latitude }
  })
  const first = points[0], last = points[points.length - 1]
  if (first && last && first.longitude === last.longitude && first.latitude === last.latitude) points.pop()
  if (points.length < 3 || points.length > 512) throw new RangeError('A mask requires 3 to 512 vertices')
  if (new Set(points.map(p => `${p.longitude},${p.latitude}`)).size !== points.length) {
    throw new RangeError('Duplicate polygon vertices are not supported')
  }
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!
    area += a.longitude * b.latitude - b.longitude * a.latitude
    const previous = points[(i + points.length - 1) % points.length]!
    if (onSegment(previous, a, b) || onSegment(a, b, previous)) {
      throw new RangeError('Overlapping adjacent edges are not supported')
    }
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || i === 0 && j === points.length - 1) continue
      if (intersects(a, b, points[j]!, points[(j + 1) % points.length]!)) {
        throw new RangeError('Self-intersecting polygons are not supported')
      }
    }
  }
  if (Math.abs(area) < EPSILON) throw new RangeError('Polygon area must be non-zero')
  const west = Math.min(...points.map(p => p.longitude)), east = Math.max(...points.map(p => p.longitude))
  const south = Math.min(...points.map(p => p.latitude)), north = Math.max(...points.map(p => p.latitude))
  const dx = Math.max((east - west) * 0.25, 0.1), dy = Math.max((north - south) * 0.25, 0.1)
  const bounds = options.outerBounds ?? { west: west - dx, east: east + dx, south: south - dy, north: north + dy }
  for (const key of ['west', 'east', 'south', 'north'] as const) {
    if (typeof bounds[key] !== 'number' || !Number.isFinite(bounds[key])) throw new TypeError(`outerBounds.${key} must be finite`)
  }
  if (bounds.west < -180 || bounds.east > 180 || bounds.south < -80 || bounds.north > 80
    || bounds.west >= west || bounds.east <= east || bounds.south >= south || bounds.north <= north
    || bounds.east - bounds.west > 120 || bounds.north - bounds.south > 120) {
    throw new RangeError('outerBounds must strictly enclose a local polygon within ±80 latitude, with spans ≤120 degrees; date-line crossing is unsupported')
  }
  const color = options.color ?? Color.BLACK.withAlpha(0.55)
  if (!(color instanceof Color) || ![color.red, color.green, color.blue, color.alpha]
    .every(v => Number.isFinite(v) && v >= 0 && v <= 1)) {
    throw new TypeError('color must be a Cesium Color with components between 0 and 1')
  }
  const outer = [
    { longitude: bounds.west, latitude: bounds.south },
    { longitude: bounds.east, latitude: bounds.south },
    { longitude: bounds.east, latitude: bounds.north },
    { longitude: bounds.west, latitude: bounds.north }
  ]
  // Rhumb arcs keep latitude-aligned bounds consistent with the planar validation.
  const hole = area > 0 ? [...points].reverse() : points
  return new PolygonGraphics({
    hierarchy: new PolygonHierarchy(CoordinateKit.fromDegreesArray(outer), [
      new PolygonHierarchy(CoordinateKit.fromDegreesArray(hole))
    ]),
    material: Color.clone(color),
    arcType: ArcType.RHUMB,
    classificationType: ClassificationType.TERRAIN
  })
}

/** Experimental local ground mask: outer rectangle with a single polygon hole. */
export class MaskKit {
  private readonly masks = new Map<string, RegionMaskHandle>()
  private disposed = false

  constructor(private readonly viewer: Viewer) {
    this.assertActive()
    if (!viewer.entities) throw new TypeError('viewer must expose entities')
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('MaskKit has been disposed')
    if (!this.viewer || typeof this.viewer.isDestroyed !== 'function') throw new TypeError('viewer must be a Cesium Viewer')
    if (this.viewer.isDestroyed()) throw new Error('Viewer has been destroyed')
  }

  addRegionMask(options: RegionMaskOptions): RegionMaskHandle {
    this.assertActive()
    if (!options || typeof options !== 'object') throw new TypeError('options are required')
    const id = options.id ?? createGuid()
    if (typeof id !== 'string' || id.trim() === '') throw new TypeError('id must be a non-empty string')
    const existing = this.masks.get(id)
    if (existing && this.viewer.entities.contains(existing.entity)) throw new Error(`Duplicate mask id: ${id}`)
    this.masks.delete(id)
    const entity = new Entity({ polygon: createPolygon(options) })
    const handle: RegionMaskHandle = Object.freeze({
      id, entity,
      update: (next: RegionMaskUpdateOptions) => {
        this.assertActive()
        if (this.masks.get(id) !== handle || !this.viewer.entities.contains(entity)) throw new Error('Mask has been removed')
        const polygon = createPolygon(next) // Validation completes before touching the existing entity.
        entity.polygon = polygon
        this.viewer.scene?.requestRender()
      },
      remove: () => this.removeRegionMask(handle)
    })
    this.masks.set(id, handle)
    try {
      this.viewer.entities.add(entity)
      this.assertActive()
      if (!this.viewer.entities.contains(entity)) throw new Error('Mask was removed during creation')
      this.viewer.scene?.requestRender()
      return handle
    } catch (error) {
      this.masks.delete(id)
      this.viewer.entities.remove(entity)
      throw error
    }
  }

  removeRegionMask(idOrHandle: string | RegionMaskHandle): boolean {
    if (this.disposed) return false
    const id = typeof idOrHandle === 'string' ? idOrHandle : idOrHandle?.id
    const handle = this.masks.get(id)
    if (!handle || typeof idOrHandle !== 'string' && idOrHandle !== handle) return false
    this.masks.delete(id)
    const removed = this.viewer.entities.remove(handle.entity)
    if (!this.viewer.isDestroyed()) this.viewer.scene?.requestRender()
    return removed
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const handle of this.masks.values()) this.viewer.entities.remove(handle.entity)
    this.masks.clear()
    if (!this.viewer.isDestroyed()) this.viewer.scene?.requestRender()
  }
}
