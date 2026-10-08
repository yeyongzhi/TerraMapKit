import { Cartesian2, Color } from 'cesium'
import type { DegreesPoint } from '../coordinate/index.js'
import { CoordinateKit } from '../coordinate/index.js'
import { copyJSON, type JSONValue } from '../internal/json.js'

import type { MarkerOptions } from './index.js'
import { copyDisplay, type MarkerDisplayOptions } from './display.js'
export type MarkerProperties = { readonly [key: string]: JSONValue } | null
export interface MarkerData {
  display?: Omit<MarkerDisplayOptions, 'disableDepthTestDistance'> & { disableDepthTestDistance?: number | 'infinity' }
  id: string; position: DegreesPoint; show: boolean; properties: MarkerProperties
  point?: { pixelSize?: number; color?: number[]; outlineColor?: number[]; outlineWidth?: number }
  image?: { image: string; width?: number; height?: number; scale?: number; color?: number[] }
  label?: { text: string; font?: string; fillColor?: number[]; pixelOffset?: { x: number; y: number } }
}
export function metadata(value: unknown): MarkerProperties {
  if (value !== null && (typeof value !== 'object' || Array.isArray(value))) throw new TypeError('properties must be a JSON object or null')
  return copyJSON(value, true) as MarkerProperties
}
export function optionsSnapshot(value: MarkerOptions): MarkerOptions {
  const rgba = (c: Color | undefined) => c === undefined ? {} : { color: Color.clone(c) }
  const position = value.position
  CoordinateKit.fromDegrees(position.longitude, position.latitude, position.height ?? 0)
  return { ...value, position: Object.freeze({ longitude: position.longitude, latitude: position.latitude, height: position.height ?? 0 }),
    properties: metadata(value.properties ?? null), display: copyDisplay(value.display),
    ...(value.point ? { point: { ...value.point, ...rgba(value.point.color), ...(value.point.outlineColor ? { outlineColor: Color.clone(value.point.outlineColor) } : {}) } } : {}),
    ...(value.image ? { image: { ...value.image, ...rgba(value.image.color) } } : {}),
    ...(value.label ? { label: { ...value.label, ...(value.label.fillColor ? { fillColor: Color.clone(value.label.fillColor) } : {}), ...(value.label.pixelOffset ? { pixelOffset: Cartesian2.clone(value.label.pixelOffset) } : {}) } } : {}) }
}
export function serialize(id: string, value: MarkerOptions): MarkerData {
  const rgba = (c: Color | undefined) => c ? [c.red, c.green, c.blue, c.alpha] : undefined
  // JSON round-trip removes optional undefined fields and clones all nested metadata.
  return JSON.parse(JSON.stringify({ id, position: value.position, show: value.show ?? true, properties: value.properties ?? null,
    display: value.display && { ...copyDisplay(value.display), ...(value.display.disableDepthTestDistance === Infinity ? { disableDepthTestDistance: 'infinity' } : {}) },
    point: value.point && { ...value.point, color: rgba(value.point.color), outlineColor: rgba(value.point.outlineColor) },
    image: value.image && { ...value.image, color: rgba(value.image.color) },
    label: value.label && { ...value.label, fillColor: rgba(value.label.fillColor) } })) as MarkerData
}
export function deserialize(value: unknown): MarkerOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected a marker JSON object')
  if ('status' in value) throw new TypeError('Marker JSON does not define device status')
  const item = value as MarkerData
  const rawDisplay = (value as { display?: MarkerDisplayOptions & { disableDepthTestDistance?: unknown } }).display
  if (rawDisplay !== undefined && (!rawDisplay || typeof rawDisplay !== 'object' || Array.isArray(rawDisplay))) throw new TypeError('Invalid JSON display')
  const display = rawDisplay === undefined ? undefined : copyDisplay({ ...rawDisplay, disableDepthTestDistance: (rawDisplay as { disableDepthTestDistance?: unknown }).disableDepthTestDistance === 'infinity' ? Infinity : rawDisplay.disableDepthTestDistance })
  if (typeof item.id !== 'string' || !item.id.trim()) throw new TypeError('Imported marker id is required')
  const rgba = (value: number[] | undefined): Color | undefined => {
    if (value === undefined) return undefined
    if (!Array.isArray(value) || value.length !== 4 || !value.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) throw new TypeError('JSON color requires four RGBA components in 0–1')
    return new Color(value[0], value[1], value[2], value[3])
  }
  for (const style of [item.point, item.image, item.label]) if (style !== undefined && (!style || typeof style !== 'object' || Array.isArray(style))) throw new TypeError('Invalid marker style')
  return { id: item.id, position: item.position, show: item.show ?? true, properties: metadata(item.properties ?? null), display,
    ...(item.point ? { point: { ...item.point, ...(item.point.color === undefined ? {} : { color: rgba(item.point.color)! }), ...(item.point.outlineColor === undefined ? {} : { outlineColor: rgba(item.point.outlineColor)! }) } } : {}),
    ...(item.image ? { image: { ...item.image, ...(item.image.color === undefined ? {} : { color: rgba(item.image.color)! }) } } : {}),
    ...(item.label ? { label: { ...item.label, ...(item.label.fillColor === undefined ? {} : { fillColor: rgba(item.label.fillColor)! }), ...(item.label.pixelOffset ? { pixelOffset: new Cartesian2(item.label.pixelOffset.x, item.label.pixelOffset.y) } : {}) } } : {}) } as MarkerOptions
}
