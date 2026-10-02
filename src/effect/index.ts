import {
  CallbackProperty, Cartesian3, Color, ColorMaterialProperty, createGuid,
  Entity, JulianDate, Matrix4, Transforms, type Viewer
} from 'cesium'
import { CoordinateKit, type DegreesPoint } from '../coordinate/index.js'

export interface EffectOptions {
  id?: string
  position: DegreesPoint
  color?: Color
  /** One cycle in simulation seconds. Default: 3. */
  duration?: number
}
export interface CircleEffectOptions extends EffectOptions {
  radius?: number
  minRadius?: number
}
export interface RippleEffectOptions extends CircleEffectOptions { count?: number }
export interface WaveEffectOptions extends EffectOptions {
  length?: number
  amplitude?: number
  wavelength?: number
  segments?: number
  width?: number
}
export interface EffectHandle<T extends EffectOptions = EffectOptions> {
  readonly id: string
  readonly entities: readonly Entity[]
  readonly paused: boolean
  /** Replace all options (except ID); restarts the cycle, retaining pause state. */
  update(options: Omit<T, 'id'>): void
  pause(): void
  resume(): void
  remove(): boolean
}

type Kind = 'ripple' | 'diffusion' | 'wave'
type Options = RippleEffectOptions & WaveEffectOptions
interface Config {
  position: Cartesian3; color: Color; duration: number
  radius: number; minRadius: number; count: number
  length: number; amplitude: number; wavelength: number; segments: number; width: number
}
interface State {
  id: string; kind: Kind; config: Config; entities: Entity[]; handle: EffectHandle
  start: JulianDate; frozen: number; paused: boolean
}

