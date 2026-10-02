import { createGuid, ImageryLayer, type ImageryProvider, type Viewer } from 'cesium'
import { heatmapProvider, type HeatmapLayerHandle, type HeatmapLayerOptions } from './heatmap.js'
import { clusterEntities, createClusterSource, disposeCluster, type ClusterLayerHandle, type ClusterLayerOptions } from './cluster.js'
export type { HeatmapPoint, HeatmapBounds, HeatmapLayerOptions, HeatmapLayerHandle } from './heatmap.js'
export type { ClusterPoint, ClusterLayerOptions, ClusterLayerHandle } from './cluster.js'
export type DataLayerHandle = HeatmapLayerHandle | ClusterLayerHandle

export interface ImageLayerOptions {
  id?: string
  provider: ImageryProvider | Promise<ImageryProvider>
  alpha?: number
  show?: boolean
}

/** Owns only imagery layers created by this instance; never destroys the Viewer. */
export class LayerKit {
  private readonly layers = new Map<string, ImageryLayer>()
  private readonly pending = new Set<string>()
  private disposed = false
  private readonly dataLayers = new Map<string, DataLayerHandle>()

  constructor(private readonly viewer: Viewer) {
    this.assertActive()
    if (!viewer.imageryLayers) throw new TypeError('viewer must expose imageryLayers')
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('LayerKit has been disposed')
    if (!this.viewer || typeof this.viewer.isDestroyed !== 'function') {
      throw new TypeError('viewer must be a Cesium Viewer')
    }
    if (this.viewer.isDestroyed()) throw new Error('Viewer has been destroyed')
  }

  async addImageLayer(options: ImageLayerOptions): Promise<ImageryLayer> {
    this.assertActive()
    if (!options || typeof options !== 'object') throw new TypeError('options are required')
    const { provider, alpha = 1, show = true } = options
    const id = options.id ?? createGuid()
    if (typeof id !== 'string' || id.trim() === '') throw new TypeError('id must be a non-empty string')
    if (typeof alpha !== 'number' || !Number.isFinite(alpha)) throw new TypeError('alpha must be finite')
    if (alpha < 0 || alpha > 1) throw new RangeError('alpha must be between 0 and 1')
    if (typeof show !== 'boolean') throw new TypeError('show must be boolean')
    this.getImageLayer(id) // Discard stale registrations before checking uniqueness.
    if (this.layers.has(id) || this.pending.has(id) || this.dataLayers.has(id)) throw new Error(`Duplicate layer id: ${id}`)
    this.pending.add(id)
    let layer: ImageryLayer | undefined
    try {
      const resolved = await provider
      this.assertActive()
      if (!resolved || typeof resolved.requestImage !== 'function') {
        throw new TypeError('provider must be a Cesium ImageryProvider')
      }
      layer = new ImageryLayer(resolved, { alpha, show })
      // Register before Cesium raises synchronous layerAdded callbacks.
      this.layers.set(id, layer)
      this.viewer.imageryLayers.add(layer)
      this.assertActive()
      if (layer.isDestroyed() || !this.viewer.imageryLayers.contains(layer)) {
        throw new Error('Layer was removed during creation')
      }
      return layer
    } catch (error) {
      if (layer) {
        this.layers.delete(id)
        this.release(layer)
      }
      throw error
    } finally {
      this.pending.delete(id)
    }
  }

  private reserveDataLayer(options: { id?: string; show?: boolean }): string {
    this.assertActive()
    if (!options || typeof options !== 'object') throw new TypeError('options are required')
    const id = options.id ?? createGuid()
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('id must be a non-empty string')
    if (options.show !== undefined && typeof options.show !== 'boolean') throw new TypeError('show must be boolean')
    this.getImageLayer(id)
    if (this.layers.has(id) || this.pending.has(id) || this.dataLayers.has(id)) throw new Error(`Duplicate layer id: ${id}`)
    this.pending.add(id)
    return id
  }

  async addHeatmapLayer(options: HeatmapLayerOptions): Promise<HeatmapLayerHandle> {
    const id = this.reserveDataLayer(options)
    const settings = { ...options, bounds: { ...options.bounds } }
    let current: ImageryLayer | undefined
    let removed = false
    let revision = 0
    const assert = () => {
      this.assertActive()
      if (removed) throw new Error('Heatmap layer has been removed')
      if (current && (current.isDestroyed() || !this.viewer.imageryLayers.contains(current))) throw new Error('Heatmap layer was removed externally')
    }
    const update = async (data: HeatmapLayerOptions['data']) => {
      assert()
      const version = ++revision
      const provider = await heatmapProvider({ ...settings, data })
      assert()
      if (version !== revision) throw new Error('Heatmap update was superseded')
      const previous = current
      const index = previous ? this.viewer.imageryLayers.indexOf(previous) : undefined
      const next = new ImageryLayer(provider, { alpha: previous?.alpha ?? settings.alpha ?? 0.75, show: previous?.show ?? settings.show ?? true })
      current = next
      try {
        this.viewer.imageryLayers.add(next, index)
        assert()
      } catch (error) {
        this.release(next)
        current = previous
        if (removed && previous) this.release(previous)
        throw error
      }
      if (previous) this.release(previous)
      this.viewer.scene?.requestRender()
    }
    const handle: HeatmapLayerHandle = {
      id, kind: 'heatmap',
      get layer() { assert(); return current! },
      setData: update,
      setVisible: show => { assert(); if (typeof show !== 'boolean') throw new TypeError('show must be boolean'); current!.show = show; this.viewer.scene?.requestRender() },
      remove: () => {
        if (removed) return false
        removed = true; revision++; this.dataLayers.delete(id)
        if (current) this.release(current)
        return true
      }
    }
    this.dataLayers.set(id, handle)
    try {
      if (!Number.isFinite(settings.alpha ?? 0.75) || (settings.alpha ?? 0.75) < 0 || (settings.alpha ?? 0.75) > 1) throw new RangeError('alpha must be between 0 and 1')
      await update(options.data)
      return handle
    } catch (error) { handle.remove(); throw error }
    finally { this.pending.delete(id) }
  }

