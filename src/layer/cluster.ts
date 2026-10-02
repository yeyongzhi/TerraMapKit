import { Cartesian2, Cartesian3, Color, CustomDataSource, Entity, LabelStyle, VerticalOrigin, type Viewer } from 'cesium'
import { finite } from '../internal/index.js'

export interface ClusterPoint { id: string; longitude: number; latitude: number; height?: number; label?: string }
export interface ClusterLayerOptions {
  id?: string
  data: readonly ClusterPoint[]
  pixelRange?: number
  minimumClusterSize?: number
  enabled?: boolean
  show?: boolean
  color?: Color
  pointSize?: number
}
export interface ClusterLayerHandle {
  readonly id: string
  readonly kind: 'cluster'
  readonly dataSource: CustomDataSource
  setData(data: readonly ClusterPoint[]): void
  setVisible(show: boolean): void
  setClustering(enabled: boolean): void
  remove(): boolean
}
export function clusterEntities(data: readonly ClusterPoint[], color: Color, pointSize: number): Entity[] {
  if (!Array.isArray(data)) throw new TypeError('data must be an array')
  const ids = new Set<string>()
  return data.map(point => {
    if (typeof point.id !== 'string' || !point.id.trim()) throw new TypeError('point id must be a non-empty string')
    if (ids.has(point.id)) throw new Error(`Duplicate point id: ${point.id}`)
    ids.add(point.id)
    if (point.label !== undefined && typeof point.label !== 'string') throw new TypeError('label must be a string')
    const position = Cartesian3.fromDegrees(finite(point.longitude, 'longitude', -180, 180), finite(point.latitude, 'latitude', -90, 90), finite(point.height ?? 0, 'height'))
    return new Entity({ id: point.id, position, point: { pixelSize: pointSize, color }, ...(point.label === undefined ? {} : { label: { text: point.label, font: '14px sans-serif', verticalOrigin: VerticalOrigin.BOTTOM } }) })
  })
}
export function createClusterSource(id: string, options: ClusterLayerOptions): { source: CustomDataSource; color: Color; pointSize: number; off: () => void } {
  const color = Color.clone(options.color ?? Color.CYAN)
  for (const component of ['red', 'green', 'blue', 'alpha'] as const) finite(color[component], `color.${component}`, 0, 1)
  const pointSize = finite(options.pointSize ?? 10, 'pointSize', 1, 128)
  const pixelRange = finite(options.pixelRange ?? 80, 'pixelRange', 0, 1000)
  const minimumClusterSize = finite(options.minimumClusterSize ?? 2, 'minimumClusterSize', 2)
  if (!Number.isInteger(minimumClusterSize)) throw new RangeError('minimumClusterSize must be an integer')
  const entities = clusterEntities(options.data, color, pointSize)
  const source = new CustomDataSource(id)
  source.show = options.show ?? true
  source.clustering.enabled = options.enabled ?? true
  source.clustering.pixelRange = pixelRange
  source.clustering.minimumClusterSize = minimumClusterSize
  for (const entity of entities) source.entities.add(entity)
  const off = source.clustering.clusterEvent.addEventListener((members, cluster) => {
    cluster.billboard.show = false
    cluster.point.show = true; cluster.point.pixelSize = pointSize * 2; cluster.point.color = color
    cluster.label.show = true; cluster.label.text = String(members.length)
    cluster.label.font = 'bold 14px sans-serif'; cluster.label.fillColor = Color.WHITE
    cluster.label.verticalOrigin = VerticalOrigin.CENTER
    cluster.label.pixelOffset = new Cartesian2(0, -pointSize * 2)
    cluster.label.style = LabelStyle.FILL_AND_OUTLINE; cluster.label.outlineColor = Color.BLACK; cluster.label.outlineWidth = 2
    // Native picks expose the constituent Entity array through primitive.id.
    cluster.point.id = members; cluster.label.id = members
  })
  return { source, color, pointSize, off }
}
export function disposeCluster(viewer: Viewer, source: CustomDataSource): void {
  if (!viewer.isDestroyed() && viewer.dataSources.contains(source)) viewer.dataSources.remove(source, true)
  else source.clustering.destroy()
}
