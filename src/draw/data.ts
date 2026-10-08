import { copyJSON } from '../internal/json.js'
export { copyJSON } from '../internal/json.js'
import { Cartesian3, Color, createGuid } from 'cesium'
import { CoordinateKit } from '../coordinate/index.js'
import { clonePosition, finite } from '../internal/index.js'
import { localArea } from '../internal/geometry.js'
import type { DrawProperties, DrawType, GeoJSONImportOptions } from './types.js'
export const snapshot = (points: readonly Cartesian3[]) => Object.freeze(points.map(p => Object.freeze(Cartesian3.clone(p))))
export function validateGeometry(type: DrawType, points: readonly Cartesian3[]): Cartesian3[] {
  if (!Array.isArray(points)) throw new TypeError('positions must be an array')
  const copy = Array.from(points, clonePosition), minimum = type === 'point' ? 1 : type === 'polyline' ? 2 : 3
  if (copy.length < minimum || copy.length > (type === 'point' ? 1 : 512)) throw new RangeError(`At least ${minimum} points are required; maximum ${type === 'point' ? 1 : 512}`)
  for (let i = 0; i < copy.length; i++) for (let j = i + 1; j < copy.length; j++) {
    if (Cartesian3.distance(copy[i]!, copy[j]!) < 1e-3) throw new RangeError('Duplicate drawing point')
  }
  if (type === 'polygon') {
    localArea(copy)
  }
  return copy
}
export function style(input: { color?: Color; width?: number }): { color: Color; width: number } {
  const color = input.color ?? Color.CYAN
  if (!(color instanceof Color) || ![color.red, color.green, color.blue, color.alpha].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw new TypeError('Invalid color')
  return { color: Color.clone(color), width: finite(input.width ?? 3, 'width', 1, 10) }
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected a GeoJSON object')
  return value as Record<string, unknown>
}
export interface ParsedFeature { id: string; featureId: string | number | undefined; type: DrawType; positions: Cartesian3[]; properties: DrawProperties }
export function parseGeoJSON(input: unknown, options: GeoJSONImportOptions): ParsedFeature[] {
  const root = record(input)
  if (root.crs !== undefined) throw new TypeError('Only WGS84 GeoJSON is supported; crs is unsupported')
  if (options.idPrefix !== undefined && (typeof options.idPrefix !== 'string' || !options.idPrefix.trim())) throw new TypeError('idPrefix must be a non-empty string')
  const features = root.type === 'FeatureCollection' ? root.features : [root]
  if (!Array.isArray(features) || features.length > 1000) throw new RangeError('FeatureCollection must contain at most 1000 features')
  const used = new Set<string>()
  return features.map(raw => {
    const feature = record(raw), isFeature = feature.type === 'Feature'
    if (feature.crs !== undefined) throw new TypeError('crs is unsupported')
    const geometry = isFeature ? record(feature.geometry) : feature
    if (geometry.crs !== undefined) throw new TypeError('crs is unsupported')
    const type: DrawType = geometry.type === 'Point' ? 'point' : geometry.type === 'LineString' ? 'polyline' : geometry.type === 'Polygon' ? 'polygon' : (() => { throw new TypeError('Only Point, LineString and single-ring Polygon are supported') })()
    const coordinate = (raw: unknown): Cartesian3 => {
      if (!Array.isArray(raw) || raw.length < 2 || raw.length > 3) throw new TypeError('Coordinates require [longitude, latitude, height?]')
      finite(raw[0], 'longitude', -180, 180); finite(raw[1], 'latitude', -90, 90)
      return CoordinateKit.fromDegrees(raw[0], raw[1], raw.length === 3 ? finite(raw[2], 'height') : 0)
    }
    let positions: Cartesian3[]
    if (type === 'point') positions = [coordinate(geometry.coordinates)]
    else {
      let coordinates = geometry.coordinates
      if (type === 'polygon') {
        if (!Array.isArray(coordinates) || coordinates.length !== 1) throw new RangeError('Polygon holes are unsupported')
        coordinates = coordinates[0]
      }
      if (!Array.isArray(coordinates) || coordinates.length > (type === 'polygon' ? 513 : 512)) throw new RangeError('Invalid coordinate count')
      positions = Array.from(coordinates, coordinate)
      if (type === 'polygon') {
        if (positions.length < 4 || !Cartesian3.equalsEpsilon(positions[0]!, positions.at(-1)!, 0, 1e-3)) throw new RangeError('GeoJSON polygon ring must be closed')
        positions.pop()
      }
    }
    positions = validateGeometry(type, positions)
    const rawProperties = isFeature ? feature.properties ?? null : null
    if (rawProperties !== null) record(rawProperties)
    const properties = copyJSON(rawProperties, true) as DrawProperties
    const featureId = isFeature ? feature.id : undefined
    if (featureId !== undefined && !(typeof featureId === 'string' && featureId.trim() || typeof featureId === 'number' && Number.isFinite(featureId))) throw new TypeError('Feature id must be a non-empty string or finite number')
    const businessId = featureId ?? (typeof properties?.id === 'string' && properties.id.trim() ? properties.id : undefined)
    const id = (options.idPrefix ?? '') + (businessId === undefined ? createGuid() : String(businessId))
    if (used.has(id)) throw new Error(`Duplicate drawing id: ${id}`)
    used.add(id)
    return { id, featureId: featureId as string | number | undefined, type, positions, properties }
  })
}