  async addClusterLayer(options: ClusterLayerOptions): Promise<ClusterLayerHandle> {
    const id = this.reserveDataLayer(options)
    let handle: ClusterLayerHandle | undefined
    let cleanup: (() => void) | undefined
    try {
      if (!this.viewer.dataSources) throw new TypeError('viewer must expose dataSources')
      if (options.enabled !== undefined && typeof options.enabled !== 'boolean') throw new TypeError('enabled must be boolean')
      const { source, color, pointSize, off } = createClusterSource(id, options)
      cleanup = () => { off(); disposeCluster(this.viewer, source) }
      let removed = false
      const assert = () => { this.assertActive(); if (removed) throw new Error('Cluster layer has been removed'); if (!this.viewer.dataSources.contains(source)) throw new Error('Cluster layer was removed externally') }
      handle = {
        id, kind: 'cluster', dataSource: source,
        setData: data => {
          assert()
          const entities = clusterEntities(data, color, pointSize)
          source.entities.suspendEvents()
          try { source.entities.removeAll(); for (const entity of entities) source.entities.add(entity) }
          finally { source.entities.resumeEvents() }
          this.viewer.scene?.requestRender()
        },
        setVisible: show => { assert(); if (typeof show !== 'boolean') throw new TypeError('show must be boolean'); source.show = show; this.viewer.scene?.requestRender() },
        setClustering: enabled => { assert(); if (typeof enabled !== 'boolean') throw new TypeError('enabled must be boolean'); source.clustering.enabled = enabled; this.viewer.scene?.requestRender() },
        remove: () => { if (removed) return false; removed = true; this.dataLayers.delete(id); off(); disposeCluster(this.viewer, source); return true }
      }
      this.dataLayers.set(id, handle)
      await this.viewer.dataSources.add(source)
      assert()
      this.viewer.scene?.requestRender()
      return handle
    } catch (error) { handle?.remove(); cleanup?.(); throw error }
    finally { this.pending.delete(id) }
  }

  getLayer(id: string): ImageryLayer | DataLayerHandle | undefined {
    this.assertActive()
    if (this.pending.has(id)) return undefined
    const handle = this.dataLayers.get(id)
    if (handle) {
      if (handle.kind === 'cluster' && !this.viewer.dataSources.contains(handle.dataSource)) { handle.remove(); return undefined }
      if (handle.kind === 'heatmap') {
        try { handle.layer } catch { handle.remove(); return undefined }
      }
      return handle
    }
    return this.getImageLayer(id)
  }

  removeLayer(id: string): boolean {
    return this.dataLayers.get(id)?.remove() ?? this.removeImageLayer(id)
  }

  getImageLayer(id: string): ImageryLayer | undefined {
    this.assertActive()
    const layer = this.layers.get(id)
    if (layer && (layer.isDestroyed() || !this.viewer.imageryLayers.contains(layer))) {
      this.layers.delete(id)
      this.release(layer)
      return undefined
    }
    return layer
  }

  removeImageLayer(idOrLayer: string | ImageryLayer): boolean {
    if (this.disposed) return false
    const entry = typeof idOrLayer === 'string'
      ? [idOrLayer, this.layers.get(idOrLayer)] as const
      : [...this.layers.entries()].find(([, layer]) => layer === idOrLayer)
    if (!entry || !entry[1]) return false
    this.layers.delete(entry[0])
    return this.release(entry[1])
  }

  private release(layer: ImageryLayer): boolean {
    const destroyed = layer.isDestroyed()
    if (!this.viewer.isDestroyed() && this.viewer.imageryLayers.contains(layer)) {
      return this.viewer.imageryLayers.remove(layer, !destroyed)
    }
    // Also release a layer detached externally with destroy=false.
    if (!destroyed) layer.destroy()
    return false
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const layer of [...this.dataLayers.values()]) layer.remove()
    const owned = [...this.layers.values()]
    this.layers.clear()
    this.pending.clear()
    for (const layer of owned) this.release(layer)
  }
}
