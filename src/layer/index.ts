import { createGuid, ImageryLayer, Rectangle, Cartographic, type ImageryProvider, type Viewer } from 'cesium'
import { heatmapProvider, type HeatmapLayerHandle, type HeatmapLayerOptions } from './heatmap.js'
import { clusterEntities, createClusterSource, disposeCluster, type ClusterLayerHandle, type ClusterLayerOptions } from './cluster.js'
import { createAmapImageryProvider, createTiandituImageryProvider, createImageryProvider, type ImagerySource, type AmapLayerOptions, type TiandituLayerOptions } from './basemaps.js'
import { copyJSON } from '../internal/json.js'
export { parseWmtsCapabilities, type WmtsLayerDescription } from './wmts.js'
export { createAmapImageryProvider, createTiandituImageryProvider, createImageryProvider } from './basemaps.js'
export type { AmapLayerOptions, TiandituLayerOptions, ImagerySource } from './basemaps.js'
export type { HeatmapPoint, HeatmapBounds, HeatmapLayerOptions, HeatmapLayerHandle } from './heatmap.js'
export type { ClusterPoint, ClusterLayerOptions, ClusterLayerHandle } from './cluster.js'
export type DataLayerHandle = HeatmapLayerHandle | ClusterLayerHandle

export interface ImageLayerOptions {
  id?: string
  provider: ImageryProvider | Promise<ImageryProvider>
  alpha?: number
  show?: boolean
}
export interface ImageryAppearance { alpha?: number; show?: boolean; brightness?: number; contrast?: number; saturation?: number; gamma?: number; hue?: number }
export interface ImageLayerConfiguration { id: string; source: ImagerySource; appearance: ImageryAppearance }
export interface BaseLayerOptions extends Omit<ImageLayerOptions, 'id'> {
  /** Optional annotation layer, committed and removed together with the base. */
  annotations?: ImageryProvider | Promise<ImageryProvider>
  /** Total provider/tile preflight deadline; default 10000 ms. */
  timeoutMs?: number
}

