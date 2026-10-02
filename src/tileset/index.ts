import { Cesium3DTileStyle, Cesium3DTileset, createGuid, type Viewer } from 'cesium'
import { assertViewer, render } from '../internal/index.js'

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
    for (const tileset of this.tilesets.values()) this.release(tileset)
    this.tilesets.clear(); this.pending.clear(); render(this.viewer)
  }
}