function number(value: number, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`)
  if (value < min || value > max) throw new RangeError(`${name} must be between ${min} and ${max}`)
  return value
}
function normalize(options: Options, kind: Kind): Config {
  if (!options || !options.position) throw new TypeError('position is required')
  const position = CoordinateKit.fromDegrees(options.position.longitude, options.position.latitude, options.position.height ?? 10)
  const color = options.color ?? Color.CYAN.withAlpha(0.8)
  if (!(color instanceof Color) || ![color.red, color.green, color.blue, color.alpha].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) {
    throw new TypeError('color must be a Cesium Color with components between 0 and 1')
  }
  const duration = number(options.duration ?? 3, 'duration', 0.01, 86400)
  const radius = number(kind === 'wave' ? 1000 : options.radius ?? 1000, 'radius', 1, 100000)
  const minRadius = number(kind === 'wave' ? 1 : options.minRadius ?? 1, 'minRadius', 1, radius)
  const count = number(kind === 'ripple' ? options.count ?? 3 : 1, 'count', 1, 8)
  const segments = number(kind === 'wave' ? options.segments ?? 64 : 64, 'segments', 8, 256)
  if (!Number.isInteger(count) || !Number.isInteger(segments)) throw new RangeError('count and segments must be integers')
  return {
    position, color: Color.clone(color), duration, radius, minRadius, count, segments,
    length: number(kind === 'wave' ? options.length ?? 3000 : 3000, 'length', 1, 100000),
    amplitude: number(kind === 'wave' ? options.amplitude ?? 300 : 300, 'amplitude', 0, 10000),
    wavelength: number(kind === 'wave' ? options.wavelength ?? 1000 : 1000, 'wavelength', 1, 100000),
    width: number(kind === 'wave' ? options.width ?? 3 : 3, 'width', 1, 10)
  }
}

/** Entity-based effects driven by the Viewer simulation clock, without timers or shaders. */
export class EffectKit {
  private readonly states = new Map<string, State>()
  private disposed = false
  private removeTick: (() => void) | undefined

  constructor(private readonly viewer: Viewer) {
    this.assertActive()
    if (!viewer.entities || !viewer.clock?.onTick || !viewer.scene) throw new TypeError('viewer must expose entities, clock and scene')
  }
  private assertActive(): void {
    if (this.disposed) throw new Error('EffectKit has been disposed')
    if (!this.viewer || typeof this.viewer.isDestroyed !== 'function') throw new TypeError('viewer must be a Cesium Viewer')
    if (this.viewer.isDestroyed()) throw new Error('Viewer has been destroyed')
  }
  private elapsed(state: State, time: JulianDate): number {
    return state.paused ? state.frozen : JulianDate.secondsDifference(time, state.start)
  }
  private phase(state: State, time: JulianDate, offset = 0): number {
    const cycles = this.elapsed(state, time) / state.config.duration + offset
    return ((cycles % 1) + 1) % 1
  }
  private alive(state: State): boolean {
    return state.entities.every(entity => this.viewer.entities.contains(entity))
  }
  private syncTick(): void {
    const active = [...this.states.values()].some(state => !state.paused)
    if (active && !this.removeTick) {
      this.removeTick = this.viewer.clock.onTick.addEventListener(() => {
        if (this.viewer.isDestroyed()) { this.dispose(); return }
        for (const state of [...this.states.values()]) {
          if (!this.alive(state)) this.removeEffect(state.handle)
        }
        if ([...this.states.values()].some(state => !state.paused)) this.viewer.scene.requestRender()
      })
    } else if (!active && this.removeTick) {
      this.removeTick(); this.removeTick = undefined
    }
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }
  private buildEntities(state: State): Entity[] {
    const now = (time?: JulianDate) => time ?? this.viewer.clock.currentTime
    if (state.kind === 'wave') {
      return [new Entity({
        polyline: {
          positions: new CallbackProperty(time => {
            const config = state.config
            const frame = Transforms.eastNorthUpToFixedFrame(config.position)
            const phase = this.phase(state, now(time)) * Math.PI * 2
            return Array.from({ length: config.segments + 1 }, (_, i) => {
              const x = (i / config.segments - 0.5) * config.length
              const y = config.amplitude * Math.sin(x / config.wavelength * Math.PI * 2 - phase)
              return Matrix4.multiplyByPoint(frame, new Cartesian3(x, y, 0), new Cartesian3())
            })
          }, false),
          width: new CallbackProperty(() => state.config.width, false),
          material: new ColorMaterialProperty(new CallbackProperty(() => Color.clone(state.config.color), false)),
          clampToGround: false
        }
      })]
    }
    return Array.from({ length: state.config.count }, (_, index) => {
      const phase = (time?: JulianDate) => this.phase(state, now(time), index / state.config.count)
      const radius = new CallbackProperty(time => state.config.minRadius
        + (state.config.radius - state.config.minRadius) * phase(time), false)
      const color = new CallbackProperty(time => state.config.color.withAlpha(state.config.color.alpha * (1 - phase(time))), false)
      return new Entity({
        position: state.config.position,
        ellipse: {
          semiMajorAxis: radius, semiMinorAxis: radius,
          height: CoordinateKit.toDegrees(state.config.position).height,
          fill: state.kind === 'diffusion', outline: state.kind === 'ripple',
          outlineColor: color,
          material: new ColorMaterialProperty(color)
        }
      })
    })
  }

  addRipple(options: RippleEffectOptions): EffectHandle<RippleEffectOptions> { return this.add(options, 'ripple') }
  addDiffusionCircle(options: CircleEffectOptions): EffectHandle<CircleEffectOptions> { return this.add(options, 'diffusion') }
  addWave(options: WaveEffectOptions): EffectHandle<WaveEffectOptions> { return this.add(options, 'wave') }

  private add<T extends Options>(options: T, kind: Kind): EffectHandle<T> {
    this.assertActive()
    const config = normalize(options, kind)
    const id = options.id ?? createGuid()
    if (typeof id !== 'string' || id.trim() === '') throw new TypeError('id must be a non-empty string')
    const previous = this.states.get(id)
    if (previous && this.alive(previous)) throw new Error(`Duplicate effect id: ${id}`)
    if (previous) this.removeEffect(previous.handle)
    const state: State = {
      id, kind, config, entities: [], handle: undefined as unknown as EffectHandle,
      start: JulianDate.clone(this.viewer.clock.currentTime), paused: false, frozen: 0
    }
    const assertOwned = () => {
      this.assertActive()
      if (this.states.get(id) !== state || !this.alive(state)) throw new Error('Effect has been removed')
    }
    const handle: EffectHandle<T> = Object.freeze({
      id,
      get entities() { return Object.freeze([...state.entities]) },
      get paused() { return state.paused },
      update: (next: Omit<T, 'id'>) => {
        assertOwned()
        const nextConfig = normalize(next as Options, kind)
        const oldConfig = state.config, oldStart = state.start, oldFrozen = state.frozen
        state.config = nextConfig
        state.start = JulianDate.clone(this.viewer.clock.currentTime); state.frozen = 0
        const oldEntities = state.entities
        const entities = this.buildEntities(state)
        try {
          for (const entity of entities) this.viewer.entities.add(entity)
          assertOwned()
        } catch (error) {
          for (const entity of entities) this.viewer.entities.remove(entity)
          state.config = oldConfig; state.start = oldStart; state.frozen = oldFrozen
          throw error
        }
        state.entities = entities
        for (const entity of oldEntities) this.viewer.entities.remove(entity)
        this.syncTick()
      },
      pause: () => {
        assertOwned()
        if (!state.paused) { state.frozen = this.elapsed(state, this.viewer.clock.currentTime); state.paused = true }
        this.syncTick()
      },
      resume: () => {
        assertOwned()
        if (state.paused) {
          state.start = JulianDate.addSeconds(this.viewer.clock.currentTime, -state.frozen, new JulianDate())
          state.paused = false
        }
        this.syncTick()
      },
      remove: () => this.removeEffect(handle)
    })
    state.handle = handle
    state.entities = this.buildEntities(state)
    this.states.set(id, state)
    try {
      for (const entity of state.entities) this.viewer.entities.add(entity)
      assertOwned()
      this.syncTick()
      return handle
    } catch (error) {
      if (this.states.get(id) === state) this.states.delete(id)
      for (const entity of state.entities) this.viewer.entities.remove(entity)
      this.syncTick()
      throw error
    }
  }

  getEffect(id: string): EffectHandle | undefined {
    this.assertActive()
    const state = this.states.get(id)
    if (state && !this.alive(state)) { this.removeEffect(state.handle); return undefined }
    return state?.handle
  }
  removeEffect(idOrHandle: string | EffectHandle): boolean {
    if (this.disposed) return false
    const id = typeof idOrHandle === 'string' ? idOrHandle : idOrHandle?.id
    const state = this.states.get(id)
    if (!state || typeof idOrHandle !== 'string' && state.handle !== idOrHandle) return false
    this.states.delete(id)
    let removed = false
    for (const entity of state.entities) removed = this.viewer.entities.remove(entity) || removed
    this.syncTick()
    return removed
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.removeTick?.(); this.removeTick = undefined
    for (const state of this.states.values()) for (const entity of state.entities) this.viewer.entities.remove(entity)
    this.states.clear()
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }
}
