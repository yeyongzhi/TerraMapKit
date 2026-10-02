import { createGuid, ImageryLayer, type ImageryProvider, type Viewer } from 'cesium'

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
    if (this.layers.has(id) || this.pending.has(id)) throw new Error(`Duplicate layer id: ${id}`)
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
    const owned = [...this.layers.values()]
    this.layers.clear()
    this.pending.clear()
    for (const layer of owned) this.release(layer)
  }
}
