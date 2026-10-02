import { Cartesian3, type Viewer } from 'cesium'

export function assertViewer(viewer: Viewer, disposed: boolean, name: string): void {
  if (disposed) throw new Error(`${name} has been disposed`)
  if (!viewer || typeof viewer.isDestroyed !== 'function') throw new TypeError('viewer must be a Cesium Viewer')
  if (viewer.isDestroyed()) throw new Error('Viewer has been destroyed')
}
export function finite(value: number, name: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`)
  if (value < min || value > max) throw new RangeError(`${name} must be between ${min} and ${max}`)
  return value
}
export function clonePosition(position: Cartesian3): Cartesian3 {
  if (!position) throw new TypeError('position is required')
  finite(position.x, 'position.x'); finite(position.y, 'position.y'); finite(position.z, 'position.z')
  if (Cartesian3.magnitude(position) < 1) throw new RangeError('position must be away from the Earth centre')
  return Cartesian3.clone(position)
}
export function render(viewer: Viewer): void { if (!viewer.isDestroyed()) viewer.scene.requestRender() }
