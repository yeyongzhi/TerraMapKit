import { CustomDataSource, GeoJsonDataSource, CzmlDataSource, KmlDataSource, createGuid, type DataSource, type Viewer } from 'cesium'
import { assertViewer, render } from '../internal/index.js'
import { AsyncOperations } from '../internal/async.js'
export interface DataSourceLoadOptions { id?: string; show?: boolean; signal?: AbortSignal; timeoutMs?: number }
export class DataSourceKit {
  private disposed = false
  private readonly sources = new Map<string, DataSource>()
  private readonly pending = new Set<string>()
  private readonly tasks = new AsyncOperations()
  private readonly revisions = new Map<string, number>()
  constructor(private readonly viewer: Viewer) { this.active() }
  private active() { assertViewer(this.viewer, this.disposed, 'DataSourceKit') }
  private release(source: DataSource) {
    if (!this.viewer.isDestroyed() && this.viewer.dataSources.contains(source)) return this.viewer.dataSources.remove(source, true)
    const disposable = source as DataSource & { destroy?: () => void; isDestroyed?: () => boolean }
    if (disposable.destroy && !disposable.isDestroyed?.()) disposable.destroy()
    return false
  }
  async add(source: DataSource | PromiseLike<DataSource>, options: DataSourceLoadOptions = {}): Promise<DataSource> {
    this.active()
    const id = options.id ?? createGuid()
    if (typeof id !== 'string' || !id.trim() || options.show !== undefined && typeof options.show !== 'boolean') throw new TypeError('Invalid id/show')
    if (this.sources.has(id) || this.pending.has(id)) throw new Error('Duplicate data source id')
    this.pending.add(id); let loaded: DataSource | undefined, transferred = false
    try {
      loaded = await this.tasks.run(Promise.resolve(source), options.signal, options.timeoutMs, value => { if (!this.viewer.isDestroyed() && this.viewer.dataSources.contains(value)) return; this.release(value) })
      this.active()
      if (!loaded || !loaded.entities) throw new TypeError('Invalid data source')
      if (this.viewer.dataSources.contains(loaded) || [...this.sources.values()].includes(loaded)) throw new Error('Data source already belongs to a collection')
      transferred = true
      loaded.show = options.show ?? true
      await this.viewer.dataSources.add(loaded); this.active()
      if (!this.viewer.dataSources.contains(loaded)) throw new Error('Data source removed during addition')
      this.sources.set(id, loaded); render(this.viewer); return loaded
    } catch (error) { if (loaded && transferred && ![...this.sources.values()].includes(loaded)) this.release(loaded); throw error }
    finally { this.pending.delete(id) }
  }
  addCustom(name = 'TerraMapKit', options: DataSourceLoadOptions = {}): Promise<DataSource> { return this.add(new CustomDataSource(name), options) }
  async replace(id: string, source: DataSource | PromiseLike<DataSource>, options: Omit<DataSourceLoadOptions, 'id'> = {}): Promise<DataSource> {
    this.active(); if (typeof id !== 'string' || !id.trim()) throw new TypeError('id is required')
    const revision = (this.revisions.get(id) ?? 0) + 1; this.revisions.set(id, revision)
    const temporary = createGuid(), next = await this.add(source, { ...options, id: temporary })
    if (this.revisions.get(id) !== revision) { this.remove(temporary); throw new Error('Data source replacement superseded') }
    this.active(); const previous = this.sources.get(id)
    this.sources.delete(temporary); this.sources.set(id, next)
    if (previous) this.release(previous)
    render(this.viewer); return next
  }
  loadGeoJSON(data: Parameters<typeof GeoJsonDataSource.load>[0], options: Parameters<typeof GeoJsonDataSource.load>[1] = {}, load: DataSourceLoadOptions = {}) { this.active(); return this.add(GeoJsonDataSource.load(data, options), load) }
  loadCZML(data: Parameters<typeof CzmlDataSource.load>[0], load: DataSourceLoadOptions = {}) { this.active(); return this.add(CzmlDataSource.load(data), load) }
  loadKML(data: Parameters<typeof KmlDataSource.load>[0], options: Parameters<typeof KmlDataSource.load>[1] = {}, load: DataSourceLoadOptions = {}) { this.active(); return this.add(KmlDataSource.load(data, { camera: this.viewer.camera, canvas: this.viewer.scene.canvas, ...options }), load) }
  get(id: string): DataSource | undefined { this.active(); const s = this.sources.get(id); if (s && !this.viewer.dataSources.contains(s)) { this.sources.delete(id); return undefined }; return s }
  setVisible(id: string, show: boolean): void { this.active(); if (typeof show !== 'boolean') throw new TypeError('show must be boolean'); const s = this.get(id); if (!s) throw new Error('Unknown data source'); s.show = show; render(this.viewer) }
  async flyTo(id: string): Promise<boolean> { const s = this.get(id); if (!s) throw new Error('Unknown data source'); return this.viewer.flyTo(s) }
  remove(id: string): boolean { this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1); const s = this.sources.get(id); if (!s) return false; this.sources.delete(id); const removed = this.release(s); render(this.viewer); return removed }
  clear(): void { const errors: unknown[] = []; for (const id of [...this.sources.keys()]) try { this.remove(id) } catch (e) { errors.push(e) }; if (errors.length) throw new AggregateError(errors, 'Data source cleanup failed') }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.tasks.dispose(); this.clear() }
}
