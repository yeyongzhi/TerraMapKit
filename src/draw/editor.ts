import { CallbackPositionProperty, Cartesian3, Color, Entity, ScreenSpaceEventHandler, ScreenSpaceEventType, type Cartesian2, type Viewer } from 'cesium'
import { CoordinateKit } from '../coordinate/index.js'
import { finite, render } from '../internal/index.js'
import { PickKit } from '../pick/index.js'
import { snapshot, validateGeometry } from './data.js'
import { setGeometry } from './entity.js'
import { snapPosition } from './snap.js'
import { TransformKit } from '../transform/index.js'
import { Matrix4 } from 'cesium'
import type { DrawEditOptions, DrawEditSession, DrawResult, EditMode } from './types.js'

/** A draft belongs to one committed result. Gestures occupy one history entry. */
export function createEditor(viewer: Viewer, result: DrawResult, options: DrawEditOptions, assertOwned: () => void,
  commit: (positions: readonly Cartesian3[]) => void, onClose: () => void): DrawEditSession {
  let points = snapshot(result.positions), closed = false, mode: EditMode = 'vertex', selectedIndex: number | undefined
  let controls: { entity: Entity; index: number; midpoint: boolean }[] = []
  const past: (readonly Cartesian3[])[] = [], future: (readonly Cartesian3[])[] = []
  let handler: ScreenSpaceEventHandler | undefined
  let drag: { index: number | undefined; anchor: Cartesian3; previous: readonly Cartesian3[] } | undefined
  let previousInputs: boolean | undefined
  const canvas = viewer.scene.canvas
  const window = canvas?.ownerDocument?.defaultView
  const picks = new PickKit(viewer)
  const active = () => {
    if (closed) throw new Error('Edit session is no longer active')
    try { assertOwned() } catch (error) { close(true); throw error }
  }
  const same = (a: readonly Cartesian3[], b: readonly Cartesian3[]) => a.length === b.length && a.every((p, i) => Cartesian3.equals(p, b[i]!))
  const remember = (previous: readonly Cartesian3[]) => { past.push(previous); if (past.length > 100) past.shift(); future.length = 0 }
  const releaseCamera = () => {
    if (previousInputs !== undefined && !viewer.isDestroyed()) viewer.scene.screenSpaceCameraController.enableInputs = previousInputs
    previousInputs = undefined
  }
  const endDrag = () => {
    const previous = drag?.previous; drag = undefined; releaseCamera()
    if (!closed && previous && !same(previous, points)) remember(previous)
  }
  const index = (value: number, insertion = false) => {
    finite(value, 'index', 0, insertion ? points.length : points.length - 1)
    if (!Number.isInteger(value)) throw new RangeError('index must be an integer')
    return value
  }
  const syncControls = () => {
    if (options.interactive === false) return
    const count = points.length + (result.type === 'point' ? 0 : result.type === 'polygon' ? points.length : points.length - 1)
    if (controls.length !== count) {
      const next: typeof controls = []
      try {
        for (let i = 0; i < count; i++) {
          const midpoint = i >= points.length, vertex = midpoint ? i - points.length : i
          const entity = new Entity({ position: new CallbackPositionProperty((_time, output) => midpoint
            ? Cartesian3.midpoint(points[vertex]!, points[(vertex + 1) % points.length]!, output ?? new Cartesian3())
            : Cartesian3.clone(points[vertex]!, output), false), point: {
            pixelSize: midpoint ? 10 : 14, color: midpoint ? Color.CYAN : Color.ORANGE,
            outlineColor: Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY
          } })
          next.push({ entity, index: vertex, midpoint }); viewer.entities.add(entity); active()
        }
      } catch (error) { for (const control of next) viewer.entities.remove(control.entity); throw error }
      const previous = controls; controls = next
      for (const control of previous) viewer.entities.remove(control.entity)
    }
    for (const control of controls) control.entity.show = !control.midpoint || mode === 'insert'
  }
  const change = (candidate: readonly Cartesian3[], history = true, notify = true) => {
    active()
    const next = snapshot(validateGeometry(result.type, candidate)), previous = points
    if (same(previous, next)) return
    points = next
    try { setGeometry(result.entity, result.type, points); active(); syncControls(); active() }
    catch (error) {
      points = previous
      if (!closed && !viewer.isDestroyed() && viewer.entities.contains(result.entity)) setGeometry(result.entity, result.type, previous)
      throw error
    }
    if (history) remember(previous)
    selectedIndex = undefined; render(viewer); if (notify) options.onChange?.(snapshot(points))
  }
  const close = (restore: boolean) => {
    if (closed) return
    closed = true; drag = undefined; releaseCamera()
    handler?.destroy(); handler = undefined; picks.dispose()
    window?.removeEventListener('mouseup', endDrag, true); window?.removeEventListener('touchend', endDrag, true)
    window?.removeEventListener('blur', endDrag)
    const previous = controls; controls = []
    for (const control of previous) viewer.entities.remove(control.entity)
    try {
      if (restore) {
        points = snapshot(result.positions)
        if (!viewer.isDestroyed() && viewer.entities.contains(result.entity)) setGeometry(result.entity, result.type, points)
      }
    } finally { onClose(); render(viewer) }
  }
  const session: DrawEditSession = Object.freeze({
    result, entity: result.entity,
    get positions() { return snapshot(points) }, get handles() { return Object.freeze(controls.map(c => c.entity)) },
    get mode() { return mode }, get selectedIndex() { return selectedIndex },
    get canUndo() { return past.length > 0 }, get canRedo() { return future.length > 0 },
    setMode: (next: EditMode) => { active(); if (!['vertex', 'insert', 'delete', 'translate'].includes(next)) throw new TypeError('Invalid edit mode'); endDrag(); mode = next; syncControls(); render(viewer) },
    selectVertex: (value: number) => { active(); selectedIndex = index(value); render(viewer) },
    moveVertex: (value: number, position: Cartesian3) => { active(); endDrag(); const next = [...points]; next[index(value)] = options.snap ? snapPosition(position, options.snap) : position; change(next) },
    insertVertex: (value: number, position: Cartesian3) => { active(); endDrag(); if (result.type === 'point') throw new RangeError('Cannot insert into a point'); const next = [...points]; next.splice(index(value, true), 0, options.snap ? snapPosition(position, options.snap) : position); change(next) },
    removeVertex: (value: number) => { active(); endDrag(); const next = [...points]; next.splice(index(value), 1); change(next) },
    translate: (delta: Cartesian3) => {
      active(); endDrag(); if (!delta) throw new TypeError('delta is required')
      finite(delta.x, 'delta.x'); finite(delta.y, 'delta.y'); finite(delta.z, 'delta.z')
      change(points.map(p => Cartesian3.add(p, delta, new Cartesian3())))
    },
    rotate: (center: Cartesian3, axis: Cartesian3, angle: number) => { active(); endDrag(); const matrix = TransformKit.rotateAround(Matrix4.IDENTITY, center, axis, angle); change(points.map(p => TransformKit.apply(matrix, p))) },
    scale: (center: Cartesian3, factor: number) => { active(); endDrag(); finite(factor, 'factor', .001, 1000); const origin = CoordinateKit.toDegrees(center); void origin; change(points.map(p => Cartesian3.add(center, Cartesian3.multiplyByScalar(Cartesian3.subtract(p, center, new Cartesian3()), factor, new Cartesian3()), new Cartesian3()))) },
    undo: () => { active(); endDrag(); const previous = past.at(-1); if (!previous) return false; const current = points; change(previous, false, false); past.pop(); future.push(current); options.onChange?.(snapshot(points)); return true },
    redo: () => { active(); endDrag(); const next = future.at(-1); if (!next) return false; const current = points; change(next, false, false); future.pop(); past.push(current); options.onChange?.(snapshot(points)); return true },
    finish: () => { active(); endDrag(); const next = snapshot(validateGeometry(result.type, points)); commit(next); close(false); options.onFinish?.(result); return result },
    cancel: () => { if (closed) return; close(true); options.onCancel?.() }
  })
  const safely = (action: () => void) => { try { action() } catch (error) { if (options.onError) options.onError(error); else console.error(error) } }
  try {
    syncControls(); active()
    if (options.interactive !== false) {
      handler = new ScreenSpaceEventHandler(canvas)
      const pickedControl = (screen: Cartesian2) => {
        const entries = viewer.scene.drillPick(screen) as { id?: unknown; primitive?: { id?: unknown } }[]
        const identities = entries.map(entry => entry.id ?? entry.primitive?.id)
        const control = controls.find(c => identities.includes(c.entity))
        return { entity: control?.entity ?? (identities.includes(result.entity) ? result.entity : identities[0]), control }
      }
      const world = (screen: Cartesian2) => { const p = picks.toWorld(screen, options.positionMode ?? 'terrain'); return p && options.snap ? snapPosition(p, options.snap) : p }
      handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => safely(() => {
        active(); const picked = pickedControl(event.position), control = picked.control
        if (mode === 'vertex' && control && !control.midpoint) session.selectVertex(control.index)
        if (mode === 'delete' && control && !control.midpoint) session.removeVertex(control.index)
        if (mode === 'insert' && control?.midpoint) session.insertVertex(control.index + 1, Cartesian3.midpoint(points[control.index]!, points[(control.index + 1) % points.length]!, new Cartesian3()))
      }), ScreenSpaceEventType.LEFT_CLICK)
      handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => safely(() => {
        active(); const picked = pickedControl(event.position), anchor = world(event.position)
        const vertex = mode === 'vertex' && picked.control && !picked.control.midpoint ? picked.control.index : undefined
        if (!anchor || vertex === undefined && !(mode === 'translate' && picked.entity === result.entity)) return
        drag = { index: vertex, anchor, previous: points }
        const camera = viewer.scene.screenSpaceCameraController
        previousInputs = camera.enableInputs; camera.enableInputs = false
      }), ScreenSpaceEventType.LEFT_DOWN)
      handler.setInputAction((event: ScreenSpaceEventHandler.MotionEvent) => safely(() => {
        if (!drag) return
        active(); const position = world(event.endPosition); if (!position) return
        if (drag.index === undefined) {
          const delta = Cartesian3.subtract(position, drag.anchor, new Cartesian3())
          change(drag.previous.map(p => Cartesian3.add(p, delta, new Cartesian3())), false)
        } else {
          let value = position
          if (options.preserveHeight !== false) {
            const degrees = CoordinateKit.toDegrees(position), height = CoordinateKit.toDegrees(drag.previous[drag.index]!).height
            value = CoordinateKit.fromDegrees(degrees.longitude, degrees.latitude, height)
          }
          const next = [...points]; next[drag.index] = value; change(next, false)
        }
      }), ScreenSpaceEventType.MOUSE_MOVE)
      handler.setInputAction(endDrag, ScreenSpaceEventType.LEFT_UP)
      window?.addEventListener('mouseup', endDrag, true); window?.addEventListener('touchend', endDrag, true); window?.addEventListener('blur', endDrag)
    }
    render(viewer); return session
  } catch (error) { close(true); throw error }
}
