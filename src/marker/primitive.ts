import { BillboardCollection, PointPrimitiveCollection, Color, createGuid, type Billboard, type PointPrimitive, type Viewer } from 'cesium'
import { CoordinateKit, type DegreesPoint } from '../coordinate/index.js'
import { assertViewer, finite, render } from '../internal/index.js'
import { PickKit, type PickEvent } from '../pick/index.js'
import { copyDisplay, createMarkerDisplayOptions, type MarkerDisplayOptions } from './display.js'
export interface PrimitiveMarkerOptions {
  id?: string; position: DegreesPoint; show?: boolean; color?: Color
  pixelSize?: number; image?: string; width?: number; height?: number; scale?: number
  display?: MarkerDisplayOptions | undefined
}
export interface PrimitiveMarkerHandle {
  readonly id: string
  readonly primitive: PointPrimitive | Billboard
  patch(options: Partial<Omit<PrimitiveMarkerOptions, 'id'>>): void
  setPosition(position: DegreesPoint): void
  setVisible(show: boolean): void
  remove(): boolean
}
export interface PrimitiveMarkerPatch { id: string; patch: Partial<Omit<PrimitiveMarkerOptions, 'id'>> }
export interface PrimitiveMarkerClickEvent extends PickEvent { marker: PrimitiveMarkerHandle }
type State = { handle: PrimitiveMarkerHandle; options: PrimitiveMarkerOptions }
/** One native collection per instance. Owns only that collection and lazy canvas picking. */
export class PrimitiveMarkerKit {
  private readonly collection: PointPrimitiveCollection | BillboardCollection
  private readonly states = new Map<string, State>()
  private readonly picks: PickKit
  private disposed = false
  constructor(private readonly viewer: Viewer, readonly kind: 'point' | 'billboard' = 'point') {
    assertViewer(viewer, false, 'PrimitiveMarkerKit')
    if (!['point', 'billboard'].includes(kind)) throw new TypeError('kind must be point or billboard')
    this.collection = kind === 'point' ? new PointPrimitiveCollection() : new BillboardCollection()
    this.picks = new PickKit(viewer)
    try { viewer.scene.primitives.add(this.collection); this.active() }
    catch (error) { viewer.scene.primitives.remove(this.collection); if (!this.collection.isDestroyed()) this.collection.destroy(); throw error }
  }
  private active(): void {
    assertViewer(this.viewer, this.disposed, 'PrimitiveMarkerKit')
    if (this.collection.isDestroyed() || !this.viewer.scene.primitives.contains(this.collection)) throw new Error('Primitive collection is no longer active')
  }
  private prepare(input: PrimitiveMarkerOptions): PrimitiveMarkerOptions {
    if (!input || !input.position) throw new TypeError('position is required')
    if (input.id !== undefined && (typeof input.id !== 'string' || !input.id.trim())) throw new TypeError('id must be non-empty')
    if (input.show !== undefined && typeof input.show !== 'boolean') throw new TypeError('show must be boolean')
    CoordinateKit.fromDegrees(input.position.longitude, input.position.latitude, input.position.height)
    const color = input.color ?? (this.kind === 'point' ? Color.CYAN : Color.WHITE)
    if (!(color instanceof Color)) throw new TypeError('color must be a Cesium Color')
    for (const c of ['red', 'green', 'blue', 'alpha'] as const) finite(color[c], `color.${c}`, 0, 1)
    if (this.kind === 'billboard' && (typeof input.image !== 'string' || !input.image.trim())) throw new TypeError('billboard image is required')
    if (this.kind === 'point' && input.image !== undefined) throw new TypeError('point collection does not accept images')
    return { ...input, position: { ...input.position }, color: Color.clone(color), show: input.show ?? true,
      pixelSize: finite(input.pixelSize ?? 5, 'pixelSize', 1, 256), width: finite(input.width ?? 32, 'width', 1, 2048),
      height: finite(input.height ?? 32, 'height', 1, 2048), scale: finite(input.scale ?? 1, 'scale', .01, 100), display: copyDisplay(input.display) }
  }
  private native(o: PrimitiveMarkerOptions) {
    return { position: CoordinateKit.fromDegrees(o.position.longitude, o.position.latitude, o.position.height), show: o.show, color: o.color,
      distanceDisplayCondition: undefined, scaleByDistance: undefined, translucencyByDistance: undefined,
      ...createMarkerDisplayOptions(o.display), ...(this.kind === 'point' ? { pixelSize: o.pixelSize } : { image: o.image, width: o.width, height: o.height, scale: o.scale }) }
  }
  private state(id: string): State {
    const s = this.states.get(id)
    if (!s || !this.collection.contains(s.handle.primitive as never)) throw new Error('Marker is no longer active')
    return s
  }
  private array(input: readonly unknown[]): void {
    this.active()
    if (!Array.isArray(input)) throw new TypeError('batch must be an array')
    if (input.length > 50000) throw new RangeError('batch limit is 50000')
  }
  get size(): number { this.active(); return [...this.states.values()].filter(s => this.collection.contains(s.handle.primitive as never)).length }
  addMarker(options: PrimitiveMarkerOptions): PrimitiveMarkerHandle { return this.addMarkers([options])[0]! }
  addMarkers(input: readonly PrimitiveMarkerOptions[]): readonly PrimitiveMarkerHandle[] {
    this.array(input)
    const ids = new Set<string>()
    const prepared = Array.from(input, item => {
      const o = this.prepare(item), id = o.id ?? createGuid(), previous = this.states.get(id)
      if (ids.has(id) || previous && this.collection.contains(previous.handle.primitive as never)) throw new Error(`Duplicate marker id: ${id}`)
      ids.add(id); return { ...o, id }
    })
    const handles: PrimitiveMarkerHandle[] = []
    try {
      for (const o of prepared) {
        const primitive = this.collection.add(this.native(o) as never)
        const handle: PrimitiveMarkerHandle = Object.freeze({ id: o.id, primitive,
          patch: (patch: Partial<Omit<PrimitiveMarkerOptions, 'id'>>) => { this.active(); if (this.state(o.id).handle !== handle) throw new Error('Stale marker handle'); this.patchMarkers([{ id: o.id, patch }]) },
          setPosition: (position: DegreesPoint) => handle.patch({ position }), setVisible: (show: boolean) => handle.patch({ show }),
          remove: () => { if (this.states.get(o.id)?.handle !== handle) return false; return this.removeMarkers([o.id]) > 0 } })
        primitive.id = handle
        this.states.set(o.id, { handle, options: o }); handles.push(handle)
      }
    } catch (error) {
      const errors: unknown[] = [error]
      for (const h of handles) {
        try { if (!this.collection.isDestroyed()) this.collection.remove(h.primitive as never) } catch (cleanupError) { errors.push(cleanupError) }
        finally { this.states.delete(h.id) }
      }
      render(this.viewer)
      if (errors.length > 1) throw new AggregateError(errors, 'Primitive batch creation and cleanup failed')
      throw error
    }
    if (handles.length) render(this.viewer)
    return Object.freeze(handles)
  }
  patchMarkers(input: readonly PrimitiveMarkerPatch[]): void {
    this.array(input)
    const ids = new Set<string>()
    const changes = Array.from(input, item => {
      if (!item || typeof item.id !== 'string' || !item.patch || typeof item.patch !== 'object' || Array.isArray(item.patch) || 'id' in item.patch) throw new TypeError('Invalid marker patch')
      if (ids.has(item.id)) throw new Error('Duplicate patch id'); ids.add(item.id)
      const state = this.state(item.id)
      return { state, previous: state.options, next: this.prepare({ ...state.options, ...item.patch }) }
    })
    const applied: typeof changes = []
    try { for (const c of changes) { applied.push(c); Object.assign(c.state.handle.primitive, this.native(c.next)); c.state.options = c.next } }
    catch (error) {
      const errors: unknown[] = [error]
      for (const c of applied.reverse()) {
        if (this.disposed || this.collection.isDestroyed() || this.states.get(c.state.handle.id) !== c.state || !this.collection.contains(c.state.handle.primitive as never)) continue
        try { Object.assign(c.state.handle.primitive, this.native(c.previous)); c.state.options = c.previous } catch (restoreError) { errors.push(restoreError) }
      }
      render(this.viewer)
      if (errors.length > 1) throw new AggregateError(errors, 'Primitive update and restoration failed')
      throw error
    }
    if (changes.length) render(this.viewer)
  }
  removeMarkers(input: readonly string[]): number {
    this.array(input)
    const ids = Array.from(input, id => { if (typeof id !== 'string' || !id.trim()) throw new TypeError('id must be non-empty'); return id })
    let removed = 0
    for (const id of new Set(ids)) {
      const s = this.states.get(id)
      if (s) { if (this.collection.remove(s.handle.primitive as never)) removed++; this.states.delete(id) }
    }
    if (removed) render(this.viewer)
    return removed
  }
  pick(screenPosition: Parameters<PickKit['pick']>[0]): PrimitiveMarkerHandle | undefined { this.active(); return this.picked(this.picks.pick(screenPosition)) }
  private picked(value: unknown): PrimitiveMarkerHandle | undefined {
    if (this.disposed || this.collection.isDestroyed() || !this.viewer.scene.primitives.contains(this.collection) || !this.collection.show) return undefined
    const p = value as { id?: PrimitiveMarkerHandle; primitive?: { id?: PrimitiveMarkerHandle } } | undefined
    const h = p?.id ?? p?.primitive?.id, s = h && this.states.get(h.id)
    return s?.handle === h && h?.primitive.show && this.collection.contains(h.primitive as never) ? h : undefined
  }
  onClick(callback: (event: PrimitiveMarkerClickEvent) => void): () => void {
    this.active(); if (typeof callback !== 'function') throw new TypeError('callback must be a function')
    return this.picks.onClick(event => { const marker = this.picked(event.picked); if (marker) callback({ ...event, marker }) })
  }
  setVisible(show: boolean): void { this.active(); if (typeof show !== 'boolean') throw new TypeError('show must be boolean'); this.collection.show = show; render(this.viewer) }
  clear(): void { this.active(); this.collection.removeAll(); this.states.clear(); render(this.viewer) }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true; this.picks.dispose(); this.states.clear()
    try { if (!this.viewer.isDestroyed()) this.viewer.scene.primitives.remove(this.collection) }
    finally { if (!this.collection.isDestroyed()) this.collection.destroy(); render(this.viewer) }
  }
}
