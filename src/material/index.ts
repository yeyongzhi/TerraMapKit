import { Color, ColorMaterialProperty, PolylineDashMaterialProperty, PolylineArrowMaterialProperty, PolylineGlowMaterialProperty, PolylineOutlineMaterialProperty, GridMaterialProperty, ImageMaterialProperty, Material, Cartesian2, JulianDate, Event, type Viewer } from 'cesium'
import { assertViewer, finite, render } from '../internal/index.js'
export class MaterialKit {
  private disposed = false
  private readonly flows = new Set<{ stop(): void }>()
  constructor(private readonly viewer: Viewer) { assertViewer(viewer, false, 'MaterialKit') }
  static color(color: Color = Color.CYAN): Color { if (!(color instanceof Color) || ![color.red, color.green, color.blue, color.alpha].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw new TypeError('Invalid color'); return Color.clone(color) }
  static solid(color = Color.CYAN): ColorMaterialProperty { return new ColorMaterialProperty(MaterialKit.color(color)) }
  static dash(color = Color.CYAN, length = 16): PolylineDashMaterialProperty { return new PolylineDashMaterialProperty({ color: MaterialKit.color(color), dashLength: finite(length, 'length', 1, 1024) }) }
  static arrow(color = Color.CYAN): PolylineArrowMaterialProperty { return new PolylineArrowMaterialProperty(MaterialKit.color(color)) }
  static glow(color = Color.CYAN, glowPower = .25): PolylineGlowMaterialProperty { return new PolylineGlowMaterialProperty({ color: MaterialKit.color(color), glowPower: finite(glowPower, 'glowPower', 0, 1) }) }
  static outline(color = Color.CYAN, outlineColor = Color.BLACK, width = 1): PolylineOutlineMaterialProperty { return new PolylineOutlineMaterialProperty({ color: MaterialKit.color(color), outlineColor: MaterialKit.color(outlineColor), outlineWidth: finite(width, 'width', 0, 32) }) }
  static grid(color = Color.CYAN, count = 8): GridMaterialProperty { finite(count, 'count', 1, 1024); return new GridMaterialProperty({ color: MaterialKit.color(color), cellAlpha: .1, lineCount: new Cartesian2(count, count) }) }
  static image(image: string, repeatX = 1, repeatY = 1): ImageMaterialProperty {
    if (typeof image !== 'string' || !image.trim()) throw new TypeError('image is required')
    return new ImageMaterialProperty({ image, repeat: new Cartesian2(finite(repeatX, 'repeatX', .001, 1024), finite(repeatY, 'repeatY', .001, 1024)), transparent: true })
  }
  /** Browser-only native Material plus Entity MaterialProperty; phase in simulation seconds. */
  addFlow(options: { color?: Color; speed?: number; repeat?: number; image?: string } = {}) {
    assertViewer(this.viewer, this.disposed, 'MaterialKit')
    let color = MaterialKit.color(options.color ?? Color.CYAN), speed = finite(options.speed ?? 1, 'speed', -100, 100), repeat = finite(options.repeat ?? 4, 'repeat', 1, 128)
    if (options.image !== undefined && (typeof options.image !== 'string' || !options.image.trim())) throw new TypeError('image is required')
    const type = options.image ? 'TerraMapKitTextureFlowV1' : 'TerraMapKitFlowV1'
    const source = options.image ? 'czm_material czm_getMaterial(czm_materialInput materialInput) { czm_material m = czm_getDefaultMaterial(materialInput); vec4 tex = texture(image, vec2(fract(materialInput.st.s * repeat - phase), materialInput.st.t)); m.diffuse = tex.rgb * color.rgb; m.alpha = tex.a * color.a; return m; }' : 'czm_material czm_getMaterial(czm_materialInput materialInput) { czm_material m = czm_getDefaultMaterial(materialInput); float t = fract(materialInput.st.s * repeat - phase); m.diffuse = color.rgb; m.alpha = color.a * smoothstep(0.0, 0.6, t); return m; }'
    const material = new Material({ fabric: { type, uniforms: { color, phase: 0, repeat, ...(options.image && { image: options.image }) }, source }, translucent: true })
    let paused = false, closed = false, phase = 0, start = JulianDate.clone(this.viewer.clock.currentTime), off: (() => void) | undefined
    const definitionChanged = new Event()
    const value = (time: JulianDate) => paused ? phase : phase + JulianDate.secondsDifference(time, start) * speed
    const active = () => { assertViewer(this.viewer, this.disposed, 'MaterialKit'); if (closed) throw new Error('Material disposed') }
    const property = { get isConstant() { return paused }, definitionChanged, getType: () => type, getValue: (time: JulianDate, result: Record<string, unknown> = {}) => Object.assign(result, { color: Color.clone(color), phase: value(time), repeat, ...(options.image && { image: options.image }) }), equals: (other: unknown) => other === property }
    const sync = () => { off?.(); off = undefined; if (!paused && !closed) off = this.viewer.clock.onTick.addEventListener(() => { if (this.viewer.isDestroyed()) { handle.dispose(); return }; material.uniforms.phase = value(this.viewer.clock.currentTime); render(this.viewer) }) }
    const handle = {
      material, property,
      patch: (patch: { color?: Color; speed?: number; repeat?: number }) => {
        active(); const nextColor = MaterialKit.color(patch.color ?? color), nextSpeed = finite(patch.speed ?? speed, 'speed', -100, 100), nextRepeat = finite(patch.repeat ?? repeat, 'repeat', 1, 128)
        phase = value(this.viewer.clock.currentTime); start = JulianDate.clone(this.viewer.clock.currentTime); color = nextColor; speed = nextSpeed; repeat = nextRepeat
        Object.assign(material.uniforms, { color: Color.clone(color), repeat, phase }); definitionChanged.raiseEvent(property); render(this.viewer)
      },
      pause: () => { active(); if (!paused) { phase = value(this.viewer.clock.currentTime); paused = true; material.uniforms.phase = phase; sync(); definitionChanged.raiseEvent(property); render(this.viewer) } },
      resume: () => { active(); if (paused) { start = JulianDate.clone(this.viewer.clock.currentTime); paused = false; sync(); definitionChanged.raiseEvent(property); render(this.viewer) } },
      seek: (seconds: number) => { active(); phase = finite(seconds, 'seconds') * speed; start = JulianDate.clone(this.viewer.clock.currentTime); material.uniforms.phase = phase; definitionChanged.raiseEvent(property); render(this.viewer) },
      dispose: () => { if (closed) return; closed = true; off?.(); off = undefined; if (!material.isDestroyed()) material.destroy(); this.flows.delete(owned); render(this.viewer) }
    }
    const owned = { stop: handle.dispose }; this.flows.add(owned); sync(); return handle
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; for (const flow of [...this.flows]) flow.stop(); this.flows.clear() }
}
export type FlowMaterialHandle = ReturnType<MaterialKit['addFlow']>
