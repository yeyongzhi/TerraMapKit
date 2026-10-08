import { ScreenSpaceEventHandler, ScreenSpaceEventType, ConstantPositionProperty, type Viewer } from 'cesium'
import { CoordinateKit, type DegreesPoint } from '../coordinate/index.js'
import { render } from '../internal/index.js'
import { PickKit, type PickPositionMode } from '../pick/index.js'
import type { MarkerHandle } from './index.js'
export interface MarkerEditOptions {
  interactive?: boolean; positionMode?: PickPositionMode; preserveHeight?: boolean
  onChange?: (position: DegreesPoint) => void; onFinish?: (marker: MarkerHandle) => void
  onCancel?: () => void; onError?: (error: unknown) => void
}
export interface MarkerEditSession {
  readonly marker: MarkerHandle; readonly position: DegreesPoint
  moveTo(position: DegreesPoint): void; finish(): MarkerHandle; cancel(): void
}
export function createMarkerEditor(viewer: Viewer, marker: MarkerHandle, options: MarkerEditOptions,
  assertOwned: () => void, commit: (position: DegreesPoint) => void, onClose: () => void,
  requestRender: () => void = () => render(viewer)): MarkerEditSession {
  let position = marker.position, closed = false, dragging = false, previousInputs: boolean | undefined
  let handler: ScreenSpaceEventHandler | undefined
  const picks = new PickKit(viewer), window = viewer.scene.canvas?.ownerDocument?.defaultView
  const endDrag = () => {
    dragging = false
    if (previousInputs !== undefined && !viewer.isDestroyed()) viewer.scene.screenSpaceCameraController.enableInputs = previousInputs
    previousInputs = undefined
  }
  const close = (restore: boolean) => {
    if (closed) return
    closed = true; endDrag(); handler?.destroy(); picks.dispose()
    window?.removeEventListener('mouseup', endDrag, true); window?.removeEventListener('blur', endDrag); window?.removeEventListener('touchend', endDrag, true)
    try {
      if (restore) {
        position = marker.position
        if (!viewer.isDestroyed() && viewer.entities.contains(marker.entity)) marker.entity.position = new ConstantPositionProperty(CoordinateKit.fromDegrees(position.longitude, position.latitude, position.height))
      }
    } finally { onClose(); requestRender() }
  }
  const active = () => { if (closed) throw new Error('Marker edit session is no longer active'); try { assertOwned() } catch (error) { close(true); throw error } }
  const session: MarkerEditSession = Object.freeze({ marker,
    get position() { return position },
    moveTo: (next: DegreesPoint) => {
      active(); const cartesian = CoordinateKit.fromDegrees(next.longitude, next.latitude, next.height ?? 0)
      marker.entity.position = new ConstantPositionProperty(cartesian); active()
      position = Object.freeze({ longitude: next.longitude, latitude: next.latitude, height: next.height ?? 0 })
      requestRender(); options.onChange?.(position)
    },
    finish: () => { active(); endDrag(); commit(position); close(false); options.onFinish?.(marker); return marker },
    cancel: () => { if (closed) return; close(true); options.onCancel?.() }
  })
  const safely = (action: () => void) => { try { action() } catch (error) { if (options.onError) options.onError(error); else console.error(error) } }
  try {
    if (options.interactive !== false) {
      handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
      handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => safely(() => {
        active()
        if (!viewer.scene.drillPick(event.position).some((entry: { id?: unknown; primitive?: { id?: unknown } }) => (entry.id ?? entry.primitive?.id) === marker.entity)) return
        endDrag(); dragging = true; previousInputs = viewer.scene.screenSpaceCameraController.enableInputs
        viewer.scene.screenSpaceCameraController.enableInputs = false
      }), ScreenSpaceEventType.LEFT_DOWN)
      handler.setInputAction((event: ScreenSpaceEventHandler.MotionEvent) => safely(() => {
        if (!dragging) return
        active(); const world = picks.toWorld(event.endPosition, options.positionMode ?? 'terrain')
        if (!world) return
        const next = CoordinateKit.toDegrees(world)
        session.moveTo(options.preserveHeight === false ? next : { ...next, height: marker.position.height ?? 0 })
      }), ScreenSpaceEventType.MOUSE_MOVE)
      handler.setInputAction(endDrag, ScreenSpaceEventType.LEFT_UP)
      window?.addEventListener('mouseup', endDrag, true); window?.addEventListener('blur', endDrag); window?.addEventListener('touchend', endDrag, true)
    }
    return session
  } catch (error) { close(true); throw error }
}
