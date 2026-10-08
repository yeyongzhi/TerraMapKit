import { Cartesian2, Cartesian3, ScreenSpaceEventHandler, ScreenSpaceEventType, SceneTransforms, type Viewer } from 'cesium'
import { assertViewer, finite } from '../internal/index.js'
import { clonePosition } from '../internal/index.js'
import { AsyncOperations } from '../internal/async.js'

export type PickPositionMode = 'auto' | 'depth' | 'terrain' | 'ellipsoid'
export interface PickEvent {
  screenPosition: Cartesian2
  position: Cartesian3 | undefined
  picked: unknown
}
export type PickEventType = 'click' | 'move' | 'rightClick'

/** Canvas-scoped listeners; never changes the Viewer's own input handler. */
export class PickKit {
  private disposed = false
  private readonly tasks = new AsyncOperations()
  private handler: ScreenSpaceEventHandler | undefined
  private readonly listeners = new Map<PickEventType, Set<(event: PickEvent) => void>>()
  constructor(private readonly viewer: Viewer) { this.assertActive() }
  private assertActive(): void { assertViewer(this.viewer, this.disposed, 'PickKit') }
  private screen(position: Cartesian2): Cartesian2 {
    if (!position) throw new TypeError('screenPosition is required')
    finite(position.x, 'screenPosition.x'); finite(position.y, 'screenPosition.y')
    return Cartesian2.clone(position)
  }
  pick(screenPosition: Cartesian2): unknown {
    this.assertActive()
    return this.viewer.scene.pick(this.screen(screenPosition))
  }
  static identity(picked: unknown): unknown { const p = picked as { id?: unknown; primitive?: { id?: unknown } } | undefined; return p?.id ?? p?.primitive?.id ?? picked }
  pickAll(screenPosition: Cartesian2, options: { limit?: number; filter?: (picked: unknown) => boolean } = {}): readonly unknown[] {
    this.assertActive(); const limit = finite(options.limit ?? 100, 'limit', 1, 10000)
    if (!Number.isInteger(limit) || options.filter !== undefined && typeof options.filter !== 'function') throw new TypeError('Invalid pick options')
    const picked = this.viewer.scene.drillPick(this.screen(screenPosition), limit) as unknown[]
    return picked.filter(p => !options.filter || options.filter(p))
  }
  getRay(screenPosition: Cartesian2) { this.assertActive(); return this.viewer.camera.getPickRay(this.screen(screenPosition)) }
  async clampToSurface(positions: readonly Cartesian3[], options: { objectsToExclude?: readonly object[]; width?: number; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<readonly (Cartesian3 | undefined)[]> {
    this.assertActive(); if (!this.viewer.scene.clampToHeightSupported || this.viewer.scene.mode !== 3) throw new Error('Surface clamping requires supported 3D scene')
    if (!Array.isArray(positions) || positions.length > 10000) throw new RangeError('Expected at most 10000 positions')
    const points = Array.from(positions, clonePosition), width = finite(options.width ?? .1, 'width', .001, 10000)
    const result = await this.tasks.run(this.viewer.scene.clampToHeightMostDetailed(points, Array.from(options.objectsToExclude ?? []), width), options.signal, options.timeoutMs)
    this.assertActive(); return result.map(p => p && Cartesian3.clone(p))
  }
  /** Selects supplied candidates by screen projection, not by rendering visibility. */
  selectRectangle<T>(from: Cartesian2, to: Cartesian2, candidates: readonly T[], position: (candidate: T) => Cartesian3): readonly T[] {
    this.assertActive(); const a = this.screen(from), b = this.screen(to)
    if (!Array.isArray(candidates) || candidates.length > 100000 || typeof position !== 'function') throw new TypeError('Invalid selection candidates')
    return Array.from(candidates).filter(candidate => {
      const p = position(candidate); if (!p || ![p.x, p.y, p.z].every(Number.isFinite)) throw new TypeError('Invalid candidate position')
      const screen = SceneTransforms.worldToWindowCoordinates(this.viewer.scene, p)
      return screen && screen.x >= Math.min(a.x, b.x) && screen.x <= Math.max(a.x, b.x) && screen.y >= Math.min(a.y, b.y) && screen.y <= Math.max(a.y, b.y)
    })
  }
  onHover(callback: (event: PickEvent & { phase: 'enter' | 'leave'; identity: unknown }) => void, throttleMs = 30): () => void {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function'); finite(throttleMs, 'throttleMs', 0, 10000)
    let current: unknown, previous: PickEvent | undefined, last = -Infinity
    return this.onMove(event => {
      const now = Date.now(); if (now - last < throttleMs) return; last = now
      const next = event.picked == null ? undefined : PickKit.identity(event.picked)
      if (next === current) return
      const old = current, oldEvent = previous; current = next; previous = event
      if (old !== undefined && oldEvent) callback({ ...oldEvent, phase: 'leave', identity: old })
      if (next !== undefined) callback({ ...event, phase: 'enter', identity: next })
    })
  }
  toWorld(screenPosition: Cartesian2, mode: PickPositionMode = 'auto'): Cartesian3 | undefined {
    this.assertActive()
    const screen = this.screen(screenPosition)
    if (!['auto', 'depth', 'terrain', 'ellipsoid'].includes(mode)) throw new TypeError('Invalid position mode')
    const scene = this.viewer.scene
    if ((mode === 'auto' || mode === 'depth') && scene.pickPositionSupported) {
      // Empty/background depth can be absent; fallback only in auto mode.
      const point = scene.pickPosition(screen)
      if (point) return Cartesian3.clone(point)
    }
    if (mode === 'depth') return undefined
    if (mode === 'auto' || mode === 'terrain') {
      const ray = this.viewer.camera.getPickRay(screen)
      const point = ray && scene.globe?.pick(ray, scene)
      if (point) return Cartesian3.clone(point)
      if (mode === 'terrain') return undefined
    }
    const point = this.viewer.camera.pickEllipsoid(screen, scene.globe?.ellipsoid)
    return point ? Cartesian3.clone(point) : undefined
  }
  on(type: PickEventType, callback: (event: PickEvent) => void): () => void {
    this.assertActive()
    if (!['click', 'move', 'rightClick'].includes(type) || typeof callback !== 'function') throw new TypeError('Invalid event type/callback')
    if (!this.handler) this.handler = new ScreenSpaceEventHandler(this.viewer.scene.canvas)
    const eventTypes = { click: ScreenSpaceEventType.LEFT_CLICK, move: ScreenSpaceEventType.MOUSE_MOVE, rightClick: ScreenSpaceEventType.RIGHT_CLICK }
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set(); this.listeners.set(type, set)
      this.handler.setInputAction((movement: ScreenSpaceEventHandler.PositionedEvent | ScreenSpaceEventHandler.MotionEvent) => {
        if (this.disposed || this.viewer.isDestroyed()) return
        const screen = Cartesian2.clone('endPosition' in movement ? movement.endPosition : movement.position)
        const event: PickEvent = { screenPosition: screen, position: this.toWorld(screen), picked: this.pick(screen) }
        for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event)
      }, eventTypes[type])
    }
    // Wrap duplicate callbacks so each subscription can be independently removed.
    const listener = (event: PickEvent) => callback(event)
    set.add(listener)
    let removed = false
    return () => {
      if (removed) return
      removed = true
      set!.delete(listener)
      if (set!.size === 0) { this.listeners.delete(type); this.handler?.removeInputAction(eventTypes[type]) }
      if (this.listeners.size === 0 && this.handler) { this.handler.destroy(); this.handler = undefined }
    }
  }
  onClick(callback: (event: PickEvent) => void): () => void { return this.on('click', callback) }
  onMove(callback: (event: PickEvent) => void): () => void { return this.on('move', callback) }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true; this.listeners.clear()
    this.tasks.dispose()
    this.handler?.destroy(); this.handler = undefined
  }
}
