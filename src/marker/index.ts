import { BillboardGraphics, Cartesian2, Color, Entity, LabelGraphics, PointGraphics, HorizontalOrigin, VerticalOrigin, createGuid, type Viewer } from 'cesium'
import { CoordinateKit, type DegreesPoint } from '../coordinate/index.js'
import { assertViewer, finite, render } from '../internal/index.js'
import { PickKit, type PickEvent } from '../pick/index.js'
import { metadata, optionsSnapshot, serialize, deserialize, type MarkerData, type MarkerProperties } from './data.js'

import { createMarkerEditor, type MarkerEditOptions, type MarkerEditSession } from './editor.js'
import { createMarkerDisplayOptions, type MarkerDisplayOptions } from './display.js'
export { createMarkerDisplayOptions, type MarkerDisplayOptions, type MarkerNativeDisplayOptions, type DistanceRange, type DistanceScalar } from './display.js'
export * from './primitive.js'
export type { MarkerData, MarkerProperties } from './data.js'
export type { MarkerEditOptions, MarkerEditSession } from './editor.js'


export interface MarkerPointStyle { pixelSize?: number; color?: Color; outlineColor?: Color; outlineWidth?: number }
export interface MarkerImageStyle { image: string; width?: number; height?: number; scale?: number; color?: Color }
export interface MarkerLabelStyle { text: string; font?: string; fillColor?: Color; pixelOffset?: Cartesian2 }
export interface MarkerClickEvent extends PickEvent { id: string; entity: Entity; marker: MarkerHandle }
export interface MarkerHoverEvent extends MarkerClickEvent { phase: 'enter' | 'leave' }
export interface MarkerOptions {
  display?: MarkerDisplayOptions | undefined
  id?: string
  position: DegreesPoint
  point?: MarkerPointStyle
  image?: MarkerImageStyle
  label?: MarkerLabelStyle
  show?: boolean
  onClick?: (event: MarkerClickEvent) => void
  onHover?: (event: MarkerHoverEvent) => void
  properties?: MarkerProperties
}
export interface MarkerHandle {
  readonly id: string
  readonly entity: Entity
  readonly position: DegreesPoint
  readonly properties: MarkerProperties
  /** Replace position, styles and callback, retaining the ID and Entity. */
  update(options: Omit<MarkerOptions, 'id'>): void
  patch(options: Partial<Omit<MarkerOptions, 'id'>>): void
  setPosition(position: DegreesPoint): void
  setVisible(show: boolean): void
  remove(): boolean
}
export interface MarkerPatch { id: string; patch: Partial<Omit<MarkerOptions, 'id'>> }
interface State { entity: Entity; handle: MarkerHandle; onClick: MarkerOptions['onClick']; options: MarkerOptions }

function color(value: Color | undefined, fallback: Color): Color {
  const result = value ?? fallback
  if (!(result instanceof Color)) throw new TypeError('color must be a Cesium Color')
  for (const component of ['red', 'green', 'blue', 'alpha'] as const) finite(result[component], `color.${component}`, 0, 1)
  return Color.clone(result)
}
function prepare(options: Omit<MarkerOptions, 'id'>, id?: string): Entity {
  if (!options || !options.position) throw new TypeError('position is required')
  if (!options.point && !options.image && !options.label) throw new TypeError('at least one point, image or label style is required')
  if (options.show !== undefined && typeof options.show !== 'boolean') throw new TypeError('show must be boolean')
  if (options.onClick !== undefined && typeof options.onClick !== 'function') throw new TypeError('onClick must be a function')
  if (options.onHover !== undefined && typeof options.onHover !== 'function') throw new TypeError('onHover must be a function')
  if ('status' in options) throw new TypeError('MarkerKit does not define device status; use explicit style updates')
  metadata(options.properties ?? null)
  const position = CoordinateKit.fromDegrees(options.position.longitude, options.position.latitude, options.position.height ?? 0)
  const entity = new Entity({ position, show: options.show ?? true, ...(id === undefined ? {} : { id }) })
  if (options.point) {
    const style = options.point
    entity.point = new PointGraphics({ pixelSize: finite(style.pixelSize ?? 12, 'pixelSize', 1, 256), color: color(style.color, Color.CYAN), outlineColor: color(style.outlineColor, Color.WHITE), outlineWidth: finite(style.outlineWidth ?? 1, 'outlineWidth', 0, 32) })
  }
  if (options.image) {
    const style = options.image
    if (typeof style.image !== 'string' || !style.image.trim()) throw new TypeError('image must be a non-empty URL or data URI')
    entity.billboard = new BillboardGraphics({ image: style.image, width: finite(style.width ?? 32, 'width', 1, 2048), height: finite(style.height ?? 40, 'height', 1, 2048), scale: finite(style.scale ?? 1, 'scale', 0.01, 100), color: color(style.color, Color.WHITE), verticalOrigin: VerticalOrigin.BOTTOM })
  }
  if (options.label) {
    const style = options.label
    if (typeof style.text !== 'string') throw new TypeError('text must be a string')
    if (style.font !== undefined && (typeof style.font !== 'string' || !style.font.trim())) throw new TypeError('font must be a non-empty string')
    const offset = style.pixelOffset ?? new Cartesian2(0, options.image ? -(options.image.height ?? 40) * (options.image.scale ?? 1) - 8 : -24)
    finite(offset.x, 'pixelOffset.x'); finite(offset.y, 'pixelOffset.y')
    entity.label = new LabelGraphics({ text: style.text, font: style.font ?? '14px sans-serif', fillColor: color(style.fillColor, Color.WHITE), pixelOffset: Cartesian2.clone(offset), horizontalOrigin: HorizontalOrigin.CENTER, verticalOrigin: VerticalOrigin.BOTTOM })
  }
  const display = createMarkerDisplayOptions(options.display)
  for (const graphics of [entity.point, entity.billboard, entity.label]) if (graphics) Object.assign(graphics, display)
  return entity
}

