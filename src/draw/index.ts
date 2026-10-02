import { CallbackPositionProperty, CallbackProperty, Cartesian3, Color, Entity, PointGraphics, PolylineGraphics, PolygonGraphics, PolygonHierarchy, createGuid, type Viewer } from 'cesium'
import { CoordinateKit } from '../coordinate/index.js'
import { assertViewer, clonePosition, finite, render } from '../internal/index.js'
import { localArea } from '../internal/geometry.js'
import { PickKit, type PickPositionMode } from '../pick/index.js'

export type DrawType = 'point' | 'polyline' | 'polygon'
export interface DrawResult { readonly id: string; readonly type: DrawType; readonly entity: Entity; readonly positions: readonly Cartesian3[] }
export interface DrawOptions {
  id?: string; type: DrawType; color?: Color; width?: number
  interactive?: boolean; positionMode?: PickPositionMode; maxPoints?: number
  onFinish?: (result: DrawResult) => void
  onCancel?: () => void
  onError?: (error: unknown) => void
}
export interface DrawSession {
  readonly entity: Entity
  addPoint(position: Cartesian3): void
  undo(): boolean
  finish(): DrawResult
  cancel(): void
}
export interface DrawGeoJSON {
  type: 'Feature'
  properties: { id: string; drawType: DrawType }
  geometry: { type: 'Point' | 'LineString' | 'Polygon'; coordinates: number[] | number[][] | number[][][] }
}

export class DrawKit {
  private disposed = false
  private active: DrawSession | undefined
  private readonly results = new Map<string, DrawResult>()
  private readonly pick: PickKit
  constructor(private readonly viewer: Viewer) { this.assertActive(); this.pick = new PickKit(viewer) }
  private assertActive(): void { assertViewer(this.viewer, this.disposed, 'DrawKit') }
  start(options: DrawOptions): DrawSession {
    this.assertActive()
    if (!options || !['point', 'polyline', 'polygon'].includes(options.type)) throw new TypeError('Invalid draw type')
    options = { ...options }
    const minimum = options.type === 'point' ? 1 : options.type === 'polyline' ? 2 : 3
    const maximum = options.maxPoints ?? (options.type === 'point' ? 1 : 512)
    finite(maximum, 'maxPoints', minimum, 512)
    if (!Number.isInteger(maximum)) throw new RangeError('maxPoints must be an integer')
    if (options.type === 'point' && maximum !== 1) throw new RangeError('Point drawing accepts exactly one point')
    const id = options.id ?? createGuid(), color = Color.clone(options.color ?? Color.CYAN)
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('id must be non-empty')
    if (!color || ![color.red, color.green, color.blue, color.alpha].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw new TypeError('Invalid color')
    const width = finite(options.width ?? 3, 'width', 1, 10)
    if (this.results.has(id)) throw new Error(`Duplicate drawing id: ${id}`)
    this.active?.cancel()
    const points: Cartesian3[] = []
    let cursor: Cartesian3 | undefined, closed = false
    const subscriptions: (() => void)[] = []
    const preview = () => cursor && points.length > 0 ? [...points, cursor] : [...points]
    const entity = new Entity()
    if (options.type === 'point') {
      entity.position = new CallbackPositionProperty(() => points[0], false)
      entity.point = new PointGraphics({ pixelSize: 10, color })
    } else if (options.type === 'polyline') {
      entity.polyline = new PolylineGraphics({ positions: new CallbackProperty(preview, false), width, material: color })
    } else {
      entity.polygon = new PolygonGraphics({ hierarchy: new CallbackProperty(() => new PolygonHierarchy(preview()), false), material: color.withAlpha(color.alpha * 0.35), perPositionHeight: true })
      entity.polyline = new PolylineGraphics({ positions: new CallbackProperty(() => { const p = preview(); return p.length > 2 ? [...p, p[0]!] : p }, false), width, material: color })
    }
    this.viewer.entities.add(entity)
    try { this.assertActive(); if (!this.viewer.entities.contains(entity)) throw new Error('Drawing entity was removed during creation') }
    catch (error) { this.viewer.entities.remove(entity); throw error }
    const assertSession = () => {
      this.assertActive()
      if (closed || this.active !== session || !this.viewer.entities.contains(entity)) throw new Error('Drawing session is no longer active')
    }
    const close = () => { closed = true; for (const off of subscriptions) off(); if (this.active === session) this.active = undefined }
    const session: DrawSession = Object.freeze({
      entity,
      addPoint: (position: Cartesian3) => {
        assertSession()
        if (points.length >= maximum) throw new RangeError('maxPoints reached; undo or cancel the drawing')
        const point = clonePosition(position)
        if (points.some(p => Cartesian3.distance(p, point) < 1e-3)) throw new RangeError('Duplicate drawing point')
        points.push(point); cursor = undefined; render(this.viewer)
        if (points.length === maximum) session.finish()
      },
      undo: () => { assertSession(); const removed = points.pop() !== undefined; cursor = undefined; render(this.viewer); return removed },
      finish: () => {
        assertSession()
        if (points.length < minimum) throw new RangeError(`At least ${minimum} points are required`)
        if (options.type === 'polygon') localArea(points)
        cursor = undefined
        const positions = Object.freeze(points.map(p => Object.freeze(Cartesian3.clone(p))))
        const result: DrawResult = Object.freeze({ id, type: options.type, entity, positions })
        close(); this.results.set(id, result); render(this.viewer)
        options.onFinish?.(result)
        return result
      },
      cancel: () => {
        if (closed) return
        close(); this.viewer.entities.remove(entity); render(this.viewer); options.onCancel?.()
      }
    })
    this.active = session
    try {
      if (options.interactive !== false) {
        const safely = (action: () => void) => { try { action() } catch (error) { if (options.onError) options.onError(error); else console.error(error) } }
        subscriptions.push(this.pick.onClick(event => safely(() => {
          const point = this.pick.toWorld(event.screenPosition, options.positionMode ?? 'terrain')
          if (point) session.addPoint(point)
        })))
        subscriptions.push(this.pick.onMove(event => {
          cursor = this.pick.toWorld(event.screenPosition, options.positionMode ?? 'terrain'); render(this.viewer)
        }))
        subscriptions.push(this.pick.on('rightClick', () => safely(() => { if (points.length >= minimum) session.finish(); else session.cancel() })))
      }
      return session
    } catch (error) { session.cancel(); throw error }
  }
  remove(idOrResult: string | DrawResult): boolean {
    if (this.disposed) return false
    const id = typeof idOrResult === 'string' ? idOrResult : idOrResult.id, result = this.results.get(id)
    if (!result || typeof idOrResult !== 'string' && result !== idOrResult) return false
    this.results.delete(id); const removed = this.viewer.entities.remove(result.entity); render(this.viewer); return removed
  }
  toGeoJSON(result: DrawResult): DrawGeoJSON {
    this.assertActive()
    const points = result.positions.map(point => {
      const p = CoordinateKit.toDegrees(point); return [p.longitude, p.latitude, p.height]
    })
    const type = result.type === 'point' ? 'Point' : result.type === 'polyline' ? 'LineString' : 'Polygon'
    return { type: 'Feature', properties: { id: result.id, drawType: result.type }, geometry: {
      type, coordinates: type === 'Point' ? points[0]! : type === 'Polygon' ? [[...points, points[0]!]] : points
    } }
  }
  cancel(): void { this.active?.cancel() }
  clear(): void { this.active?.cancel(); for (const result of [...this.results.values()]) this.remove(result) }
  dispose(): void {
    if (this.disposed) return
    this.clear(); this.pick.dispose(); this.disposed = true
  }
}
