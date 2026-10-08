import { Entity, PolygonHierarchy } from 'cesium'
import type { RenderContext } from './context.js'
export function renderPolygon({ config, material }: RenderContext): Entity[] {
  return [new Entity({ polygon: { hierarchy: new PolygonHierarchy(config().points), perPositionHeight: true, material } })]
}
