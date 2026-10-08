import { createGuid, JulianDate, type Entity, type Viewer } from 'cesium'
import { assertViewer, finite, render } from '../internal/index.js'
import { normalize, type Config } from './config.js'
import { buildEntities, needsRebuild } from './renderers/index.js'
import type { AnyEffectOptions, EffectBaseOptions, EffectHandle, EffectKind, CircleEffectOptions, RippleEffectOptions, WaveEffectOptions, PulsePointOptions, RadarScanOptions, LineEffectOptions, FlowLineOptions, FlightArcOptions, WallEffectOptions, PolygonPulseOptions } from './options.js'
export * from './options.js'
interface State {
  id: string; kind: EffectKind; config: Config; entities: Entity[]; handle: EffectHandle<EffectBaseOptions>
  anchor: JulianDate; offset: number; paused: boolean; completed: boolean
  refreshCallbacks?: () => void
}
/** Independent playback cursors driven by the Viewer clock. Never modifies the shared clock. */
export class EffectKit {
  private readonly states = new Map<string, State>()
  private disposed = false
  private removeTick: (() => void) | undefined
  constructor(private readonly viewer: Viewer) {
    this.assertActive()
    if (!viewer.entities || !viewer.clock?.onTick || !viewer.scene) throw new TypeError('viewer must expose entities, clock and scene')
  }
  private assertActive(): void { assertViewer(this.viewer, this.disposed, 'EffectKit') }
  private elapsed(state: State, time = this.viewer.clock.currentTime): number {
    return state.offset + (state.paused ? 0 : JulianDate.secondsDifference(time, state.anchor) * state.config.speed)
  }
  private phase(state: State, time?: JulianDate, offset = 0): number {
    const cycles = this.elapsed(state, time) / state.config.duration
    return state.config.loop ? ((cycles + offset) % 1 + 1) % 1 : Math.max(0, Math.min(1, cycles + offset))
  }
  private syncTick(): void {
    const active = [...this.states.values()].some(s => !s.paused)
    if (active && !this.removeTick) this.removeTick = this.viewer.clock.onTick.addEventListener(() => {
      if (this.viewer.isDestroyed()) { this.dispose(); return }
      const notifications: State[] = []
      for (const state of [...this.states.values()]) {
        if (!this.alive(state)) { this.removeEffect(state.handle); continue }
        if (!state.paused && !state.config.loop && this.elapsed(state) >= state.config.duration) {
          state.offset = state.config.duration; state.anchor = JulianDate.clone(this.viewer.clock.currentTime)
          state.paused = true; state.completed = true; state.refreshCallbacks?.(); notifications.push(state)
        }
      }
      this.syncTick(); render(this.viewer)
      // Commit completion first; callbacks may remove effects or dispose the Kit.
      let callbackError: unknown
      let callbackFailed = false
      for (const state of notifications) if (!this.disposed && this.states.get(state.id) === state && state.completed) {
        try { state.config.onComplete?.(state.handle) }
        catch (error) { if (!callbackFailed) callbackError = error; callbackFailed = true }
      }
      if (callbackFailed) throw callbackError
    })
    if (!active && this.removeTick) { this.removeTick(); this.removeTick = undefined }
    if (active) render(this.viewer)
  }
  private alive(state: State): boolean { return state.entities.every(entity => this.viewer.entities.contains(entity)) }
  private prune(): void { for (const state of [...this.states.values()]) if (!this.alive(state)) this.removeEffect(state.handle) }
  get size(): number { this.assertActive(); this.prune(); return this.states.size }
  getEffects(): readonly EffectHandle<EffectBaseOptions>[] { this.assertActive(); this.prune(); return Object.freeze([...this.states.values()].map(s => s.handle)) }
  addRipple(options: RippleEffectOptions): EffectHandle<RippleEffectOptions> { return this.add(options, 'ripple') }
  addDiffusionCircle(options: CircleEffectOptions): EffectHandle<CircleEffectOptions> { return this.add(options, 'diffusion') }
  addWave(options: WaveEffectOptions): EffectHandle<WaveEffectOptions> { return this.add(options, 'wave') }
  addPulsePoint(options: PulsePointOptions): EffectHandle<PulsePointOptions> { return this.add(options, 'pulse') }
  addGlowLine(options: LineEffectOptions): EffectHandle<LineEffectOptions> { return this.add(options, 'glow') }
  addRadarScan(options: RadarScanOptions): EffectHandle<RadarScanOptions> { return this.add(options, 'radar') }
  addFlowLine(options: FlowLineOptions): EffectHandle<FlowLineOptions> { return this.add(options, 'flow') }
  addFlightArc(options: FlightArcOptions): EffectHandle<FlightArcOptions> { return this.add(options, 'arc') }
  addWall(options: WallEffectOptions): EffectHandle<WallEffectOptions> { return this.add(options, 'wall') }
  addPolygonPulse(options: PolygonPulseOptions): EffectHandle<PolygonPulseOptions> { return this.add(options, 'polygon') }
  private add<T extends AnyEffectOptions>(options: T, kind: EffectKind): EffectHandle<T> {
    this.assertActive()
    const config = normalize(options, kind), id = options.id ?? createGuid(), viewer = this.viewer
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('id must be a non-empty string')
    const previous = this.states.get(id)
    if (previous && this.alive(previous)) throw new Error(`Duplicate effect id: ${id}`)
    if (previous) this.removeEffect(previous.handle)
    const state: State = { id, kind, config, entities: [], handle: undefined as unknown as EffectHandle<EffectBaseOptions>, anchor: JulianDate.clone(viewer.clock.currentTime), offset: 0, paused: false, completed: false }
    const assertOwned = () => {
      this.assertActive()
      if (this.states.get(id) !== state || !this.alive(state)) throw new Error('Effect has been removed')
    }
    const reanchor = () => { state.offset = this.elapsed(state); state.anchor = JulianDate.clone(viewer.clock.currentTime) }
    const change = (next: AnyEffectOptions, replace: boolean) => {
      assertOwned()
      const nextConfig = normalize(next, kind)
      const old = { config: state.config, anchor: state.anchor, offset: state.offset, completed: state.completed, refreshCallbacks: state.refreshCallbacks }
      const rebuild = replace || needsRebuild(state.config, nextConfig, kind)
      reanchor(); state.config = nextConfig
      if (replace) { state.offset = 0; state.completed = false }
      else if (!nextConfig.loop) { state.offset = Math.min(nextConfig.duration, Math.max(0, state.offset)); state.completed = old.completed && state.offset === nextConfig.duration }
      else state.completed = false
      const oldEntities = state.entities
      let entities: Entity[] = []
      try {
        if (rebuild) {
          entities = buildEntities(state, (time, offset) => this.phase(state, time, offset))
          for (const entity of entities) { entity.show = nextConfig.show; viewer.entities.add(entity) }
        }
        assertOwned()
      } catch (error) {
        for (const entity of entities) viewer.entities.remove(entity)
        Object.assign(state, old); throw error
      }
      if (rebuild) { state.entities = entities; for (const entity of oldEntities) viewer.entities.remove(entity) }
      else for (const entity of state.entities) entity.show = nextConfig.show
      state.refreshCallbacks?.(); this.syncTick(); render(viewer)
    }
    const handle: EffectHandle<T> = Object.freeze({
      id, kind,
      get entities() { return Object.freeze([...state.entities]) }, get paused() { return state.paused },
      get visible() { return state.config.show }, get completed() { return state.completed },
      get currentTime() {
        const value = state.offset + (state.paused ? 0 : JulianDate.secondsDifference(viewer.clock.currentTime, state.anchor) * state.config.speed)
        return state.config.loop ? ((value % state.config.duration) + state.config.duration) % state.config.duration : Math.max(0, Math.min(state.config.duration, value))
      },
      get duration() { return state.config.duration }, get speed() { return state.config.speed },
      update: (next: Omit<T, 'id'>) => change(next as unknown as AnyEffectOptions, true),
      patch: (next: Partial<Omit<T, 'id'>>) => {
        assertOwned()
        if (!next || typeof next !== 'object' || Array.isArray(next)) throw new TypeError('patch must be an object')
        if ('id' in next) throw new TypeError('An effect ID cannot be changed')
        change({ ...state.config.input, ...next } as AnyEffectOptions, false)
      },
      setVisible: (show: boolean) => {
        assertOwned(); if (typeof show !== 'boolean') throw new TypeError('show must be boolean')
        state.config.show = show; state.config.input.show = show
        for (const entity of state.entities) entity.show = show
        render(viewer)
      },
      pause: () => { assertOwned(); if (!state.paused) { reanchor(); state.paused = true }; state.refreshCallbacks?.(); this.syncTick(); render(viewer) },
      resume: () => { assertOwned(); if (!state.paused || state.completed) return; state.anchor = JulianDate.clone(viewer.clock.currentTime); state.paused = false; state.refreshCallbacks?.(); this.syncTick(); render(viewer) },
      restart: () => { assertOwned(); state.offset = 0; state.anchor = JulianDate.clone(viewer.clock.currentTime); state.completed = false; state.paused = false; state.refreshCallbacks?.(); this.syncTick(); render(viewer) },
      seek: (seconds: number) => { assertOwned(); state.offset = finite(seconds, 'seconds', 0, state.config.duration); state.anchor = JulianDate.clone(viewer.clock.currentTime); state.completed = false; state.refreshCallbacks?.(); this.syncTick(); render(viewer) },
      setSpeed: (speed: number) => { assertOwned(); finite(speed, 'speed', 0.001, 1000); reanchor(); state.config.speed = speed; state.config.input.speed = speed; state.refreshCallbacks?.(); render(viewer) },
      remove: () => this.removeEffect(handle)
    })
    state.handle = handle; this.states.set(id, state)
    try {
      state.entities = buildEntities(state, (time, offset) => this.phase(state, time, offset))
      for (const entity of state.entities) { entity.show = config.show; viewer.entities.add(entity) }
      assertOwned(); this.syncTick(); render(viewer); return handle
    } catch (error) {
      if (this.states.get(id) === state) this.states.delete(id)
      for (const entity of state.entities) viewer.entities.remove(entity)
      this.syncTick(); throw error
    }
  }
  getEffect(id: string): EffectHandle<EffectBaseOptions> | undefined {
    this.assertActive(); const state = this.states.get(id)
    if (state && !this.alive(state)) { this.removeEffect(state.handle); return undefined }
    return state?.handle
  }
  removeEffect(idOrHandle: string | EffectHandle<EffectBaseOptions>): boolean {
    if (this.disposed) return false
    const id = typeof idOrHandle === 'string' ? idOrHandle : idOrHandle?.id, state = this.states.get(id)
    if (!state || typeof idOrHandle !== 'string' && state.handle !== idOrHandle) return false
    this.states.delete(id)
    let removed = false
    for (const entity of state.entities) removed = this.viewer.entities.remove(entity) || removed
    this.syncTick(); render(this.viewer); return removed
  }
  pauseAll(): void { for (const handle of this.getEffects()) handle.pause() }
  resumeAll(): void { for (const handle of this.getEffects()) handle.resume() }
  clear(): void {
    this.assertActive(); this.removeTick?.(); this.removeTick = undefined
    const states = [...this.states.values()]; this.states.clear()
    for (const state of states) for (const entity of state.entities) this.viewer.entities.remove(entity)
    render(this.viewer)
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true; this.removeTick?.(); this.removeTick = undefined
    const states = [...this.states.values()]; this.states.clear()
    for (const state of states) for (const entity of state.entities) this.viewer.entities.remove(entity)
    render(this.viewer)
  }
}
