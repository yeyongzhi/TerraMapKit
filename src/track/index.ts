import { CallbackPositionProperty, Color, Entity, JulianDate, SampledPositionProperty, createGuid, type Viewer } from 'cesium'
import { CoordinateKit, type DegreesPoint } from '../coordinate/index.js'
import { assertViewer, finite, render } from '../internal/index.js'

export interface TrackSample { time: JulianDate | string; position: DegreesPoint }
export interface TrackOptions {
  id?: string; samples: readonly TrackSample[]; loop?: boolean; autoplay?: boolean
  speed?: number; color?: Color; showPath?: boolean
}
export interface TrackHandle {
  readonly id: string; readonly entity: Entity; readonly entities: readonly Entity[]
  readonly paused: boolean; readonly currentTime: JulianDate; readonly duration: number
  play(): void; pause(): void; seek(seconds: number): void; setSpeed(speed: number): void
  remove(): boolean
}

/** Independent playback cursor driven by Viewer simulation time; no global clock mutations. */
export class TrackKit {
  private disposed = false
  private readonly tracks = new Map<string, { handle: TrackHandle; tick: () => void }>()
  private offTick: (() => void) | undefined
  constructor(private readonly viewer: Viewer) { this.assertActive() }
  private assertActive(): void { assertViewer(this.viewer, this.disposed, 'TrackKit') }
  private syncTick(): void {
    const playing = [...this.tracks.values()].some(t => !t.handle.paused)
    if (playing && !this.offTick) this.offTick = this.viewer.clock.onTick.addEventListener(() => {
      if (this.viewer.isDestroyed()) { this.offTick?.(); this.offTick = undefined; return }
      for (const { handle, tick } of [...this.tracks.values()]) {
        if (!this.viewer.entities.contains(handle.entity)) this.removeTrack(handle)
        else tick()
      }
      this.syncTick(); render(this.viewer)
    })
    if (!playing && this.offTick) { this.offTick(); this.offTick = undefined }
  }
  addTrack(options: TrackOptions): TrackHandle {
    this.assertActive()
    options = { ...options }
    const id = options.id ?? createGuid()
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('id must be non-empty')
    if (this.tracks.has(id)) throw new Error(`Duplicate track id: ${id}`)
    if (!Array.isArray(options.samples) || options.samples.length < 2) throw new RangeError('At least two ordered track samples are required')
    for (const key of ['loop', 'autoplay', 'showPath'] as const) if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new TypeError(`${key} must be boolean`)
    const samples = Array.from(options.samples, sample => {
      const time = typeof sample.time === 'string' ? JulianDate.fromIso8601(sample.time) : JulianDate.clone(sample.time)
      if (!time || !Number.isFinite(time.dayNumber) || !Number.isFinite(time.secondsOfDay)) throw new TypeError('Invalid sample time')
      return { time, position: CoordinateKit.fromDegrees(sample.position.longitude, sample.position.latitude, sample.position.height) }
    })
    for (let i = 1; i < samples.length; i++) if (JulianDate.compare(samples[i]!.time, samples[i - 1]!.time) <= 0) throw new RangeError('Sample times must be strictly increasing')
    const start = samples[0]!.time, duration = JulianDate.secondsDifference(samples[samples.length - 1]!.time, start)
    let speed = finite(options.speed ?? 1, 'speed', 0.001, 1000)
    const color = Color.clone(options.color ?? Color.YELLOW)
    if (!color || ![color.red, color.green, color.blue, color.alpha].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw new TypeError('Invalid color')
    const property = new SampledPositionProperty()
    property.addSamples(samples.map(s => s.time), samples.map(s => s.position))
    let offset = 0, anchor = JulianDate.clone(this.viewer.clock.currentTime), paused = options.autoplay === false
    const elapsed = () => {
      const value = paused ? offset : offset + JulianDate.secondsDifference(this.viewer.clock.currentTime, anchor) * speed
      return options.loop ? ((value % duration) + duration) % duration : Math.max(0, Math.min(duration, value))
    }
    const sampleTime = () => JulianDate.addSeconds(start, elapsed(), new JulianDate())
    const entity = this.viewer.entities.add(new Entity({ position: new CallbackPositionProperty((_time, result) => property.getValue(sampleTime(), result), false), point: { pixelSize: 12, color, disableDepthTestDistance: Number.POSITIVE_INFINITY } }))
    const entities = [entity]
    try {
      this.assertActive()
      if (options.showPath !== false) entities.push(this.viewer.entities.add({ polyline: { positions: samples.map(s => s.position), material: color.withAlpha(0.55), width: 2 } }))
      this.assertActive()
      if (!entities.every(e => this.viewer.entities.contains(e))) throw new Error('Track entities were removed during creation')
    } catch (error) { for (const e of entities) this.viewer.entities.remove(e); throw error }
    const assertHandle = () => {
      this.assertActive()
      if (this.tracks.get(id)?.handle !== handle || !this.viewer.entities.contains(entity)) throw new Error('Track is no longer active')
    }
    const reanchor = () => { offset = elapsed(); anchor = JulianDate.clone(this.viewer.clock.currentTime) }
    const handle: TrackHandle = Object.freeze({ id, entity, entities: Object.freeze(entities), duration,
      get paused() { return paused }, get currentTime() { return sampleTime() },
      play: () => { assertHandle(); if (paused) { if (!options.loop && offset === duration) offset = 0; anchor = JulianDate.clone(this.viewer.clock.currentTime); paused = false; this.syncTick(); render(this.viewer) } },
      pause: () => { assertHandle(); if (!paused) { reanchor(); paused = true; this.syncTick(); render(this.viewer) } },
      seek: (seconds: number) => { assertHandle(); offset = finite(seconds, 'seconds', 0, duration); anchor = JulianDate.clone(this.viewer.clock.currentTime); render(this.viewer) },
      setSpeed: (value: number) => { assertHandle(); const next = finite(value, 'speed', 0.001, 1000); reanchor(); speed = next; render(this.viewer) },
      remove: () => this.removeTrack(handle)
    })
    this.tracks.set(id, { handle, tick: () => {
      if (!paused && !options.loop && elapsed() >= duration) { offset = duration; paused = true }
    } })
    this.syncTick(); render(this.viewer); return handle
  }
  getTrack(id: string): TrackHandle | undefined {
    this.assertActive(); const track = this.tracks.get(id)
    if (track && !this.viewer.entities.contains(track.handle.entity)) { this.removeTrack(id); return undefined }
    return track?.handle
  }
  removeTrack(idOrHandle: string | TrackHandle): boolean {
    const id = typeof idOrHandle === 'string' ? idOrHandle : idOrHandle.id, track = this.tracks.get(id)
    if (!track || typeof idOrHandle !== 'string' && track.handle !== idOrHandle) return false
    this.tracks.delete(id)
    for (const entity of track.handle.entities) this.viewer.entities.remove(entity)
    this.syncTick(); render(this.viewer); return true
  }
  clear(): void { for (const id of [...this.tracks.keys()]) this.removeTrack(id) }
  dispose(): void { if (!this.disposed) { this.clear(); this.disposed = true } }
}
