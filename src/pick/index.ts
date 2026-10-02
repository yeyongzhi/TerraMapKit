import { Cartesian2, Cartesian3, ScreenSpaceEventHandler, ScreenSpaceEventType, type Viewer } from 'cesium'
import { assertViewer, finite } from '../internal/index.js'

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
    this.handler?.destroy(); this.handler = undefined
  }
}