/** Owns Entity markers and a lazy, canvas-scoped picking subscription. */
export class MarkerKit {
  private disposed = false
  private readonly states = new Map<string, State>()
  private readonly listeners = new Set<(event: MarkerClickEvent) => void>()
  private readonly picks: PickKit
  private offPick: (() => void) | undefined
  private offMove: (() => void) | undefined
  private readonly hoverListeners = new Set<(event: MarkerHoverEvent) => void>()
  private hovered: State | undefined
  private editor: MarkerEditSession | undefined
  private batchDepth = 0
  private pickingDirty = false
  private renderDirty = false
  constructor(private readonly viewer: Viewer) { this.assertActive(); this.picks = new PickKit(viewer) }
  private assertActive(): void { assertViewer(this.viewer, this.disposed, 'MarkerKit') }
  private pickedState(event: PickEvent): State | undefined {
    const identity = (picked: unknown) => { const p = picked as { id?: unknown; primitive?: { id?: unknown } } | undefined; return p?.id ?? p?.primitive?.id }
    const owned = (entity: unknown) => [...this.states.values()].find(state => state.entity === entity && state.entity.show && this.viewer.entities.contains(state.entity))
    const direct = owned(identity(event.picked))
    if (direct) return direct
    // Overlapping geometry can cover an owned marker.
    for (const picked of this.viewer.scene.drillPick?.(event.screenPosition) ?? []) { const state = owned(identity(picked)); if (state) return state }
    return undefined
  }
  private syncPicking(): void {
    if (this.batchDepth) { this.pickingDirty = true; return }
    const needed = this.listeners.size > 0 || [...this.states.values()].some(state => state.onClick)
    if (needed && !this.offPick) this.offPick = this.picks.onClick(event => {
      const state = this.pickedState(event)
      if (!state || !state.entity.show || !this.viewer.entities.contains(state.entity)) { return }
      const click: MarkerClickEvent = { ...event, id: state.handle.id, entity: state.entity, marker: state.handle }
      if (this.disposed || this.states.get(click.id) !== state) return
      state.onClick?.(click)
      for (const callback of [...this.listeners]) { if (this.disposed || this.states.get(click.id) !== state) break; callback(click) }
    })
    if (!needed && this.offPick) { this.offPick(); this.offPick = undefined }
    const moveNeeded = this.hoverListeners.size > 0 || [...this.states.values()].some(state => state.options.onHover)
    if (moveNeeded && !this.offMove) this.offMove = this.picks.onMove(event => {
      const next = this.pickedState(event)
      if (next === this.hovered) return
      const previous = this.hovered; this.hovered = next
      if (previous) this.emitHover(previous, 'leave', event)
      if (next && !this.disposed && this.hovered === next && this.states.get(next.handle.id) === next) this.emitHover(next, 'enter', event)
    })
    if (!moveNeeded && this.offMove) { this.offMove(); this.offMove = undefined; this.hovered = undefined }
  }
  private requestRender(): void {
    if (this.batchDepth) this.renderDirty = true
    else render(this.viewer)
  }
  private batch<T>(operation: () => T): T {
    const entities = this.viewer.isDestroyed() ? undefined : this.viewer.entities
    this.batchDepth++; entities?.suspendEvents()
    try { return operation() }
    finally {
      this.batchDepth--
      try { entities?.resumeEvents() }
      finally {
        if (!this.batchDepth) {
          const picking = this.pickingDirty, redraw = this.renderDirty
          this.pickingDirty = false; this.renderDirty = false
          if (!this.disposed) { if (picking) this.syncPicking(); if (redraw) this.requestRender() }
        }
      }
    }
  }
  private validateBatch(items: readonly unknown[]): void {
    this.assertActive()
    if (!Array.isArray(items)) throw new TypeError('batch must be an array')
    if (items.length > 10000) throw new RangeError('batch supports at most 10000 items')
  }
  addMarkers(items: readonly MarkerOptions[]): readonly MarkerHandle[] {
    this.validateBatch(items)
    const ids = new Set<string>()
    const prepared = Array.from(items, item => {
      if (!item || typeof item !== 'object') throw new TypeError('marker options are required')
      const id = item.id ?? createGuid()
      prepare(item, id)
      if (typeof id !== 'string' || !id.trim()) throw new TypeError('id must be a non-empty string')
      const existing = this.states.get(id)
      if (ids.has(id) || existing && this.viewer.entities.contains(existing.entity) || this.viewer.entities.getById(id)) throw new Error(`Duplicate marker id: ${id}`)
      ids.add(id); return optionsSnapshot({ ...item, id })
    })
    const created: MarkerHandle[] = []
    try {
      this.batch(() => { for (const item of prepared) created.push(this.addMarker(item)) })
      this.assertActive()
      if (created.some(handle => this.states.get(handle.id)?.handle !== handle || !this.viewer.entities.contains(handle.entity))) throw new Error('Marker was removed during batch creation')
      return Object.freeze(created)
    } catch (error) {
      const failures: unknown[] = []
      this.batch(() => { for (const handle of created) try { handle.remove() } catch (cause) { failures.push(cause) } })
      if (failures.length) throw new AggregateError([error, ...failures], 'Marker batch creation and cleanup failed')
      throw error
    }
  }
  patchMarkers(items: readonly MarkerPatch[]): void {
    this.validateBatch(items)
    const ids = new Set<string>()
    const changes = Array.from(items, item => {
      if (!item || typeof item.id !== 'string' || !item.id.trim()) throw new TypeError('patch id is required')
      if (ids.has(item.id)) throw new Error(`Duplicate marker id: ${item.id}`)
      ids.add(item.id)
      const state = this.states.get(item.id)
      if (!state || !this.viewer.entities.contains(state.entity)) throw new Error('Marker is no longer active')
      if (!item.patch || typeof item.patch !== 'object' || 'id' in item.patch) throw new TypeError('patch cannot change the marker id')
      const next = { ...state.options, ...item.patch }; prepare(next)
      return { state, previous: state.options, next: optionsSnapshot(next) }
    })
    this.batch(() => {
      try { for (const change of changes) this.updateMarker(change.state.handle.id, change.next) }
      catch (error) {
        const failures: unknown[] = []
        for (const { state, previous } of changes) {
          if (state.options === previous) continue
          if (this.disposed || this.viewer.isDestroyed() || this.states.get(state.handle.id) !== state || !this.viewer.entities.contains(state.entity)) continue
          try { this.updateMarker(state.handle.id, previous) } catch (cause) { failures.push(cause) }
        }
        if (failures.length) throw new AggregateError([error, ...failures], 'Marker patch and rollback failed')
        throw error
      }
    })
    this.assertActive()
    if (changes.some(({ state }) => this.states.get(state.handle.id) !== state || !this.viewer.entities.contains(state.entity))) throw new Error('Marker was removed during batch update')
  }
  removeMarkers(ids: readonly string[]): number {
    this.validateBatch(ids)
    const unique = new Set<string>()
    for (const id of ids) { if (typeof id !== 'string' || !id.trim()) throw new TypeError('id must be a non-empty string'); unique.add(id) }
    let removed = 0
    this.batch(() => {
      const failures: unknown[] = []
      for (const id of unique) try { if (this.removeMarker(id)) removed++ } catch (error) { failures.push(error) }
      if (failures.length) throw new AggregateError(failures, 'Marker removal callbacks failed')
    })
    return removed
  }
  private emitHover(state: State, phase: 'enter' | 'leave', event: PickEvent): void {
    const hover: MarkerHoverEvent = { ...event, id: state.handle.id, entity: state.entity, marker: state.handle, phase }
    state.options.onHover?.(hover)
    for (const callback of [...this.hoverListeners]) { if (this.disposed || phase === 'enter' && this.states.get(state.handle.id) !== state) break; callback(hover) }
  }
  addMarker(options: MarkerOptions): MarkerHandle {
    this.assertActive()
    if (!options || typeof options !== 'object') throw new TypeError('options are required')
    const id = options.id ?? createGuid()
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('id must be a non-empty string')
    const prepared = prepare(options, id)
    options = optionsSnapshot(options)
    this.getMarker(id)
    if (this.states.has(id)) throw new Error(`Duplicate marker id: ${id}`)
    if (this.viewer.entities.getById(id)) throw new Error(`Entity id already exists in Viewer: ${id}`)
    const entity = prepared
    let state: State
    const assertOwned = () => { this.assertActive(); if (this.states.get(id)?.entity !== entity || !this.viewer.entities.contains(entity)) throw new Error('Marker is no longer active') }
    const handle: MarkerHandle = {
      id, entity,
      get position() { return state.options.position },
      get properties() { return state.options.properties ?? null },
      update: next => { assertOwned(); this.updateMarker(id, next) },
      setVisible: show => { assertOwned(); this.setVisible(id, show) },
      patch: next => { assertOwned(); this.patchMarker(id, next) },
      setPosition: position => { assertOwned(); this.patchMarker(id, { position }) },
      remove: () => this.removeOwned(id, entity)
    }
    state = { entity, handle: Object.freeze(handle), onClick: options.onClick, options }
    this.states.set(id, state)
    try {
      this.viewer.entities.add(entity)
      this.assertActive()
      if (!this.viewer.entities.contains(entity) || this.states.get(id)?.entity !== entity) throw new Error('Marker was removed during creation')
      this.syncPicking(); this.requestRender()
      return handle
    } catch (error) { this.removeOwned(id, entity); if (this.viewer.entities.contains(entity)) this.viewer.entities.remove(entity); throw error }
  }
  getMarker(id: string): MarkerHandle | undefined {
    this.assertActive()
    const state = this.states.get(id)
    if (state && !this.viewer.entities.contains(state.entity)) { this.removeOwned(id, state.entity); return undefined }
    return state?.handle
  }
  updateMarker(id: string, options: Omit<MarkerOptions, 'id'>): void {
    this.assertActive()
    const state = this.states.get(id)
    if (!state || !this.viewer.entities.contains(state.entity)) throw new Error('Marker is no longer active')
    const prepared = prepare(options)
    const nextOptions = optionsSnapshot({ ...options, id })
    if (this.editor?.marker === state.handle) this.editor.cancel()
    this.assertActive()
    if (this.editor?.marker === state.handle) throw new Error('Another editor started during cancellation')
    if (this.states.get(id) !== state || !this.viewer.entities.contains(state.entity)) throw new Error('Marker was removed during cancellation')
    const previousCallback = state.onClick
    const previousOptions = state.options
    state.onClick = options.onClick
    state.options = nextOptions
    try { this.syncPicking() } catch (error) { state.onClick = previousCallback; state.options = previousOptions; throw error }
    const entity = state.entity
    this.viewer.entities.suspendEvents()
    try { entity.position = prepared.position; entity.point = prepared.point; entity.billboard = prepared.billboard; entity.label = prepared.label; entity.show = prepared.show }
    finally { this.viewer.entities.resumeEvents() }
    this.assertActive()
    if (this.states.get(id) !== state || !this.viewer.entities.contains(entity)) throw new Error('Marker was removed during update')
    this.requestRender()
  }
  setVisible(id: string, show: boolean): void {
    this.assertActive()
    if (typeof show !== 'boolean') throw new TypeError('show must be boolean')
    const handle = this.getMarker(id)
    if (!handle) throw new Error('Marker is no longer active')
    this.states.get(id)!.options = { ...this.states.get(id)!.options, show }
    handle.entity.show = show; this.requestRender()
    if (!show && this.editor?.marker === handle) this.editor.cancel()
  }
  onClick(callback: (event: MarkerClickEvent) => void): () => void {
    this.assertActive()
    if (typeof callback !== 'function') throw new TypeError('callback must be a function')
    const listener = (event: MarkerClickEvent) => callback(event)
    this.listeners.add(listener)
    try { this.syncPicking() } catch (error) { this.listeners.delete(listener); throw error }
    return () => { this.listeners.delete(listener); if (!this.disposed) this.syncPicking() }
  }
  patchMarker(id: string, patch: Partial<Omit<MarkerOptions, 'id'>>): void {
    this.assertActive(); const state = this.states.get(id)
    if (!state || !this.viewer.entities.contains(state.entity)) throw new Error('Marker is no longer active')
    if (!patch || typeof patch !== 'object' || 'id' in patch) throw new TypeError('patch cannot change the marker id')
    this.updateMarker(id, { ...state.options, ...patch })
  }
  getMarkers(): readonly MarkerHandle[] {
    this.assertActive(); for (const id of [...this.states.keys()]) this.getMarker(id)
    return Object.freeze([...this.states.values()].map(state => state.handle))
  }
  toJSON(): MarkerData[] { return this.getMarkers().map(handle => serialize(handle.id, this.states.get(handle.id)!.options)) }
  fromJSON(data: unknown): readonly MarkerHandle[] {
    this.assertActive()
    if (!Array.isArray(data) || data.length > 10000) throw new RangeError('Marker JSON must be an array of at most 10000 records')
    return this.addMarkers(Array.from(data, deserialize))
  }
  onHover(callback: (event: MarkerHoverEvent) => void): () => void { return this.subscribe(this.hoverListeners, callback) }
  private subscribe<T>(set: Set<(event: T) => void>, callback: (event: T) => void): () => void {
    this.assertActive(); if (typeof callback !== 'function') throw new TypeError('callback must be a function')
    const listener = (event: T) => callback(event); set.add(listener)
    try { this.syncPicking() } catch (error) { set.delete(listener); throw error }
    return () => { set.delete(listener); if (!this.disposed) this.syncPicking() }
  }
  edit(idOrHandle: string | MarkerHandle, options: MarkerEditOptions = {}): MarkerEditSession {
    this.assertActive(); const marker = typeof idOrHandle === 'string' ? this.getMarker(idOrHandle) : idOrHandle
    if (!marker || this.getMarker(marker.id) !== marker) throw new Error('Marker is not owned by this Kit')
    if (!options || typeof options !== 'object') throw new TypeError('Edit options are required')
    options = { ...options }
    for (const key of ['interactive', 'preserveHeight'] as const) if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new TypeError(`${key} must be boolean`)
    if (options.positionMode !== undefined && !['auto', 'depth', 'terrain', 'ellipsoid'].includes(options.positionMode)) throw new TypeError('Invalid position mode')
    for (const key of ['onChange', 'onFinish', 'onCancel', 'onError'] as const) if (options[key] !== undefined && typeof options[key] !== 'function') throw new TypeError(`${key} must be a function`)
    this.cancelEdit(); this.assertActive()
    if (this.editor) throw new Error('Another editor started during cancellation')
    const owned = () => { this.assertActive(); if (this.states.get(marker.id)?.handle !== marker || !this.viewer.entities.contains(marker.entity)) throw new Error('Marker is no longer active') }
    owned(); let session: MarkerEditSession | undefined
    session = createMarkerEditor(this.viewer, marker, options, owned,
      position => { owned(); const state = this.states.get(marker.id)!; state.options = { ...state.options, position } },
      () => { if (this.editor === session) this.editor = undefined }, () => this.requestRender())
    this.editor = session; return session
  }
  cancelEdit(): void { this.editor?.cancel() }
  private removeOwned(id: string, entity: Entity): boolean {
    if (this.states.get(id)?.entity !== entity) return false
    if (this.hovered?.entity === entity) this.hovered = undefined
    this.states.delete(id)
    let removed = false
    try { if (this.editor?.marker.entity === entity) this.editor.cancel() }
    finally {
      removed = !this.viewer.isDestroyed() && this.viewer.entities.contains(entity) && this.viewer.entities.remove(entity)
      if (!this.disposed) {
        this.syncPicking(); this.requestRender()
      }
    }
    return removed
  }
  removeMarker(id: string): boolean { const state = this.states.get(id); return state ? this.removeOwned(id, state.entity) : false }
  clear(): void {
    this.batch(() => {
      let error: unknown, failed = false
      for (const [id, state] of [...this.states]) try { this.removeOwned(id, state.entity) } catch (cause) { if (!failed) { error = cause; failed = true } }
      if (failed) throw error
    })
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true; this.offPick?.(); this.offMove?.(); this.offPick = undefined; this.offMove = undefined
    this.listeners.clear(); this.hoverListeners.clear()
    try { this.cancelEdit() } finally { try { this.clear() } finally { this.picks.dispose(); this.hovered = undefined } }
  }
}
