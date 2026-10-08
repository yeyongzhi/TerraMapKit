import { Color, SceneMode, type Viewer } from 'cesium'
import { CoordinateKit, type DegreesCoordinate } from '../coordinate/index.js'
import { MarkerKit, type MarkerData } from '../marker/index.js'
import { DrawKit, type DrawFeatureCollection } from '../draw/index.js'
import { LayerKit, type ImageLayerConfiguration, type ImagerySource } from '../layer/index.js'
import { assertViewer, finite, render } from '../internal/index.js'
import { AsyncOperations } from '../internal/async.js'
export interface MapSnapshot {
  version: 1
  camera: { position: DegreesCoordinate; heading: number; pitch: number; roll: number }
  scene: { requestRenderMode: boolean; maximumRenderTimeChange: number | 'infinity'; resolutionScale: number; backgroundColor: number[] }
  markers?: MarkerData[]
  drawings?: DrawFeatureCollection
  imagery?: readonly ImageLayerConfiguration[]
}
export interface SnapshotTargets { markers?: MarkerKit; drawings?: DrawKit; layers?: LayerKit; resolveSource?: (source: ImagerySource) => ImagerySource }
export class SnapshotKit {
  private disposed = false
  private readonly tasks = new AsyncOperations()
  private readonly frames = new Set<() => void>()
  constructor(private readonly viewer: Viewer) { this.active() }
  private active() { assertViewer(this.viewer, this.disposed, 'SnapshotKit') }
  capture(targets: SnapshotTargets = {}): MapSnapshot {
    this.active(); const camera = this.viewer.camera, s = this.viewer.scene, c = s.backgroundColor
    if (s.mode !== undefined && s.mode !== SceneMode.SCENE3D) throw new Error('Snapshot camera requires 3D mode')
    return { version: 1, camera: { position: CoordinateKit.toDegrees(camera.positionWC), heading: camera.heading, pitch: camera.pitch, roll: camera.roll }, scene: { requestRenderMode: s.requestRenderMode, maximumRenderTimeChange: s.maximumRenderTimeChange === Infinity ? 'infinity' : s.maximumRenderTimeChange, resolutionScale: this.viewer.resolutionScale, backgroundColor: [c.red, c.green, c.blue, c.alpha] }, ...(targets.markers && { markers: targets.markers.toJSON() }), ...(targets.drawings && { drawings: targets.drawings.toFeatureCollection() }), ...(targets.layers && { imagery: targets.layers.exportConfiguration() }) }
  }
  /** Appends owned data; rejects conflicts. Does not serialize Viewer, callbacks, URLs or credentials. */
  async restore(snapshot: MapSnapshot, targets: SnapshotTargets = {}): Promise<void> {
    this.active()
    if (this.viewer.scene.mode !== undefined && this.viewer.scene.mode !== SceneMode.SCENE3D) throw new Error('Snapshot camera requires 3D mode')
    if (!snapshot || snapshot.version !== 1 || !snapshot.camera || !snapshot.scene) throw new TypeError('Unsupported snapshot')
    const camera = snapshot.camera, destination = CoordinateKit.fromDegrees(camera.position.longitude, camera.position.latitude, camera.position.height)
    const orientation = { heading: finite(camera.heading, 'heading'), pitch: finite(camera.pitch, 'pitch', -Math.PI / 2, Math.PI / 2), roll: finite(camera.roll, 'roll') }
    const s = snapshot.scene, rgba = s.backgroundColor
    if (!Array.isArray(rgba) || rgba.length !== 4 || !rgba.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1) || typeof s.requestRenderMode !== 'boolean') throw new TypeError('Invalid snapshot scene')
    const change = s.maximumRenderTimeChange === 'infinity' ? Infinity : finite(s.maximumRenderTimeChange, 'maximumRenderTimeChange', 0)
    finite(s.resolutionScale, 'resolutionScale', .1, 4)
    if (snapshot.markers && !targets.markers || snapshot.drawings && !targets.drawings || snapshot.imagery && !targets.layers) throw new Error('Snapshot requires explicit data owners')
    const markers: ReturnType<MarkerKit['fromJSON']>[number][] = [], drawings: ReturnType<DrawKit['fromGeoJSON']>[number][] = []
    let imagery: Awaited<ReturnType<LayerKit['importConfiguration']>> = []
    try {
      if (snapshot.markers) markers.push(...targets.markers!.fromJSON(snapshot.markers))
      if (snapshot.drawings) drawings.push(...targets.drawings!.fromGeoJSON(snapshot.drawings))
      if (snapshot.imagery) imagery = await this.tasks.run(targets.layers!.importConfiguration(snapshot.imagery, targets.resolveSource), undefined, 30000, layers => { for (const layer of layers) targets.layers!.removeImageLayer(layer) })
      this.active()
    } catch (error) { for (const m of markers) m.remove(); for (const d of drawings) targets.drawings!.remove(d); for (const layer of imagery) targets.layers!.removeImageLayer(layer); throw error }
    this.viewer.camera.setView({ destination, orientation }); this.viewer.scene.requestRenderMode = s.requestRenderMode; this.viewer.scene.maximumRenderTimeChange = change; this.viewer.resolutionScale = s.resolutionScale; this.viewer.scene.backgroundColor = new Color(rgba[0], rgba[1], rgba[2], rgba[3]); render(this.viewer)
  }
  async screenshot(options: { signal?: AbortSignal; timeoutMs?: number; type?: 'image/png' | 'image/jpeg'; quality?: number } = {}): Promise<Blob> {
    this.active(); const type = options.type ?? 'image/png'; if (!['image/png', 'image/jpeg'].includes(type)) throw new TypeError('Unsupported image type'); finite(options.quality ?? .92, 'quality', 0, 1)
    let cleanup: (() => void) | undefined
    const promise = new Promise<Blob>((resolve, reject) => {
      const off = this.viewer.scene.postRender.addEventListener(() => {
        cleanup?.()
        try { this.viewer.scene.canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas export failed')), type, options.quality ?? .92) } catch (error) { reject(error) }
      })
      cleanup = () => { off(); this.frames.delete(cleanup!) }; this.frames.add(cleanup); render(this.viewer)
    })
    try { const blob = await this.tasks.run(promise, options.signal, options.timeoutMs); this.active(); return blob } finally { cleanup?.() }
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.tasks.dispose(); for (const off of [...this.frames]) off(); this.frames.clear() }
}
