import { Entity } from 'cesium'
import type { RenderContext } from './context.js'
export function renderWall({ config, material }: RenderContext): Entity[] {
  const c = config()
  return [new Entity({ wall: { positions: [...c.points, c.points[0]!], minimumHeights: [...c.heights, c.heights[0]!], maximumHeights: [...c.heights, c.heights[0]!].map(h => h + c.wallHeight), material } })]
}
