import { Rectangle, SingleTileImageryProvider, type ImageryLayer } from 'cesium'
import { finite } from '../internal/index.js'

export interface HeatmapPoint { longitude: number; latitude: number; value: number }
export interface HeatmapBounds { west: number; south: number; east: number; north: number }
export interface HeatmapLayerOptions {
  id?: string
  data: readonly HeatmapPoint[]
  bounds: HeatmapBounds
  /** Texture dimensions; radius is in texture pixels, not screen pixels. */
  width?: number
  height?: number
  radius?: number
  /** Fixed range for accumulated weights. */
  min?: number
  max?: number
  alpha?: number
  show?: boolean
}
export interface HeatmapLayerHandle {
  readonly id: string
  readonly kind: 'heatmap'
  readonly layer: ImageryLayer
  setData(data: readonly HeatmapPoint[]): Promise<void>
  setVisible(show: boolean): void
  remove(): boolean
}

/** Pure rasterization shared by the browser adapter and numerical tests. */
export function rasterizeHeatmap(options: HeatmapLayerOptions): { pixels: Uint8ClampedArray; width: number; height: number; bounds: HeatmapBounds } {
  const bounds = { ...options.bounds }
  finite(bounds.west, 'west', -180, 180); finite(bounds.east, 'east', -180, 180)
  finite(bounds.south, 'south', -85, 85); finite(bounds.north, 'north', -85, 85)
  if (bounds.west >= bounds.east || bounds.south >= bounds.north) throw new RangeError('bounds must have positive extent without crossing the date line')
  const width = finite(options.width ?? 512, 'width', 16, 2048)
  const height = finite(options.height ?? 512, 'height', 16, 2048)
  if (!Number.isInteger(width) || !Number.isInteger(height)) throw new RangeError('texture dimensions must be integers')
  const radius = finite(options.radius ?? 24, 'radius', 1, 128)
  const min = finite(options.min ?? 0, 'min', 0)
  const max = finite(options.max ?? 1, 'max', 0)
  if (max <= min) throw new RangeError('max must exceed min')
  if (!Array.isArray(options.data)) throw new TypeError('data must be an array')
  // Bound CPU kernel work before allocating or drawing.
  if (options.data.length * (2 * Math.ceil(radius) + 1) ** 2 > 50_000_000) throw new RangeError('heatmap kernel work exceeds 50 million samples; reduce data or radius')
  const points = options.data.map(point => ({
    longitude: finite(point.longitude, 'longitude', -180, 180),
    latitude: finite(point.latitude, 'latitude', -90, 90),
    value: finite(point.value, 'value', 0)
  }))
  const density = new Float64Array(width * height)
  for (const point of points) {
    if (point.longitude < bounds.west || point.longitude > bounds.east || point.latitude < bounds.south || point.latitude > bounds.north || point.value === 0) continue
    const cx = (point.longitude - bounds.west) / (bounds.east - bounds.west) * (width - 1)
    const cy = (bounds.north - point.latitude) / (bounds.north - bounds.south) * (height - 1)
    for (let y = Math.max(0, Math.ceil(cy - radius)); y <= Math.min(height - 1, Math.floor(cy + radius)); y++) {
      for (let x = Math.max(0, Math.ceil(cx - radius)); x <= Math.min(width - 1, Math.floor(cx + radius)); x++) {
        const distance = ((x - cx) ** 2 + (y - cy) ** 2) / radius ** 2
        if (distance < 1) density[y * width + x]! += point.value * (1 - distance) ** 2
      }
    }
  }
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < density.length; i++) {
    const value = density[i]!
    if (value <= min) continue
    const t = Math.min(1, (value - min) / (max - min))
    // Blue -> cyan -> green -> yellow -> red, with transparent low density.
    const hue = (1 - t) * 4
    pixels[i * 4] = 255 * Math.max(0, Math.min(1, 2 - Math.abs(hue)))
    pixels[i * 4 + 1] = 255 * Math.max(0, Math.min(1, 2 - Math.abs(hue - 2)))
    pixels[i * 4 + 2] = 255 * Math.max(0, Math.min(1, hue - 2))
    pixels[i * 4 + 3] = 255 * Math.min(1, t * 2)
  }
  return { pixels, width, height, bounds }
}

export async function heatmapProvider(options: HeatmapLayerOptions): Promise<SingleTileImageryProvider> {
  const raster = rasterizeHeatmap(options)
  if (typeof document === 'undefined') throw new Error('Heatmap layers require a browser Canvas')
  const canvas = document.createElement('canvas')
  canvas.width = raster.width; canvas.height = raster.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D is unavailable')
  const image = context.createImageData(raster.width, raster.height)
  image.data.set(raster.pixels); context.putImageData(image, 0, 0)
  return SingleTileImageryProvider.fromUrl(canvas.toDataURL('image/png'), {
    rectangle: Rectangle.fromDegrees(raster.bounds.west, raster.bounds.south, raster.bounds.east, raster.bounds.north)
  })
}
