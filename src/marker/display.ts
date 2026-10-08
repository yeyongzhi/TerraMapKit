import { DistanceDisplayCondition, NearFarScalar } from 'cesium'
import { finite } from '../internal/index.js'
export interface DistanceRange { near: number; far: number }
export interface DistanceScalar extends DistanceRange { nearValue: number; farValue: number }
export interface MarkerDisplayOptions {
  distance?: DistanceRange
  scale?: DistanceScalar
  translucency?: DistanceScalar
  disableDepthTestDistance?: number | undefined
}
export interface MarkerNativeDisplayOptions {
  distanceDisplayCondition?: DistanceDisplayCondition
  scaleByDistance?: NearFarScalar
  translucencyByDistance?: NearFarScalar
  disableDepthTestDistance: number
}
/** Creates independent native values for points, billboards and labels. Distances in metres. */
export function createMarkerDisplayOptions(options: MarkerDisplayOptions = {}): MarkerNativeDisplayOptions {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('display must be an object')
  const range = (v: DistanceRange) => {
    if (!v || typeof v !== 'object') throw new TypeError('range must be an object')
    finite(v.near, 'near', 0); finite(v.far, 'far', 0)
    if (v.far <= v.near) throw new RangeError('far must exceed near')
  }
  const scalar = (v: DistanceScalar | undefined, max: number) => {
    if (v === undefined) return undefined
    range(v); finite(v.nearValue, 'nearValue', 0, max); finite(v.farValue, 'farValue', 0, max)
    return new NearFarScalar(v.near, v.nearValue, v.far, v.farValue)
  }
  let distanceDisplayCondition: DistanceDisplayCondition | undefined
  if (options.distance !== undefined) { range(options.distance); distanceDisplayCondition = new DistanceDisplayCondition(options.distance.near, options.distance.far) }
  const depth = options.disableDepthTestDistance === undefined ? 0 : options.disableDepthTestDistance
  if (depth !== Infinity) finite(depth, 'disableDepthTestDistance', 0)
  const scaleByDistance = scalar(options.scale, Infinity), translucencyByDistance = scalar(options.translucency, 1)
  return { ...(distanceDisplayCondition && { distanceDisplayCondition }), ...(scaleByDistance && { scaleByDistance }), ...(translucencyByDistance && { translucencyByDistance }), disableDepthTestDistance: depth }
}
export function copyDisplay(value: MarkerDisplayOptions | undefined): MarkerDisplayOptions | undefined {
  if (value === undefined) return undefined
  createMarkerDisplayOptions(value)
  return { ...(value.distance && { distance: { ...value.distance } }), ...(value.scale && { scale: { ...value.scale } }), ...(value.translucency && { translucency: { ...value.translucency } }), ...(value.disableDepthTestDistance !== undefined && { disableDepthTestDistance: value.disableDepthTestDistance }) }
}
