import { Entity } from 'cesium'
import type { RenderContext } from './context.js'
export function renderGlow({ config, glow, width }: RenderContext): Entity[] {
  return [new Entity({ polyline: { positions: config().points, width, material: glow, clampToGround: false } })]
}
