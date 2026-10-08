import { Color, ColorMaterialProperty, Entity } from 'cesium'
import type { RenderContext } from './context.js'
export function renderCircle({ state, phase, config , callback }: RenderContext): Entity[] {
  return Array.from({ length: config().count }, (_, index) => {
    const radius = callback(time => config().minRadius + (config().radius - config().minRadius) * phase(time, index / config().count))
    const fade = callback((time, result) => Color.fromAlpha(config().color, config().color.alpha * (1 - phase(time, index / config().count)), result as Color | undefined))
    return new Entity({ position: config().position, ellipse: { semiMajorAxis: radius, semiMinorAxis: radius, height: config().height, fill: state.kind === 'diffusion', outline: state.kind === 'ripple', outlineColor: fade, material: new ColorMaterialProperty(fade) } })
  })
}
