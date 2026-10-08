import { UrlTemplateImageryProvider, WebMapTileServiceImageryProvider, WebMapServiceImageryProvider, WebMercatorTilingScheme, type ImageryProvider } from 'cesium'
import { finite } from '../internal/index.js'
export interface AmapLayerOptions extends Omit<UrlTemplateImageryProvider.ConstructorOptions, 'url'> {
  /** Application-supplied XYZ endpoint; no undocumented tile server is built in. */
  url: string; id?: string; alpha?: number; show?: boolean
}
export interface TiandituLayerOptions {
  key: string; layer?: 'vec' | 'cva' | 'img' | 'cia' | 'ter' | 'cta' | 'ibo'
  id?: string; alpha?: number; show?: boolean; maximumLevel?: number
}
export type ImagerySource =
  | { type: 'xyz'; options: UrlTemplateImageryProvider.ConstructorOptions }
  | { type: 'wmts'; options: WebMapTileServiceImageryProvider.ConstructorOptions }
  | { type: 'wms'; options: WebMapServiceImageryProvider.ConstructorOptions }
  | { type: 'amap'; options: AmapLayerOptions }
  | { type: 'tianditu'; options: TiandituLayerOptions }

/** Construct a native provider without attaching it to a Viewer. */
export function createImageryProvider(source: ImagerySource): ImageryProvider {
  if (!source || !source.options) throw new TypeError('imagery source options are required')
  switch (source.type) {
    case 'xyz': return new UrlTemplateImageryProvider(source.options)
    case 'wmts': return new WebMapTileServiceImageryProvider(source.options)
    case 'wms': return new WebMapServiceImageryProvider(source.options)
    case 'amap': return createAmapImageryProvider(source.options)
    case 'tianditu': return createTiandituImageryProvider(source.options)
    default: throw new TypeError('Unknown imagery source type')
  }
}
export function createAmapImageryProvider(options: AmapLayerOptions): UrlTemplateImageryProvider {
  if (!options || typeof options.url !== 'string' || !options.url.trim()) throw new TypeError('Amap XYZ url is required')
  if (!['{x}', '{y}', '{z}'].every(part => options.url.includes(part))) throw new TypeError('XYZ url must contain {x}, {y} and {z}')
  const { id: _id, alpha: _alpha, show: _show, ...provider } = options
  return new UrlTemplateImageryProvider({ ...provider, tilingScheme: provider.tilingScheme ?? new WebMercatorTilingScheme(), credit: provider.credit ?? '高德地图' })
}
export function createTiandituImageryProvider(options: TiandituLayerOptions): WebMapTileServiceImageryProvider {
  if (!options || typeof options.key !== 'string' || !options.key.trim()) throw new TypeError('Tianditu key is required')
  const layer = options.layer ?? 'vec'
  if (!['vec', 'cva', 'img', 'cia', 'ter', 'cta', 'ibo'].includes(layer)) throw new TypeError('Invalid Tianditu layer')
  const maximumLevel = finite(options.maximumLevel ?? 18, 'maximumLevel', 1, 18)
  if (!Number.isInteger(maximumLevel)) throw new RangeError('maximumLevel must be an integer')
  return new WebMapTileServiceImageryProvider({
    url: `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?tk=${encodeURIComponent(options.key)}`,
    layer, style: 'default', format: 'tiles', tileMatrixSetID: 'w',
    tilingScheme: new WebMercatorTilingScheme(), minimumLevel: 1, maximumLevel,
    subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'], credit: '天地图'
  })
}
