import { Cartesian3, HeadingPitchRange, JulianDate, Matrix4, type Viewer } from 'cesium'
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
  constructor(private readonly viewer: Viewer) { this.assertActive() }
  private assertActive(): void { assertViewer(this.viewer, this.disposed, 'CameraKit') }
  private orientation(options: CameraPositionOptions) {
    return {
      heading: finite(options.heading ?? this.viewer.camera.heading, 'heading'),
      pitch: finite(options.pitch ?? this.viewer.camera.pitch, 'pitch', -Math.PI / 2, Math.PI / 2),
      roll: finite(options.roll ?? this.viewer.camera.roll, 'roll')
    }
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
    this.stopOrbit(); this.cancelFlight(); this.disposed = true
  }
}