/** Owns only imagery layers created by this instance; never destroys the Viewer. */
export class LayerKit {
  private readonly sourceConfigurations = new Map<string, ImagerySource>()
  private readonly tileSubscriptions = new Map<ImageryLayer, Set<() => void>>()
  async addSourceLayer(source: ImagerySource, options: Omit<ImageLayerOptions, 'provider'> = {}): Promise<ImageryLayer> {
    this.assertActive(); const saved = copyJSON(source) as unknown as ImagerySource, id = options.id ?? createGuid()
    const layer = await this.addImageLayer({ ...options, id, provider: createImageryProvider(saved) })
    this.sourceConfigurations.set(id, saved); return layer
  }
  exportConfiguration(includeSecrets = false): readonly ImageLayerConfiguration[] {
    this.assertActive(); if (typeof includeSecrets !== 'boolean') throw new TypeError('includeSecrets must be boolean')
    const result: ImageLayerConfiguration[] = []
    for (const [id, source] of this.sourceConfigurations) {
      const layer = this.getImageLayer(id); if (!layer) { this.sourceConfigurations.delete(id); continue }
      const copy = copyJSON(source) as unknown as ImagerySource
      if (!includeSecrets) {
        const options = copy.options as unknown as Record<string, unknown>
        for (const key of ['key', 'token', 'accessToken']) if (key in options) options[key] = 'REDACTED'
        if (typeof options.url === 'string') options.url = options.url.replace(/([?&](?:tk|key|token|access_token)=)[^&]*/gi, '$1REDACTED')
      }
      result.push({ id, source: copy, appearance: { alpha: layer.alpha, show: layer.show, brightness: layer.brightness, contrast: layer.contrast, saturation: layer.saturation, gamma: layer.gamma, hue: layer.hue } })
    }
    return result.sort((a, b) => this.viewer.imageryLayers.indexOf(this.getImageLayer(a.id)!) - this.viewer.imageryLayers.indexOf(this.getImageLayer(b.id)!))
  }
  async importConfiguration(input: readonly ImageLayerConfiguration[], resolveSource: (source: ImagerySource) => ImagerySource = source => source): Promise<readonly ImageryLayer[]> {
    this.assertActive(); if (!Array.isArray(input) || input.length > 1000 || typeof resolveSource !== 'function') throw new TypeError('Invalid image configuration')
    const ids = new Set<string>()
    const prepared = Array.from(input, entry => { if (!entry || typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id) || this.getLayer(entry.id) || this.pending.has(entry.id)) throw new Error('Conflicting image configuration id'); ids.add(entry.id); return { ...entry, source: resolveSource(copyJSON(entry.source) as unknown as ImagerySource) } })
    const layers: ImageryLayer[] = []
    try { for (const entry of prepared) { const layer = await this.addSourceLayer(entry.source, { id: entry.id }); layers.push(layer); this.setAppearance(entry.id, entry.appearance) }; return layers }
    catch (error) { for (const layer of layers) this.removeImageLayer(layer); throw error }
  }
  setGroupVisible(ids: readonly string[], show: boolean): void {
    this.assertActive(); if (!Array.isArray(ids) || typeof show !== 'boolean') throw new TypeError('Invalid group visibility')
    const layers = Array.from(ids, id => { const layer = this.getImageLayer(id); if (!layer) throw new Error('Unknown image layer'); return layer })
    for (const layer of layers) layer.show = show; this.viewer.scene.requestRender()
  }
  onTileError(id: string, callback: (error: unknown) => void): () => void {
    this.assertActive(); const layer = this.getImageLayer(id); if (!layer || typeof callback !== 'function') throw new TypeError('Invalid layer/callback')
    let set = this.tileSubscriptions.get(layer); if (!set) { set = new Set(); this.tileSubscriptions.set(layer, set) }
    const native = layer.imageryProvider.errorEvent.addEventListener(callback), off = () => { native(); set!.delete(off) }; set.add(off); return off
  }
  queryFeatures(id: string, longitude: number, latitude: number, level: number) {
    this.assertActive(); if (!Number.isInteger(level) || level < 0 || level > 30 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new RangeError('Invalid feature query coordinate/level')
    const layer = this.getImageLayer(id); if (!layer) throw new Error('Unknown image layer')
    const p = Cartographic.fromDegrees(longitude, latitude), provider = layer.imageryProvider, tile = provider.tilingScheme.positionToTileXY(p, level)
    return tile && provider.pickFeatures(tile.x, tile.y, level, p.longitude, p.latitude)
  }
  setAppearance(id: string, options: ImageryAppearance): void {
    this.assertActive(); if (!options || typeof options !== 'object') throw new TypeError('appearance is required')
    for (const key of ['alpha', 'brightness', 'contrast', 'saturation', 'gamma', 'hue'] as const) {
      const value = options[key]; if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || key !== 'hue' && value < 0 || key === 'alpha' && value > 1 || key === 'gamma' && value === 0)) throw new RangeError(`Invalid ${key}`)
    }
    if (options.show !== undefined && typeof options.show !== 'boolean') throw new TypeError('show must be boolean')
    const layer = this.getImageLayer(id); if (!layer) throw new Error('Unknown image layer')
    Object.assign(layer, options); this.viewer.scene.requestRender()
  }
  moveImageLayer(id: string, index: number): void {
    this.assertActive(); const layers = this.viewer.imageryLayers, layer = this.getImageLayer(id)
    if (!layer) throw new Error('Unknown image layer'); if (!Number.isInteger(index) || index < 0 || index >= layers.length) throw new RangeError('Invalid layer index')
    while (layers.indexOf(layer) < index) layers.raise(layer)
    while (layers.indexOf(layer) > index) layers.lower(layer)
    this.viewer.scene.requestRender()
  }
  private readonly layers = new Map<string, ImageryLayer>()
  private readonly pending = new Set<string>()
  private disposed = false
  private readonly dataLayers = new Map<string, DataLayerHandle>()
  private baseRevision = 0
  private baseAbort: AbortController | undefined
  private base: { primary: ImageryLayer; entries: [string, ImageryLayer][] } | undefined

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

  getBaseLayer(): ImageryLayer | undefined {
    this.assertActive()
    const base = this.base
    if (base && base.entries.some(([, layer]) => layer.isDestroyed() || !this.viewer.imageryLayers.contains(layer))) {
      this.removeBaseLayer()
      return undefined
    }
    return base?.primary
  }

  removeBaseLayer(): boolean {
    this.baseRevision++
    this.baseAbort?.abort(new Error('Base layer switch was cancelled')); this.baseAbort = undefined
    const previous = this.base; this.base = undefined
    const errors: unknown[] = []
    for (const [id, layer] of previous?.entries ?? []) {
      this.layers.delete(id)
      try { this.release(layer) } catch (error) { errors.push(error) }
    }
    if (!this.disposed && !this.viewer.isDestroyed()) this.viewer.scene?.requestRender()
    if (errors.length) throw errors[0]
    return Boolean(previous)
  }

  async setBaseLayer(options: BaseLayerOptions): Promise<ImageryLayer> {
    this.assertActive()
    if (!options || typeof options !== 'object') throw new TypeError('options are required')
    const { provider, annotations, alpha = 1, show = true, timeoutMs = 10000 } = options
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new RangeError('alpha must be between 0 and 1')
    if (typeof show !== 'boolean') throw new TypeError('show must be boolean')
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new RangeError('timeoutMs must be an integer in 1–60000')
    const version = ++this.baseRevision
    this.baseAbort?.abort(new Error('Base layer switch was superseded'))
    const controller = new AbortController(); this.baseAbort = controller
    const timer = setTimeout(() => controller.abort(new Error('Base layer loading timed out')), timeoutMs)
    const entries: [string, ImageryLayer][] = []
    let committed = false
    const active = () => {
      this.assertActive()
      if (controller.signal.aborted) throw controller.signal.reason
      if (version !== this.baseRevision) throw new Error('Base layer switch was superseded')
    }
    const wait = async <T>(value: T | PromiseLike<T>): Promise<T> => {
      const observed = Promise.resolve(value)
      void observed.catch(() => {})
      active()
      let off: () => void = () => {}
      try {
        return await Promise.race([observed, new Promise<never>((_, reject) => {
          const abort = () => reject(controller.signal.reason)
          controller.signal.addEventListener('abort', abort, { once: true })
          off = () => controller.signal.removeEventListener('abort', abort)
        })])
      } finally { off() }
    }
    // Observe both inputs immediately, even if the primary fails first.
    const providers = Promise.all([Promise.resolve(provider), ...(annotations === undefined ? [] : [Promise.resolve(annotations)])])
    try {
      const resolved = await wait(providers)
      for (const item of resolved) {
        active()
        if (!item || typeof item.requestImage !== 'function' || !item.tilingScheme || !item.rectangle) throw new TypeError('provider must be a Cesium ImageryProvider')
        const level = item.minimumLevel ?? 0
        const tile = item.tilingScheme.positionToTileXY(Rectangle.center(item.rectangle), level)
        if (!tile) throw new Error('Provider rectangle has no valid tile')
        const image = await wait(item.requestImage(tile.x, tile.y, level))
        if (!image) throw new Error('Provider did not return a preflight tile; retry the switch')
        active()
      }
      const previous = this.base
      const index = previous && this.viewer.imageryLayers.contains(previous.primary) ? this.viewer.imageryLayers.indexOf(previous.primary) : 0
      for (const [offset, item] of resolved.entries()) {
        active()
        const layer = new ImageryLayer(item, { alpha, show }), id = createGuid()
        entries.push([id, layer]); this.layers.set(id, layer)
        this.viewer.imageryLayers.add(layer, index + offset)
        active()
        if (layer.isDestroyed() || !this.viewer.imageryLayers.contains(layer)) throw new Error('Base layer was removed during creation')
      }
      if (entries.some(([, layer]) => layer.isDestroyed() || !this.viewer.imageryLayers.contains(layer))) throw new Error('Base layer was removed during creation')
      this.base = { primary: entries[0]![1], entries }
      committed = true
      let removalError: unknown, removalFailed = false
      for (const [id, layer] of previous?.entries ?? []) {
        this.layers.delete(id)
        try { this.release(layer) } catch (error) { removalFailed = true; removalError ??= error }
      }
      if (removalFailed) throw removalError
      active()
      if (entries.some(([, layer]) => layer.isDestroyed() || !this.viewer.imageryLayers.contains(layer))) throw new Error('Base layer was removed during commit')
      this.viewer.scene?.requestRender()
      return entries[0]![1]
    } catch (error) {
      if (!committed) for (const [id, layer] of entries) {
        this.layers.delete(id)
        try { this.release(layer) } catch { /* Continue rollback and retain the original creation error. */ }
      }
      throw error
    } finally {
      clearTimeout(timer)
      if (this.baseAbort === controller) this.baseAbort = undefined
    }
  }

  addAmapLayer(options: AmapLayerOptions): Promise<ImageryLayer> {
    this.assertActive()
    return this.addImageLayer({ ...(options.id === undefined ? {} : { id: options.id }), ...(options.alpha === undefined ? {} : { alpha: options.alpha }), ...(options.show === undefined ? {} : { show: options.show }), provider: createAmapImageryProvider(options) })
  }
  addTiandituLayer(options: TiandituLayerOptions): Promise<ImageryLayer> {
    this.assertActive()
    return this.addImageLayer({ ...(options.id === undefined ? {} : { id: options.id }), ...(options.alpha === undefined ? {} : { alpha: options.alpha }), ...(options.show === undefined ? {} : { show: options.show }), provider: createTiandituImageryProvider(options) })
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
    if (this.base?.entries.some(([, layer]) => layer === entry[1])) return this.removeBaseLayer()
    this.layers.delete(entry[0])
    return this.release(entry[1])
  }

  private release(layer: ImageryLayer): boolean {
    for (const off of this.tileSubscriptions.get(layer) ?? []) off(); this.tileSubscriptions.delete(layer)
    for (const id of this.sourceConfigurations.keys()) if (this.layers.get(id) === layer || !this.layers.has(id)) this.sourceConfigurations.delete(id)
    const destroyed = layer.isDestroyed()
    if (!this.viewer.isDestroyed() && this.viewer.imageryLayers.contains(layer)) {
      try { return this.viewer.imageryLayers.remove(layer, !destroyed) }
      catch (error) {
        // Cesium raises layerRemoved before destroy; a user callback may throw.
        if (!layer.isDestroyed() && !this.viewer.imageryLayers.contains(layer)) layer.destroy()
        throw error
      }
    }
    // Also release a layer detached externally with destroy=false.
    if (!destroyed) layer.destroy()
    return false
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const errors: unknown[] = []
    try { this.removeBaseLayer() } catch (error) { errors.push(error) }
    for (const layer of [...this.dataLayers.values()]) layer.remove()
    const owned = [...this.layers.values()]
    this.layers.clear()
    this.pending.clear()
    for (const layer of owned) this.release(layer)
    if (errors.length) throw errors[0]
  }
}
