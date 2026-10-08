import { CallbackPositionProperty, CallbackProperty, Cartesian3, Color, Entity, PointGraphics, PolylineGraphics, PolygonGraphics, PolygonHierarchy, createGuid, type Viewer } from 'cesium'
import { CoordinateKit } from '../coordinate/index.js'
import { assertViewer, clonePosition, finite, render } from '../internal/index.js'
import { PickKit, type PickPositionMode } from '../pick/index.js'

import { copyJSON, parseGeoJSON, snapshot, style, validateGeometry } from './data.js'
import { createEntity, setGeometry } from './entity.js'
import { createEditor } from './editor.js'
import type { DrawType, DrawResult, DrawOptions, DrawSession, DrawGeoJSON, DrawProperties, DrawEditOptions, DrawEditSession, GeoJSONImportOptions, DrawFeatureCollection } from './types.js'
export * from './types.js'
export { snapPosition, type DrawSnapOptions } from './snap.js'
import { snapPosition, copySnap } from './snap.js'

export class DrawKit {
  private disposed = false
  private active: DrawSession | undefined
  private activeId: string | undefined
  private editing: DrawEditSession | undefined
  private readonly snapshots = new WeakMap<DrawResult, { positions: readonly Cartesian3[] }>()
  private readonly results = new Map<string, DrawResult>()
  private readonly pick: PickKit
  constructor(private readonly viewer: Viewer) { this.assertActive(); this.pick = new PickKit(viewer) }
  private assertActive(): void { assertViewer(this.viewer, this.disposed, 'DrawKit') }
  private makeResult(id: string, type: DrawType, entity: Entity, positions: readonly Cartesian3[], properties: DrawProperties, featureId?: string | number): DrawResult {
    const state = { positions: snapshot(positions) }
    const result: DrawResult = Object.freeze({ id, type, entity, properties: copyJSON(properties, true) as DrawProperties, featureId,
      get positions() { return state.positions } })
    this.snapshots.set(result, state)
    return result
  }
  start(options: DrawOptions): DrawSession {
    this.assertActive()
    if (!options || !['point', 'polyline', 'polygon'].includes(options.type)) throw new TypeError('Invalid draw type')
    options = { ...options }
    if (options.snap) options.snap = copySnap(options.snap)
    for (const key of ['interactive'] as const) if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new TypeError(`${key} must be boolean`)
    if (options.positionMode !== undefined && !['auto', 'depth', 'terrain', 'ellipsoid'].includes(options.positionMode)) throw new TypeError('Invalid position mode')
    for (const key of ['onFinish', 'onCancel', 'onError'] as const) if (options[key] !== undefined && typeof options[key] !== 'function') throw new TypeError(`${key} must be a function`)
    const minimum = options.type === 'point' ? 1 : options.type === 'polyline' ? 2 : 3
    const maximum = options.maxPoints ?? (options.type === 'point' ? 1 : 512)
    finite(maximum, 'maxPoints', minimum, 512)
    if (!Number.isInteger(maximum)) throw new RangeError('maxPoints must be an integer')
    if (options.type === 'point' && maximum !== 1) throw new RangeError('Point drawing accepts exactly one point')
    const id = options.id ?? createGuid(), color = Color.clone(options.color ?? Color.CYAN)
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('id must be non-empty')
    if (!color || ![color.red, color.green, color.blue, color.alpha].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw new TypeError('Invalid color')
    const width = finite(options.width ?? 3, 'width', 1, 10)
    if (this.getResult(id)) throw new Error(`Duplicate drawing id: ${id}`)
    this.cancel(); this.assertActive()
    if (this.active || this.editing) throw new Error('Another session started during cancellation')
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
    const close = () => { closed = true; for (const off of subscriptions) off(); if (this.active === session) { this.active = undefined; this.activeId = undefined } }
    const session: DrawSession = Object.freeze({
      entity,
      addPoint: (position: Cartesian3) => {
        assertSession()
        if (points.length >= maximum) throw new RangeError('maxPoints reached; undo or cancel the drawing')
        const point = options.snap ? snapPosition(position, options.snap) : clonePosition(position)
        if (points.some(p => Cartesian3.distance(p, point) < 1e-3)) throw new RangeError('Duplicate drawing point')
        points.push(point); cursor = undefined; render(this.viewer)
        if (points.length === maximum) session.finish()
      },
      undo: () => { assertSession(); const removed = points.pop() !== undefined; cursor = undefined; render(this.viewer); return removed },
      finish: () => {
        assertSession()
        if (points.length < minimum) throw new RangeError(`At least ${minimum} points are required`)
        validateGeometry(options.type, points)
        cursor = undefined
        setGeometry(entity, options.type, points); assertSession()
        const result = this.makeResult(id, options.type, entity, points, { id, drawType: options.type })
        close(); this.results.set(id, result); render(this.viewer)
        options.onFinish?.(result)
        return result
      },
      cancel: () => {
        if (closed) return
        close(); this.viewer.entities.remove(entity); render(this.viewer); options.onCancel?.()
      }
    })
    this.active = session; this.activeId = id
    try {
      if (options.interactive !== false) {
        const safely = (action: () => void) => { try { action() } catch (error) { if (options.onError) options.onError(error); else console.error(error) } }
        subscriptions.push(this.pick.onClick(event => safely(() => {
          const point = this.pick.toWorld(event.screenPosition, options.positionMode ?? 'terrain')
          if (point) session.addPoint(point)
        })))
        subscriptions.push(this.pick.onMove(event => {
          cursor = this.pick.toWorld(event.screenPosition, options.positionMode ?? 'terrain'); if (cursor && options.snap) cursor = snapPosition(cursor, options.snap); render(this.viewer)
        }))
        subscriptions.push(this.pick.on('rightClick', () => safely(() => { if (points.length >= minimum) session.finish(); else session.cancel() })))
      }
      return session
    } catch (error) { session.cancel(); throw error }
  }
  remove(idOrResult: string | DrawResult): boolean {
    if (this.disposed) return false
    const id = typeof idOrResult === 'string' ? idOrResult : idOrResult?.id, result = this.results.get(id)
    if (!result || typeof idOrResult !== 'string' && result !== idOrResult) return false
    this.results.delete(id)
    let removed = false
    try { if (this.editing?.result === result) this.editing.cancel() }
    finally { removed = this.viewer.entities.remove(result.entity); render(this.viewer) }
    return removed
  }
  getResult(id: string): DrawResult | undefined {
    this.assertActive(); const result = this.results.get(id)
    if (result && !this.viewer.entities.contains(result.entity)) { this.remove(result); return undefined }
    return result
  }
  getResults(): readonly DrawResult[] {
    this.assertActive(); for (const id of [...this.results.keys()]) this.getResult(id)
    return Object.freeze([...this.results.values()])
  }
  fromGeoJSON(input: unknown, options: GeoJSONImportOptions = {}): readonly DrawResult[] {
    this.assertActive()
    if (!options || typeof options !== 'object') throw new TypeError('Import options must be an object')
    const appearance = style(options), features = parseGeoJSON(input, options)
    for (const feature of features) if (this.getResult(feature.id) || this.activeId === feature.id) throw new Error(`Duplicate drawing id: ${feature.id}`)
    const created: DrawResult[] = []
    try {
      for (const feature of features) {
        this.assertActive()
        const entity = createEntity(feature.type, feature.positions, appearance.color, appearance.width)
        const result = this.makeResult(feature.id, feature.type, entity, feature.positions, feature.properties, feature.featureId)
        created.push(result); this.results.set(result.id, result); this.viewer.entities.add(entity)
        this.assertActive()
        if (this.results.get(result.id) !== result || !this.viewer.entities.contains(entity)) throw new Error('Imported drawing was removed during creation')
      }
      this.assertActive()
      if (created.some(r => this.results.get(r.id) !== r || !this.viewer.entities.contains(r.entity))) throw new Error('Imported drawings were removed during creation')
      render(this.viewer); return Object.freeze(created)
    } catch (error) {
      for (const result of created) {
        if (this.results.get(result.id) === result) { this.results.delete(result.id); if (this.editing?.result === result) this.editing.cancel() }
        this.viewer.entities.remove(result.entity)
      }
      render(this.viewer); throw error
    }
  }
  edit(idOrResult: string | DrawResult, options: DrawEditOptions = {}): DrawEditSession {
    this.assertActive()
    const id = typeof idOrResult === 'string' ? idOrResult : idOrResult?.id, result = this.getResult(id)
    if (!result || typeof idOrResult !== 'string' && result !== idOrResult) throw new Error('Drawing is not owned by this Kit')
    if (!options || typeof options !== 'object') throw new TypeError('Edit options must be an object')
    options = { ...options }
    if (options.snap) options.snap = copySnap(options.snap)
    for (const key of ['interactive', 'preserveHeight'] as const) if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new TypeError(`${key} must be boolean`)
    if (options.positionMode !== undefined && !['auto', 'depth', 'terrain', 'ellipsoid'].includes(options.positionMode)) throw new TypeError('Invalid position mode')
    for (const key of ['onChange', 'onFinish', 'onCancel', 'onError'] as const) if (options[key] !== undefined && typeof options[key] !== 'function') throw new TypeError(`${key} must be a function`)
    this.cancel(); this.assertActive()
    if (this.active || this.editing) throw new Error('Another session started during cancellation')
    const assertOwned = () => {
      this.assertActive()
      if (this.results.get(id) !== result || !this.viewer.entities.contains(result.entity)) throw new Error('Drawing has been removed')
    }
    assertOwned()
    let session: DrawEditSession | undefined
    session = createEditor(this.viewer, result, options, assertOwned,
      positions => { assertOwned(); this.snapshots.get(result)!.positions = positions; render(this.viewer) },
      () => { if (this.editing === session) this.editing = undefined })
    this.editing = session
    return session
  }
  toGeoJSON(result: DrawResult): DrawGeoJSON {
    this.assertActive()
    if (!result || this.getResult(result.id) !== result) throw new Error('Drawing is not owned by this Kit')
    const points = result.positions.map(point => {
      const p = CoordinateKit.toDegrees(point); return [p.longitude, p.latitude, p.height]
    })
    // Canonical exterior ring is counterclockwise. Retain its first vertex.
    if (result.type === 'polygon') {
      const signedArea = points.reduce((sum, p, i) => { const next = points[(i + 1) % points.length]!; return sum + p[0]! * next[1]! - next[0]! * p[1]! }, 0)
      if (signedArea < 0) points.splice(1, points.length - 1, ...points.slice(1).reverse())
    }
    const geometry: DrawGeoJSON['geometry'] = result.type === 'point' ? { type: 'Point', coordinates: points[0]! }
      : result.type === 'polygon' ? { type: 'Polygon', coordinates: [[...points, [...points[0]!]]] } : { type: 'LineString', coordinates: points }
    return { type: 'Feature', ...(result.featureId === undefined ? {} : { id: result.featureId }), properties: copyJSON(result.properties) as DrawProperties, geometry }
  }
  toFeatureCollection(): DrawFeatureCollection { return { type: 'FeatureCollection', features: this.getResults().map(result => this.toGeoJSON(result)) } }
  cancel(): void { const active = this.active, editing = this.editing; try { active?.cancel() } finally { editing?.cancel() } }
  clear(): void { this.assertActive(); try { this.cancel() } finally { for (const result of [...this.results.values()]) this.remove(result) } }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    try { this.cancel() } finally {
      const results = [...this.results.values()]; this.results.clear()
      for (const result of results) this.viewer.entities.remove(result.entity)
      this.pick.dispose(); render(this.viewer)
    }
  }
}
