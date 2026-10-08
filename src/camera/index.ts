import { Cartesian3, HeadingPitchRange, JulianDate, Matrix4, BoundingSphere, Rectangle, SceneTransforms, Ellipsoid, SceneMode, Intersect, type Viewer } from 'cesium'
import { CoordinateKit, type DegreesPoint } from '../coordinate/index.js'
import { assertViewer, clonePosition, finite, render } from '../internal/index.js'

export interface CameraView {
  position: Cartesian3
  heading: number; pitch: number; roll: number
  transform: Matrix4
}
export interface CameraPositionOptions {
  heading?: number; pitch?: number; roll?: number
}
export interface CameraFlightOptions extends CameraPositionOptions { duration?: number }
export interface OrbitOptions { range?: number; pitch?: number; speed?: number }

/** Angles are radians; orbit speed is radians per simulation second. */
export class CameraKit {
  private disposed = false
  private stopOrbitCallback: (() => void) | undefined
  private readonly flights = new Set<() => void>()
  private readonly subscriptions = new Set<() => void>()
  private readonly constraints = new Map<string, { original: unknown; installed: unknown }>()
  constructor(private readonly viewer: Viewer) { this.assertActive() }
  private assertActive(): void { assertViewer(this.viewer, this.disposed, 'CameraKit') }
  private orientation(options: CameraPositionOptions) {
    return {
      heading: finite(options.heading ?? this.viewer.camera.heading, 'heading'),
      pitch: finite(options.pitch ?? this.viewer.camera.pitch, 'pitch', -Math.PI / 2, Math.PI / 2),
      roll: finite(options.roll ?? this.viewer.camera.roll, 'roll')
    }
  }
  fitPositions(input: readonly Cartesian3[], options: { range?: number; heading?: number; pitch?: number } = {}): void {
    this.assertActive(); if (!Array.isArray(input) || !input.length || input.length > 10000) throw new RangeError('Expected 1–10000 positions')
    const sphere = BoundingSphere.fromPoints(Array.from(input, clonePosition))
    const range = finite(options.range ?? Math.max(10, sphere.radius * 3), 'range', 1)
    const heading = finite(options.heading ?? 0, 'heading'), pitch = finite(options.pitch ?? -Math.PI / 2, 'pitch', -Math.PI / 2, 0)
    this.stopOrbit(); this.cancelFlight(); this.viewer.camera.viewBoundingSphere(sphere, new HeadingPitchRange(heading, pitch, range)); this.viewer.camera.lookAtTransform(Matrix4.IDENTITY); render(this.viewer)
  }
  setViewRectangle(bounds: { west: number; south: number; east: number; north: number }): void {
    this.assertActive(); for (const key of ['west', 'east'] as const) finite(bounds[key], key, -180, 180); for (const key of ['south', 'north'] as const) finite(bounds[key], key, -90, 90)
    if (bounds.south >= bounds.north || bounds.west === bounds.east) throw new RangeError('Empty rectangle')
    this.stopOrbit(); this.cancelFlight(); this.viewer.camera.setView({ destination: Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north) }); render(this.viewer)
  }
  getViewRectangle(): Rectangle | undefined { this.assertActive(); const r = this.viewer.camera.computeViewRectangle(Ellipsoid.WGS84); return r && Rectangle.clone(r) }
  toScreen(position: Cartesian3) { this.assertActive(); return SceneTransforms.worldToWindowCoordinates(this.viewer.scene, clonePosition(position)) }
  isVisible(position: Cartesian3): boolean {
    this.assertActive(); const p = clonePosition(position), c = this.viewer.camera
    const volume = c.frustum.computeCullingVolume(c.positionWC, c.directionWC, c.upWC)
    if (volume.computeVisibility(new BoundingSphere(p, 0)) === Intersect.OUTSIDE) return false
    if (this.viewer.scene.mode !== SceneMode.SCENE3D) return true
    const origin = Ellipsoid.WGS84.transformPositionToScaledSpace(c.positionWC), target = Ellipsoid.WGS84.transformPositionToScaledSpace(p), direction = Cartesian3.subtract(target, origin, new Cartesian3())
    const a = Cartesian3.dot(direction, direction), b = 2 * Cartesian3.dot(origin, direction), d = b * b - 4 * a * (Cartesian3.dot(origin, origin) - 1)
    if (a === 0 || d < 0) return true
    return ![(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)].some(t => t > 1e-8 && t < 1 - 1e-8)
  }
  onMove(type: 'start' | 'end' | 'change', callback: () => void): () => void {
    this.assertActive(); if (!['start', 'end', 'change'].includes(type) || typeof callback !== 'function') throw new TypeError('Invalid camera event')
    const event = type === 'start' ? this.viewer.camera.moveStart : type === 'end' ? this.viewer.camera.moveEnd : this.viewer.camera.changed
    const remove = event.addEventListener(callback), off = () => { remove(); this.subscriptions.delete(off) }; this.subscriptions.add(off); return off
  }
  setConstraints(options: { minimumZoomDistance?: number; maximumZoomDistance?: number; enableRotate?: boolean; enableTilt?: boolean; enableZoom?: boolean; enableTranslate?: boolean; enableLook?: boolean }): void {
    this.assertActive(); const controller = this.viewer.scene.screenSpaceCameraController
    const min = finite(options.minimumZoomDistance ?? controller.minimumZoomDistance, 'minimumZoomDistance', 0), max = options.maximumZoomDistance ?? controller.maximumZoomDistance
    if (max !== Infinity) finite(max, 'maximumZoomDistance', min)
    for (const key of ['enableRotate', 'enableTilt', 'enableZoom', 'enableTranslate', 'enableLook'] as const) if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new TypeError(`${key} must be boolean`)
    for (const [key, value] of Object.entries(options)) { if (value === undefined) continue; if (!['minimumZoomDistance', 'maximumZoomDistance', 'enableRotate', 'enableTilt', 'enableZoom', 'enableTranslate', 'enableLook'].includes(key)) throw new TypeError('Unknown camera constraint'); const previous = this.constraints.get(key); const source = controller as unknown as Record<string, unknown>; this.constraints.set(key, { original: previous?.original ?? source[key], installed: value }); source[key] = value }
    void max
  }
  follow(target: () => DegreesPoint, options: OrbitOptions = {}): () => void {
    this.assertActive(); if (typeof target !== 'function') throw new TypeError('target must be a function')
    const range = finite(options.range ?? 1000, 'range', 1), pitch = finite(options.pitch ?? -Math.PI / 4, 'pitch', -Math.PI / 2, 0)
    this.stopOrbit(); this.cancelFlight(); const transform = Matrix4.clone(this.viewer.camera.transform), heading = this.viewer.camera.heading
    let stopped = false
    const stop = () => { if (stopped) return; stopped = true; off(); if (!this.viewer.isDestroyed()) this.viewer.camera.lookAtTransform(transform); if (this.stopOrbitCallback === stop) this.stopOrbitCallback = undefined; render(this.viewer) }
    const update = () => { if (this.viewer.isDestroyed()) { stop(); return }; try { const p = target(); this.viewer.camera.lookAt(CoordinateKit.fromDegrees(p.longitude, p.latitude, p.height), new HeadingPitchRange(heading, pitch, range)); render(this.viewer) } catch (error) { stop(); throw error } }
    const off = this.viewer.clock.onTick.addEventListener(update); this.stopOrbitCallback = stop; update(); return stop
  }
  setView(position: DegreesPoint, options: CameraPositionOptions = {}): void {
    this.assertActive()
    const destination = CoordinateKit.fromDegrees(position.longitude, position.latitude, position.height)
    const orientation = this.orientation(options)
    this.stopOrbit(); this.cancelFlight()
    this.viewer.camera.setView({ destination, orientation }); render(this.viewer)
  }
  flyToPosition(position: DegreesPoint, options: CameraFlightOptions = {}): Promise<boolean> {
    this.assertActive()
    const destination = CoordinateKit.fromDegrees(position.longitude, position.latitude, position.height)
    const orientation = this.orientation(options)
    const duration = finite(options.duration ?? 2, 'duration', 0, 3600)
    this.stopOrbit(); this.cancelFlight()
    return new Promise<boolean>((resolve, reject) => {
      const cancel = () => { this.flights.delete(cancel); resolve(false) }
      this.flights.add(cancel)
      try {
        this.viewer.camera.flyTo({ destination, orientation, duration,
          complete: () => { this.flights.delete(cancel); resolve(true) }, cancel })
      } catch (error) { this.flights.delete(cancel); reject(error) }
    })
  }
  flyTo(target: Parameters<Viewer['flyTo']>[0], options?: Parameters<Viewer['flyTo']>[1]): Promise<boolean> {
    this.assertActive(); this.stopOrbit(); this.cancelFlight()
    return new Promise<boolean>((resolve, reject) => {
      const cancel = () => { this.flights.delete(cancel); resolve(false) }
      this.flights.add(cancel)
      try {
        this.viewer.flyTo(target, options).then(result => {
          if (this.flights.delete(cancel)) resolve(!this.disposed && result)
        }, error => { if (this.flights.delete(cancel)) reject(error) })
      } catch (error) { this.flights.delete(cancel); reject(error) }
    })
  }
  cancelFlight(): void {
    if (this.flights.size === 0) return
    if (!this.viewer.isDestroyed()) this.viewer.camera.cancelFlight()
    for (const cancel of [...this.flights]) cancel()
  }
  saveView(): CameraView {
    this.assertActive()
    const camera = this.viewer.camera
    return { position: Cartesian3.clone(camera.positionWC), heading: camera.heading, pitch: camera.pitch, roll: camera.roll, transform: Matrix4.clone(camera.transform) }
  }
  restoreView(view: CameraView): void {
    this.assertActive()
    const destination = clonePosition(view.position), orientation = this.orientation(view)
    if (!view.transform || !Array.from({ length: 16 }, (_, i) => view.transform[i]).every(Number.isFinite)) throw new TypeError('Invalid camera transform')
    this.stopOrbit(); this.cancelFlight()
    this.viewer.camera.setView({ destination, orientation, endTransform: Matrix4.clone(view.transform) })
    render(this.viewer)
  }
  startOrbit(position: DegreesPoint, options: OrbitOptions = {}): () => void {
    this.assertActive()
    const center = CoordinateKit.fromDegrees(position.longitude, position.latitude, position.height)
    const range = finite(options.range ?? 10000, 'range', 1, 100000000)
    const pitch = finite(options.pitch ?? -Math.PI / 4, 'pitch', -Math.PI / 2, 0)
    const speed = finite(options.speed ?? 0.2, 'speed', -10, 10)
    this.stopOrbit(); this.cancelFlight()
    const transform = Matrix4.clone(this.viewer.camera.transform)
    const start = JulianDate.clone(this.viewer.clock.currentTime)
    const heading = this.viewer.camera.heading
    let stopped = false
    const update = () => {
      if (this.viewer.isDestroyed()) { stop(); return }
      const angle = heading + JulianDate.secondsDifference(this.viewer.clock.currentTime, start) * speed
      this.viewer.camera.lookAt(center, new HeadingPitchRange(angle, pitch, range)); render(this.viewer)
    }
    const remove = this.viewer.clock.onTick.addEventListener(update)
    const stop = () => {
      if (stopped) return
      stopped = true; remove()
      if (!this.viewer.isDestroyed()) this.viewer.camera.lookAtTransform(transform)
      if (this.stopOrbitCallback === stop) this.stopOrbitCallback = undefined
      render(this.viewer)
    }
    this.stopOrbitCallback = stop
    try { update() } catch (error) { stop(); throw error }
    return stop
  }
  stopOrbit(): void { this.stopOrbitCallback?.() }
  dispose(): void {
    if (this.disposed) return
    this.stopOrbit(); this.cancelFlight(); for (const off of [...this.subscriptions]) off()
    if (!this.viewer.isDestroyed()) { const c = this.viewer.scene.screenSpaceCameraController as unknown as Record<string, unknown>; for (const [key, value] of this.constraints) if (c[key] === value.installed) c[key] = value.original }
    this.constraints.clear(); this.disposed = true
  }
}
