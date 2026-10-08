import { Cesium3DTileStyle, Cesium3DTileset, createGuid, BoundingSphere, Matrix4, Color, CustomShader, ClippingPlaneCollection, ClippingPolygonCollection, type Cesium3DTileFeature, type Viewer } from 'cesium'
import { assertViewer, render } from '../internal/index.js'
import { TransformKit, type TransformOptions } from '../transform/index.js'
import { Cartesian3 } from 'cesium'
import { CoordinateKit } from '../coordinate/index.js'

export interface TilesetOptions {
  id?: string
  url: Parameters<typeof Cesium3DTileset.fromUrl>[0]
  options?: Parameters<typeof Cesium3DTileset.fromUrl>[1]
  show?: boolean
  style?: Cesium3DTileStyle | ConstructorParameters<typeof Cesium3DTileStyle>[0]
}
export class TilesetKit {
  private disposed = false
  private readonly tilesets = new Map<string, Cesium3DTileset>()
  private readonly pending = new Set<string>()
  private readonly subscriptions = new Map<string, Set<() => void>>()
  private readonly ownedShaders = new Map<string, CustomShader>()
  private readonly highlights = new Map<Cesium3DTileFeature, { original: Color; applied: Color; id: string }>()
  constructor(private readonly viewer: Viewer) { this.assertActive() }
  private assertActive(): void { assertViewer(this.viewer, this.disposed, 'TilesetKit') }
  async addTileset(options: TilesetOptions): Promise<Cesium3DTileset> {
    this.assertActive()
    if (!options?.url) throw new TypeError('url is required')
    const id = options.id ?? createGuid(), show = options.show ?? true
    if (typeof id !== 'string' || !id.trim() || typeof show !== 'boolean') throw new TypeError('Invalid id/show')
    const style = options.style === undefined ? undefined : options.style instanceof Cesium3DTileStyle ? options.style : new Cesium3DTileStyle(options.style)
    const constructorOptions = { ...options.options }
    this.getTileset(id)
    if (this.tilesets.has(id) || this.pending.has(id)) throw new Error(`Duplicate tileset id: ${id}`)
    this.pending.add(id)
    let tileset: Cesium3DTileset | undefined
    try {
      tileset = await Cesium3DTileset.fromUrl(options.url, constructorOptions)
      this.assertActive()
      tileset.show = show; tileset.style = style
      this.viewer.scene.primitives.add(tileset)
      this.assertActive()
      if (tileset.isDestroyed() || !this.viewer.scene.primitives.contains(tileset)) throw new Error('Tileset was removed during creation')
      this.tilesets.set(id, tileset)
      render(this.viewer)
      return tileset
    } catch (error) {
      if (tileset) this.release(tileset)
      throw error
    } finally { this.pending.delete(id) }
  }
  getTileset(id: string): Cesium3DTileset | undefined {
    this.assertActive()
    const tileset = this.tilesets.get(id)
    if (tileset && (tileset.isDestroyed() || !this.viewer.scene.primitives.contains(tileset))) {
      this.cleanupExtras(id)
      this.tilesets.delete(id); this.release(tileset); return undefined
    }
    return tileset
  }
  setVisible(id: string, show: boolean): void {
    if (typeof show !== 'boolean') throw new TypeError('show must be boolean')
    const tileset = this.require(id); tileset.show = show; render(this.viewer)
  }
  setStyle(id: string, style: Cesium3DTileStyle | ConstructorParameters<typeof Cesium3DTileStyle>[0]): void {
    this.require(id).style = style instanceof Cesium3DTileStyle ? style : new Cesium3DTileStyle(style)
    render(this.viewer)
  }
  setTransform(id: string, matrix: Matrix4): void { const value = TransformKit.validate(matrix); this.require(id).modelMatrix = value; render(this.viewer) }
  setPosition(id: string, position: Cartesian3, options: TransformOptions = {}): void { this.setTransform(id, TransformKit.matrix(position, options)) }
  offsetHeight(id: string, metres: number): void {
    if (!Number.isFinite(metres)) throw new TypeError('metres must be finite')
    const tileset = this.require(id), center = tileset.boundingSphere.center
    const translation = Cartesian3.subtract(CoordinateKit.offset(center, 0, 0, metres), center, new Cartesian3())
    tileset.modelMatrix = Matrix4.multiply(Matrix4.fromTranslation(translation), tileset.modelMatrix, new Matrix4()); render(this.viewer)
  }
  getBoundingSphere(id: string): BoundingSphere { return BoundingSphere.clone(this.require(id).boundingSphere) }
  getFeatureProperties(feature: Cesium3DTileFeature): Record<string, unknown> { this.assertActive(); if (!feature || typeof feature.getPropertyIds !== 'function') throw new TypeError('Invalid feature'); return Object.fromEntries(feature.getPropertyIds().map(id => [id, feature.getProperty(id)])) }
  onLoadProgress(id: string, callback: (pending: number, processing: number) => void): () => void {
    const tileset = this.require(id); if (typeof callback !== 'function') throw new TypeError('callback is required'); const native = tileset.loadProgress.addEventListener(callback)
    let set = this.subscriptions.get(id); if (!set) { set = new Set(); this.subscriptions.set(id, set) }
    const off = () => { native(); set!.delete(off) }; set.add(off); return off
  }
  configure(id: string, options: { maximumScreenSpaceError?: number; dynamicScreenSpaceError?: boolean }): void {
    if (options.maximumScreenSpaceError !== undefined && (!Number.isFinite(options.maximumScreenSpaceError) || options.maximumScreenSpaceError < 0)) throw new RangeError('Invalid screen space error')
    if (options.dynamicScreenSpaceError !== undefined && typeof options.dynamicScreenSpaceError !== 'boolean') throw new TypeError('dynamicScreenSpaceError must be boolean')
    Object.assign(this.require(id), options); render(this.viewer)
  }
  setShader(id: string, shader: CustomShader | undefined, own = false): void {
    const tileset = this.require(id); if (shader !== undefined && (!(shader instanceof CustomShader) || shader.isDestroyed())) throw new TypeError('Invalid shader')
    if (typeof own !== 'boolean') throw new TypeError('own must be boolean')
    if (shader && [...this.ownedShaders].some(([other, value]) => other !== id && value === shader) || shader && own && [...this.tilesets].some(([other, value]) => other !== id && value.customShader === shader)) throw new Error('Owned shader cannot be shared between tilesets')
    const previous = this.ownedShaders.get(id); tileset.customShader = shader
    if (previous && previous !== shader && !previous.isDestroyed()) previous.destroy()
    if (shader && own) this.ownedShaders.set(id, shader); else this.ownedShaders.delete(id)
    render(this.viewer)
  }
  setClippingPlanes(id: string, planes: ClippingPlaneCollection | undefined): void { if (planes && planes.isDestroyed()) throw new Error('Clipping planes destroyed'); Object.assign(this.require(id), { clippingPlanes: planes }); render(this.viewer) }
  setClippingPolygons(id: string, polygons: ClippingPolygonCollection | undefined): void { if (polygons && polygons.isDestroyed()) throw new Error('Clipping polygons destroyed'); Object.assign(this.require(id), { clippingPolygons: polygons }); render(this.viewer) }
  highlight(id: string, feature: Cesium3DTileFeature, color = Color.YELLOW): () => void {
    const tileset = this.require(id)
    if (!feature || feature.tileset !== tileset) throw new Error('Feature does not belong to the tileset')
    if (!(color instanceof Color) || ![color.red, color.green, color.blue, color.alpha].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw new TypeError('Invalid color')
    const previous = this.highlights.get(feature), original = previous?.original ?? Color.clone(feature.color), applied = Color.clone(color)
    const state = { original, applied, id }; feature.color = applied; this.highlights.set(feature, state); render(this.viewer)
    return () => {
      if (this.highlights.get(feature) !== state) return
      this.highlights.delete(feature)
      if (!tileset.isDestroyed() && Color.equals(feature.color, applied)) feature.color = original
      render(this.viewer)
    }
  }
  private cleanupExtras(id: string): void {
    for (const [feature, state] of this.highlights) if (state.id === id) { try { if (!feature.tileset.isDestroyed() && Color.equals(feature.color, state.applied)) feature.color = state.original } finally { this.highlights.delete(feature) } }
    for (const off of this.subscriptions.get(id) ?? []) off(); this.subscriptions.delete(id)
    const shader = this.ownedShaders.get(id); if (shader && !shader.isDestroyed()) shader.destroy(); this.ownedShaders.delete(id)
  }
  private require(id: string): Cesium3DTileset {
    const tileset = this.getTileset(id)
    if (!tileset) throw new Error(`Unknown tileset: ${id}`)
    return tileset
  }
  flyTo(id: string, options?: Parameters<Viewer['flyTo']>[1]): Promise<boolean> { return this.viewer.flyTo(this.require(id), options) }
  removeTileset(idOrTileset: string | Cesium3DTileset): boolean {
    if (this.disposed) return false
    const entry = typeof idOrTileset === 'string' ? [idOrTileset, this.tilesets.get(idOrTileset)] as const
      : [...this.tilesets.entries()].find(([, tileset]) => tileset === idOrTileset)
    if (!entry?.[1]) return false
    this.cleanupExtras(entry[0])
    this.tilesets.delete(entry[0]); const removed = this.release(entry[1]); render(this.viewer); return removed
  }
  private release(tileset: Cesium3DTileset): boolean {
    if (!this.viewer.isDestroyed() && this.viewer.scene.primitives.contains(tileset)) {
      if (tileset.isDestroyed()) {
        const collection = this.viewer.scene.primitives, destroy = collection.destroyPrimitives
        try { collection.destroyPrimitives = false; return collection.remove(tileset) }
        finally { collection.destroyPrimitives = destroy }
      }
      const removed = this.viewer.scene.primitives.remove(tileset)
      if (!tileset.isDestroyed()) tileset.destroy()
      return removed
    }
    if (!tileset.isDestroyed()) tileset.destroy()
    return false
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const id of this.tilesets.keys()) this.cleanupExtras(id)
    for (const tileset of this.tilesets.values()) this.release(tileset)
    this.tilesets.clear(); this.pending.clear(); render(this.viewer)
  }
}
