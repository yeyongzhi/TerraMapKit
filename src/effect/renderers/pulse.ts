import { Entity } from 'cesium'
import { pulse, type RenderContext } from './context.js'
export function renderPulse({ phase, config, color , callback }: RenderContext): Entity[] {
  return [new Entity({ position: config().position, point: {
    pixelSize: callback(time => config().minPixelSize + (config().pixelSize - config().minPixelSize) * pulse(phase(time))), color
  } })]
}
