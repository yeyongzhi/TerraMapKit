import { Cartographic, Cartesian3, Ellipsoid, EllipsoidGeodesic, EllipsoidTerrainProvider, sampleTerrain, sampleTerrainMostDetailed, type TerrainProvider, type Viewer } from 'cesium'
import { CoordinateKit, type DegreesPoint } from '../coordinate/index.js'
import { assertViewer, finite, render } from '../internal/index.js'
import { AsyncOperations } from '../internal/async.js'
export interface TerrainSampleOptions { level?: number; offset?: number; signal?: AbortSignal; timeoutMs?: number }
export interface HeightSample { point: DegreesPoint; height: number | undefined; position: Cartesian3 | undefined }
export class TerrainKit {
  private disposed = false
  private revision = 0
  private readonly tasks = new AsyncOperations()
  private readonly original: TerrainProvider
  private installed: TerrainProvider | undefined
  constructor(private readonly viewer: Viewer) { assertViewer(viewer, false, 'TerrainKit'); this.original = viewer.terrainProvider }
  private active() { assertViewer(this.viewer, this.disposed, 'TerrainKit') }
  getTerrain(): TerrainProvider { this.active(); return this.viewer.terrainProvider }
  async setTerrain(provider: TerrainProvider | PromiseLike<TerrainProvider>, options: Pick<TerrainSampleOptions, 'signal' | 'timeoutMs'> = {}): Promise<TerrainProvider> {
    this.active(); const revision = ++this.revision
    const resolved = await this.tasks.run(Promise.resolve(provider), options.signal, options.timeoutMs)
    this.active(); if (revision !== this.revision) throw new Error('Terrain switch superseded')
    if (!resolved || typeof resolved.requestTileGeometry !== 'function') throw new TypeError('Invalid terrain provider')
    this.viewer.terrainProvider = resolved; this.installed = resolved; render(this.viewer); return resolved
  }
  async sampleHeights(input: readonly DegreesPoint[], options: TerrainSampleOptions = {}): Promise<readonly HeightSample[]> {
    this.active()
    if (!Array.isArray(input) || input.length > 10000) throw new RangeError('Expected at most 10000 points')
    const points = Array.from(input, p => { CoordinateKit.fromDegrees(p.longitude, p.latitude, p.height); return { ...p } })
    const offset = finite(options.offset ?? 0, 'offset')
    if (options.level !== undefined && (!Number.isInteger(options.level) || options.level < 0 || options.level > 30)) throw new RangeError('level must be 0–30')
    if (!points.length) return []
    const positions = points.map(p => Cartographic.fromDegrees(p.longitude, p.latitude))
    const provider = this.viewer.terrainProvider
    const promise = provider instanceof EllipsoidTerrainProvider ? Promise.resolve(positions.map(p => { p.height = 0; return p }))
      : options.level === undefined ? sampleTerrainMostDetailed(provider, positions) : sampleTerrain(provider, options.level, positions)
    const samples = await this.tasks.run(promise, options.signal, options.timeoutMs)
    this.active()
    return samples.map((sample, i) => {
      const height = Number.isFinite(sample.height) ? sample.height + offset : undefined, point = points[i]!
      return { point, height, position: height === undefined ? undefined : CoordinateKit.fromDegrees(point.longitude, point.latitude, height) }
    })
  }
  async sampleHeight(point: DegreesPoint, options: TerrainSampleOptions = {}): Promise<HeightSample> { return (await this.sampleHeights([point], options))[0]! }
  async clampPositions(input: readonly DegreesPoint[], options: TerrainSampleOptions = {}): Promise<readonly (Cartesian3 | undefined)[]> { return (await this.sampleHeights(input, options)).map(p => p.position) }
  static densify(input: readonly DegreesPoint[], spacing = 100): DegreesPoint[] {
    finite(spacing, 'spacing', 1, 1000000)
    if (!Array.isArray(input) || input.length < 2 || input.length > 10000) throw new RangeError('Polyline requires 2–10000 points')
    const points = Array.from(input, p => { CoordinateKit.fromDegrees(p.longitude, p.latitude); return Cartographic.fromDegrees(p.longitude, p.latitude) })
    const output: DegreesPoint[] = []
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!
      if (a.longitude === b.longitude && a.latitude === b.latitude) continue
      const line = new EllipsoidGeodesic(a, b, Ellipsoid.WGS84), count = Math.ceil(line.surfaceDistance / spacing)
      if (!Number.isFinite(count) || output.length + count + 1 > 10000) throw new RangeError('Densified polyline exceeds 10000 points')
      for (let j = 0; j < count; j++) {
        const p = line.interpolateUsingFraction(j / count)
        output.push({ longitude: p.longitude * 180 / Math.PI, latitude: p.latitude * 180 / Math.PI })
      }
    }
    const last = input[input.length - 1]!
    output.push({ longitude: last.longitude, latitude: last.latitude }); return output
  }
  async samplePolyline(input: readonly DegreesPoint[], spacing = 100, options: TerrainSampleOptions = {}): Promise<readonly HeightSample[]> { return this.sampleHeights(TerrainKit.densify(input, spacing), options) }
  async getHeightProfile(input: readonly DegreesPoint[], spacing = 100, options: TerrainSampleOptions = {}) {
    const samples = await this.samplePolyline(input, spacing, options); let distance = 0
    return samples.map((sample, i) => {
      let segment = 0
      if (i) { segment = new EllipsoidGeodesic(Cartographic.fromDegrees(samples[i - 1]!.point.longitude, samples[i - 1]!.point.latitude), Cartographic.fromDegrees(sample.point.longitude, sample.point.latitude), Ellipsoid.WGS84).surfaceDistance; distance += segment }
      const previous = samples[i - 1], slope = segment > 0 && sample.height !== undefined && previous?.height !== undefined ? Math.atan2(sample.height - previous.height, segment) : undefined
      return { ...sample, distance, slope }
    })
  }
  restore(): void { this.active(); this.revision++; if (this.installed && this.viewer.terrainProvider === this.installed) this.viewer.terrainProvider = this.original; this.installed = undefined; render(this.viewer) }
  dispose(): void { if (this.disposed) return; this.revision++; this.tasks.dispose(); if (!this.viewer.isDestroyed()) this.restore(); this.disposed = true }
}
