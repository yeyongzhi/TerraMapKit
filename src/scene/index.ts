import { SceneMode, Color, type Viewer } from 'cesium'
import { assertViewer, finite, render } from '../internal/index.js'
export interface SceneOptions { requestRenderMode?: boolean; maximumRenderTimeChange?: number; resolutionScale?: number; depthTestAgainstTerrain?: boolean; lighting?: boolean; fog?: boolean; shadows?: boolean; fxaa?: boolean; backgroundColor?: Color }
export class SceneKit {
  private disposed = false
  private readonly original: SceneOptions
  private installed: SceneOptions = {}
  private readonly offs = new Set<() => void>()
  constructor(private readonly viewer: Viewer) { this.active(); this.original = this.getOptions() }
  private active() { assertViewer(this.viewer, this.disposed, 'SceneKit') }
  getOptions(): SceneOptions {
    this.active(); const s = this.viewer.scene
    return { requestRenderMode: s.requestRenderMode, maximumRenderTimeChange: s.maximumRenderTimeChange, resolutionScale: this.viewer.resolutionScale, depthTestAgainstTerrain: s.globe.depthTestAgainstTerrain, lighting: s.globe.enableLighting, fog: s.fog.enabled, shadows: this.viewer.shadows, fxaa: s.postProcessStages.fxaa.enabled, backgroundColor: Color.clone(s.backgroundColor) }
  }
  configure(options: SceneOptions): void {
    this.active()
    for (const key of ['requestRenderMode', 'depthTestAgainstTerrain', 'lighting', 'fog', 'shadows', 'fxaa'] as const) if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new TypeError(`${key} must be boolean`)
    if (options.resolutionScale !== undefined) finite(options.resolutionScale, 'resolutionScale', .1, 4)
    if (options.maximumRenderTimeChange !== undefined && options.maximumRenderTimeChange !== Infinity) finite(options.maximumRenderTimeChange, 'maximumRenderTimeChange', 0)
    if (options.backgroundColor !== undefined && (!(options.backgroundColor instanceof Color) || ![options.backgroundColor.red, options.backgroundColor.green, options.backgroundColor.blue, options.backgroundColor.alpha].every(v => Number.isFinite(v) && v >= 0 && v <= 1))) throw new TypeError('Invalid backgroundColor')
    const s = this.viewer.scene
    if (options.requestRenderMode !== undefined) s.requestRenderMode = options.requestRenderMode
    if (options.maximumRenderTimeChange !== undefined) s.maximumRenderTimeChange = options.maximumRenderTimeChange
    if (options.resolutionScale !== undefined) this.viewer.resolutionScale = options.resolutionScale
    if (options.depthTestAgainstTerrain !== undefined) s.globe.depthTestAgainstTerrain = options.depthTestAgainstTerrain
    if (options.lighting !== undefined) s.globe.enableLighting = options.lighting
    if (options.fog !== undefined) s.fog.enabled = options.fog
    if (options.shadows !== undefined) this.viewer.shadows = options.shadows
    if (options.fxaa !== undefined) s.postProcessStages.fxaa.enabled = options.fxaa
    if (options.backgroundColor !== undefined) s.backgroundColor = Color.clone(options.backgroundColor)
    this.installed = { ...this.installed, ...options, ...(options.backgroundColor && { backgroundColor: Color.clone(options.backgroundColor) }) }; render(this.viewer)
  }
  setMode(mode: '2d' | '3d' | 'columbus', duration = 0): void {
    this.active(); finite(duration, 'duration', 0, 60)
    if (!['2d', '3d', 'columbus'].includes(mode)) throw new TypeError('Invalid scene mode')
    if (mode === '2d') this.viewer.scene.morphTo2D(duration); else if (mode === '3d') this.viewer.scene.morphTo3D(duration); else this.viewer.scene.morphToColumbusView(duration)
  }
  getMode(): SceneMode { this.active(); return this.viewer.scene.mode }
  requestRender(): void { this.active(); render(this.viewer) }
  capabilities() { this.active(); const s = this.viewer.scene; return { pickPosition: s.pickPositionSupported, sampleHeight: s.sampleHeightSupported, clampToHeight: s.clampToHeightSupported } }
  onRenderError(callback: (error: unknown) => void): () => void {
    this.active(); if (typeof callback !== 'function') throw new TypeError('callback is required')
    const native = this.viewer.scene.renderError.addEventListener((_scene, error) => callback(error))
    const off = () => { native(); this.offs.delete(off) }; this.offs.add(off); return off
  }
  restore(): void {
    this.active(); const current = this.getOptions(), restore: SceneOptions = {}
    for (const key of Object.keys(this.installed) as (keyof SceneOptions)[]) {
      const same = key === 'backgroundColor' ? Color.equals(current.backgroundColor, this.installed.backgroundColor) : current[key] === this.installed[key]
      if (same) Object.assign(restore, { [key]: this.original[key] })
    }
    this.configure(restore); this.installed = {}
  }
  dispose(): void { if (this.disposed) return; for (const off of [...this.offs]) off(); if (!this.viewer.isDestroyed()) this.restore(); this.disposed = true }
}
