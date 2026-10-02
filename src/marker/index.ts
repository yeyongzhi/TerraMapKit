import { BillboardGraphics, Cartesian2, Color, Entity, LabelGraphics, PointGraphics, HorizontalOrigin, VerticalOrigin, createGuid, type Viewer } from 'cesium'
import { CoordinateKit, type DegreesPoint } from '../coordinate/index.js'
import { assertViewer, finite, render } from '../internal/index.js'
import { PickKit, type PickEvent } from '../pick/index.js'

export interface MarkerPointStyle { pixelSize?: number; color?: Color; outlineColor?: Color; outlineWidth?: number }
export interface MarkerImageStyle { image: string; width?: number; height?: number; scale?: number; color?: Color }
export interface MarkerLabelStyle { text: string; font?: string; fillColor?: Color; pixelOffset?: Cartesian2 }
export interface MarkerClickEvent extends PickEvent { id: string; entity: Entity; marker: MarkerHandle }
export interface MarkerOptions {
  id?: string
  position: DegreesPoint
  point?: MarkerPointStyle
  image?: MarkerImageStyle
  label?: MarkerLabelStyle
  show?: boolean
  onClick?: (event: MarkerClickEvent) => void
}
export interface MarkerHandle {
  readonly id: string
  readonly entity: Entity
  /** Replace position, styles and callback, retaining the ID and Entity. */
  update(options: Omit<MarkerOptions, 'id'>): void
  setVisible(show: boolean): void
  remove(): boolean
}
interface State { entity: Entity; handle: MarkerHandle; onClick: MarkerOptions['onClick'] }

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
  return entity
}

/** Owns Entity markers and a lazy, canvas-scoped picking subscription. */
export class MarkerKit {
  private disposed = false
  private readonly states = new Map<string, State>()
  private readonly listeners = new Set<(event: MarkerClickEvent) => void>()
  private readonly picks: PickKit
  private offPick: (() => void) | undefined
  constructor(private readonly viewer: Viewer) { this.assertActive(); this.picks = new PickKit(viewer) }
  private assertActive(): void { assertViewer(this.viewer, this.disposed, 'MarkerKit') }
  private syncPicking(): void {
    const needed = this.listeners.size > 0 || [...this.states.values()].some(state => state.onClick)
    if (needed && !this.offPick) this.offPick = this.picks.onClick(event => {
      const picked = event.picked as { id?: unknown; primitive?: { id?: unknown } } | undefined
      const entity = picked?.id ?? picked?.primitive?.id
      const state = [...this.states.values()].find(candidate => candidate.entity === entity)
      if (!state || !state.entity.show || !this.viewer.entities.contains(state.entity)) return
      const click: MarkerClickEvent = { ...event, id: state.handle.id, entity: state.entity, marker: state.handle }
      state.onClick?.(click)
      for (const callback of [...this.listeners]) { if (this.disposed || !this.states.has(click.id)) break; callback(click) }
    })
    if (!needed && this.offPick) { this.offPick(); this.offPick = undefined }
  }
  addMarker(options: MarkerOptions): MarkerHandle {
    this.assertActive()
    if (!options || typeof options !== 'object') throw new TypeError('options are required')
    const id = options.id ?? createGuid()
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('id must be a non-empty string')
    const prepared = prepare(options, id)
    this.getMarker(id)
    if (this.states.has(id)) throw new Error(`Duplicate marker id: ${id}`)
    if (this.viewer.entities.getById(id)) throw new Error(`Entity id already exists in Viewer: ${id}`)
    const entity = prepared
    const assertOwned = () => { this.assertActive(); if (this.states.get(id)?.entity !== entity || !this.viewer.entities.contains(entity)) throw new Error('Marker is no longer active') }
    const handle: MarkerHandle = {
      id, entity,
      update: next => { assertOwned(); this.updateMarker(id, next) },
      setVisible: show => { assertOwned(); this.setVisible(id, show) },
      remove: () => this.removeOwned(id, entity)
    }
    this.states.set(id, { entity, handle, onClick: options.onClick })
    try {
      this.viewer.entities.add(entity)
      this.assertActive()
      if (!this.viewer.entities.contains(entity) || this.states.get(id)?.entity !== entity) throw new Error('Marker was removed during creation')
      this.syncPicking(); render(this.viewer)
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
    const previousCallback = state.onClick
    state.onClick = options.onClick
    try { this.syncPicking() } catch (error) { state.onClick = previousCallback; throw error }
    const entity = state.entity
    this.viewer.entities.suspendEvents()
    try { entity.position = prepared.position; entity.point = prepared.point; entity.billboard = prepared.billboard; entity.label = prepared.label; entity.show = prepared.show }
    finally { this.viewer.entities.resumeEvents() }
    this.assertActive()
    if (this.states.get(id) !== state || !this.viewer.entities.contains(entity)) throw new Error('Marker was removed during update')
    render(this.viewer)
  }
  setVisible(id: string, show: boolean): void {
    this.assertActive()
    if (typeof show !== 'boolean') throw new TypeError('show must be boolean')
    const handle = this.getMarker(id)
    if (!handle) throw new Error('Marker is no longer active')
    handle.entity.show = show; render(this.viewer)
  }
  onClick(callback: (event: MarkerClickEvent) => void): () => void {
    this.assertActive()
    if (typeof callback !== 'function') throw new TypeError('callback must be a function')
    const listener = (event: MarkerClickEvent) => callback(event)
    this.listeners.add(listener)
    try { this.syncPicking() } catch (error) { this.listeners.delete(listener); throw error }
    return () => { this.listeners.delete(listener); if (!this.disposed) this.syncPicking() }
  }
  private removeOwned(id: string, entity: Entity): boolean {
    if (this.states.get(id)?.entity !== entity) return false
    this.states.delete(id)
    const removed = !this.viewer.isDestroyed() && this.viewer.entities.contains(entity) && this.viewer.entities.remove(entity)
    if (!this.disposed) { this.syncPicking(); render(this.viewer) }
    return removed
  }
  removeMarker(id: string): boolean { const state = this.states.get(id); return state ? this.removeOwned(id, state.entity) : false }
  clear(): void { for (const [id, state] of [...this.states]) this.removeOwned(id, state.entity) }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true; this.offPick?.(); this.offPick = undefined; this.listeners.clear()
    this.clear(); this.picks.dispose()
  }
}
