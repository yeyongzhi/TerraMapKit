import { CallbackProperty, Color, ColorMaterialProperty, PolylineGlowMaterialProperty, type Entity, type JulianDate } from 'cesium'
import type { Config } from '../config.js'
import type { EffectKind } from '../options.js'
export interface RenderState { kind: EffectKind; config: Config; paused: boolean; refreshCallbacks?: () => void }
export type Phase = (time?: JulianDate, offset?: number) => number
export const pulse = (phase: number) => (1 - Math.cos(phase * Math.PI * 2)) / 2
export function createContext(state: RenderState, phase: Phase) {
  const refreshers: (() => void)[] = []
  const callback = (fn: CallbackProperty.Callback) => {
    const property = new CallbackProperty(fn, state.paused)
    refreshers.push(() => property.setCallback((time, result) => fn(time, result), state.paused))
    return property
  }
  state.refreshCallbacks = () => { for (const refresh of refreshers) refresh() }
  const config = () => state.config
  const color = callback((time, result) => {
    const c = config(), factor = state.kind === 'diffusion' ? 1 - phase(time)
      : ['pulse', 'wall', 'polygon'].includes(state.kind) ? 0.25 + 0.75 * pulse(phase(time)) : 1
    return Color.fromAlpha(c.color, c.color.alpha * factor, result as Color | undefined)
  })
  const material = new ColorMaterialProperty(color)
  const glow = new PolylineGlowMaterialProperty({ color, glowPower: callback(() => config().glowPower) })
  const width = callback(() => config().width)
  return { state, phase, config, color, material, glow, width, callback }
}
export type RenderContext = ReturnType<typeof createContext>
export type Renderer = (context: RenderContext) => Entity[]
