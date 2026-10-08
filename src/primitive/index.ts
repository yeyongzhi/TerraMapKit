import { Primitive, GroundPrimitive, GroundPolylinePrimitive, GeometryInstance, ColorGeometryInstanceAttribute, ShowGeometryInstanceAttribute, PolylineGeometry, GroundPolylineGeometry, PolygonGeometry, PolygonHierarchy, RectangleGeometry, EllipseGeometry, WallGeometry, CorridorGeometry, BoxGeometry, CylinderGeometry, EllipsoidGeometry, PerInstanceColorAppearance, PolylineColorAppearance, PolylineMaterialAppearance, MaterialAppearance, Cartesian3, Rectangle, BoundingSphere, Matrix4, Color, createGuid, type Material, type Viewer } from 'cesium'
import { assertViewer, clonePosition, finite, render } from '../internal/index.js'
import { localArea } from '../internal/geometry.js'
import { TransformKit } from '../transform/index.js'
export type PrimitiveGeometry =
  | { type: 'polyline' | 'polygon' | 'wall' | 'corridor'; positions: readonly Cartesian3[]; width?: number }
  | { type: 'rectangle'; bounds: { west: number; south: number; east: number; north: number } }
  | { type: 'ellipse'; center: Cartesian3; semiMajorAxis: number; semiMinorAxis?: number }
  | { type: 'box'; dimensions: Cartesian3 }
  | { type: 'cylinder'; length: number; topRadius: number; bottomRadius: number }
  | { type: 'ellipsoid'; radii: Cartesian3 }
export interface PrimitiveOptions { id?: string; geometry: PrimitiveGeometry; color?: Color; show?: boolean; ground?: boolean; modelMatrix?: Matrix4; material?: Material }
export interface PrimitiveHandle { readonly id: string; readonly primitive: Primitive | GroundPrimitive | GroundPolylinePrimitive; setVisible(show: boolean): void; setColor(color: Color): void; remove(): boolean }
function tint(color: Color): Color { if (!(color instanceof Color) || ![color.red, color.green, color.blue, color.alpha].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw new TypeError('Invalid color'); return Color.clone(color) }
export class PrimitiveKit {
  private disposed = false
  private readonly handles = new Map<string, PrimitiveHandle>()
  private readonly groups = new Map<string, readonly string[]>()
  constructor(private readonly viewer: Viewer) { this.active() }
  private active() { assertViewer(this.viewer, this.disposed, 'PrimitiveKit') }
  private geometry(spec: PrimitiveGeometry, ground: boolean, material = false) {
    if (!spec || typeof spec !== 'object') throw new TypeError('geometry is required')
    const format = material ? MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat : PerInstanceColorAppearance.VERTEX_FORMAT
    if ('positions' in spec) {
      if (!Array.isArray(spec.positions) || spec.positions.length < (spec.type === 'polygon' ? 3 : 2) || spec.positions.length > 512) throw new RangeError('Invalid geometry vertex count')
      const positions = Array.from(spec.positions, clonePosition)
      if (spec.type === 'polygon') { localArea(positions); return new PolygonGeometry({ polygonHierarchy: new PolygonHierarchy(positions), perPositionHeight: !ground, vertexFormat: format }) }
      if (spec.type === 'polyline') return ground ? new GroundPolylineGeometry({ positions, width: finite(spec.width ?? 3, 'width', 1, 32) }) : new PolylineGeometry({ positions, width: finite(spec.width ?? 3, 'width', 1, 32), vertexFormat: material ? PolylineMaterialAppearance.VERTEX_FORMAT : PolylineColorAppearance.VERTEX_FORMAT })
      if (spec.type === 'wall') return WallGeometry.fromConstantHeights({ positions, maximumHeight: 100, minimumHeight: 0, vertexFormat: format })
      return new CorridorGeometry({ positions, width: finite(spec.width ?? 100, 'width', 1, 100000), vertexFormat: format })
    }
    if (spec.type === 'rectangle') {
      const b = spec.bounds; finite(b.west, 'west', -180, 180); finite(b.east, 'east', -180, 180); finite(b.south, 'south', -90, 90); finite(b.north, 'north', -90, 90)
      if (b.west >= b.east || b.south >= b.north) throw new RangeError('Bounds must be ordered; split date-line rectangles')
      return new RectangleGeometry({ rectangle: Rectangle.fromDegrees(b.west, b.south, b.east, b.north), vertexFormat: format })
    }
    if (spec.type === 'ellipse') return new EllipseGeometry({ center: clonePosition(spec.center), semiMajorAxis: finite(spec.semiMajorAxis, 'semiMajorAxis', 1), semiMinorAxis: finite(spec.semiMinorAxis ?? spec.semiMajorAxis, 'semiMinorAxis', 1, spec.semiMajorAxis), vertexFormat: format })
    const vector = (v: Cartesian3) => { if (!v) throw new TypeError('dimensions are required'); for (const axis of ['x', 'y', 'z'] as const) finite(v[axis], axis, 1); return Cartesian3.clone(v) }
    if (spec.type === 'box') return BoxGeometry.fromDimensions({ dimensions: vector(spec.dimensions), vertexFormat: format })
    if (spec.type === 'ellipsoid') return new EllipsoidGeometry({ radii: vector(spec.radii), vertexFormat: format })
    if (spec.type === 'cylinder') return new CylinderGeometry({ length: finite(spec.length, 'length', 1), topRadius: finite(spec.topRadius, 'topRadius', 0), bottomRadius: finite(spec.bottomRadius, 'bottomRadius', 0), vertexFormat: format })
    throw new TypeError('Unsupported geometry type')
  }
  add(options: PrimitiveOptions): PrimitiveHandle { return this.addBatch([options])[0]! }
  replace(id: string, options: Omit<PrimitiveOptions, 'id'>): PrimitiveHandle {
    const previous = this.get(id); if (!previous) throw new Error('Unknown primitive')
    const next = this.add(options); this.remove(previous); return next
  }
  /** True native batching of compatible static geometry; instance IDs are groupId/localId. */
  addInstances(input: readonly PrimitiveOptions[], id = createGuid()): PrimitiveHandle {
    this.active(); if (!Array.isArray(input) || !input.length || input.length > 10000) throw new RangeError('Expected 1–10000 instances')
    if (typeof id !== 'string' || !id.trim() || this.handles.has(id)) throw new Error('Invalid or duplicate group id')
    const ground = input[0]?.ground ?? false, line = input[0]?.geometry?.type === 'polyline', ids = new Set<string>()
    const instances = Array.from(input, (o, i) => {
      if (!o || Boolean(o.ground) !== ground || (o.geometry?.type === 'polyline') !== line || o.material) throw new RangeError('Batch requires matching ground/line mode and per-instance color')
      if (o.show !== undefined && typeof o.show !== 'boolean') throw new TypeError('show must be boolean')
      if (o.ground && (!['polyline', 'polygon', 'rectangle', 'ellipse', 'corridor'].includes(o.geometry.type) || o.modelMatrix)) throw new RangeError('Unsupported ground batch geometry')
      const local = o.id ?? `${i}`; if (typeof local !== 'string' || !local.trim() || ids.has(local)) throw new Error('Duplicate instance id'); ids.add(local)
      return new GeometryInstance({ id: `${id}/${local}`, geometry: this.geometry(o.geometry, ground), modelMatrix: o.modelMatrix ? TransformKit.validate(o.modelMatrix) : Matrix4.clone(Matrix4.IDENTITY), attributes: { color: ColorGeometryInstanceAttribute.fromColor(tint(o.color ?? Color.CYAN)), show: new ShowGeometryInstanceAttribute(o.show ?? true) } })
    })
    const appearance = line ? new PolylineColorAppearance() : new PerInstanceColorAppearance({ flat: true, translucent: true })
    const primitive = ground ? line ? new GroundPolylinePrimitive({ geometryInstances: instances, appearance }) : new GroundPrimitive({ geometryInstances: instances }) : new Primitive({ geometryInstances: instances, appearance })
    const handle: PrimitiveHandle = Object.freeze({ id, primitive, setVisible: (show: boolean) => { this.require(handle); if (typeof show !== 'boolean') throw new TypeError('show must be boolean'); primitive.show = show; render(this.viewer) }, setColor: (color: Color) => { const value = tint(color); for (const local of ids) this.setInstanceColor(id, local, value) }, remove: () => this.remove(handle) })
    this.handles.set(id, handle); this.groups.set(id, [...ids])
    try { this.viewer.scene.primitives.add(primitive); this.require(handle); render(this.viewer); return handle }
    catch (error) { this.remove(handle); throw error }
  }
  private attributes(group: string, local: string) {
    const h = this.get(group); if (!h || !this.groups.get(group)?.includes(local)) throw new Error('Unknown group instance')
    if (!h.primitive.ready) throw new Error('Primitive is not ready')
    return h.primitive.getGeometryInstanceAttributes(`${group}/${local}`)
  }
  setInstanceColor(group: string, local: string, color: Color): void { const value = tint(color); this.attributes(group, local).color = ColorGeometryInstanceAttribute.toValue(value); render(this.viewer) }
  setInstanceVisible(group: string, local: string, show: boolean): void { if (typeof show !== 'boolean') throw new TypeError('show must be boolean'); this.attributes(group, local).show = ShowGeometryInstanceAttribute.toValue(show); render(this.viewer) }
  addBatch(input: readonly PrimitiveOptions[]): readonly PrimitiveHandle[] {
    this.active(); if (!Array.isArray(input) || input.length > 10000) throw new RangeError('Expected at most 10000 geometries')
    const ids = new Set<string>()
    const prepared = Array.from(input, o => {
      if (!o || o.show !== undefined && typeof o.show !== 'boolean' || o.ground !== undefined && typeof o.ground !== 'boolean') throw new TypeError('Invalid primitive options')
      const id = o.id ?? createGuid(); if (typeof id !== 'string' || !id.trim() || ids.has(id) || this.handles.has(id)) throw new Error('Invalid or duplicate primitive id'); ids.add(id)
      if (o.ground && !['polyline', 'polygon', 'rectangle', 'ellipse', 'corridor'].includes(o.geometry?.type)) throw new RangeError('This geometry cannot be grounded')
      if (o.ground && o.modelMatrix) throw new RangeError('Ground geometry does not accept modelMatrix')
      const geometry = this.geometry(o.geometry, o.ground ?? false, Boolean(o.material)), color = tint(o.color ?? Color.CYAN), show = o.show ?? true
      const modelMatrix = o.modelMatrix ? TransformKit.validate(o.modelMatrix) : Matrix4.clone(Matrix4.IDENTITY)
      if (o.material && o.ground && o.geometry.type !== 'polyline') throw new RangeError('Ground fill uses per-instance color')
      return { o, id, geometry, color, show, modelMatrix }
    })
    const created: PrimitiveHandle[] = []
    try {
      for (const p of prepared) {
        const instance = new GeometryInstance({ id: p.id, geometry: p.geometry, modelMatrix: p.modelMatrix, attributes: { color: ColorGeometryInstanceAttribute.fromColor(p.color), show: new ShowGeometryInstanceAttribute(p.show) } })
        const line = p.o.geometry.type === 'polyline'
        const appearance = p.o.material ? line ? new PolylineMaterialAppearance({ material: p.o.material }) : new MaterialAppearance({ material: p.o.material }) : line ? new PolylineColorAppearance() : new PerInstanceColorAppearance({ flat: true, translucent: true })
        const primitive = p.o.ground ? line ? new GroundPolylinePrimitive({ geometryInstances: instance, appearance }) : new GroundPrimitive({ geometryInstances: instance }) : new Primitive({ geometryInstances: instance, appearance })
        const handle: PrimitiveHandle = Object.freeze({ id: p.id, primitive,
          setVisible: (show: boolean) => { this.require(handle); if (typeof show !== 'boolean') throw new TypeError('show must be boolean'); primitive.show = show; render(this.viewer) },
          setColor: (color: Color) => { this.require(handle); const value = tint(color); if (!primitive.ready) throw new Error('Primitive is not ready'); primitive.getGeometryInstanceAttributes(p.id).color = ColorGeometryInstanceAttribute.toValue(value); render(this.viewer) },
          remove: () => this.remove(handle) })
        this.handles.set(p.id, handle); created.push(handle); this.viewer.scene.primitives.add(primitive); this.require(handle)
      }
      render(this.viewer); return Object.freeze(created)
    } catch (error) { for (const h of created) this.remove(h); throw error }
  }
  private require(h: PrimitiveHandle) { this.active(); if (this.handles.get(h.id) !== h || h.primitive.isDestroyed() || !this.viewer.scene.primitives.contains(h.primitive)) throw new Error('Primitive is no longer owned') }
  get(id: string): PrimitiveHandle | undefined { this.active(); const h = this.handles.get(id); if (h && (h.primitive.isDestroyed() || !this.viewer.scene.primitives.contains(h.primitive))) { this.remove(h); return undefined }; return h }
  remove(input: string | PrimitiveHandle): boolean {
    const h = typeof input === 'string' ? this.handles.get(input) : input
    if (!h || this.handles.get(h.id) !== h) return false
    this.handles.delete(h.id)
    this.groups.delete(h.id)
    let removed = false
    try { if (!this.viewer.isDestroyed()) removed = this.viewer.scene.primitives.remove(h.primitive) }
    finally { if (!h.primitive.isDestroyed()) h.primitive.destroy(); render(this.viewer) }
    return removed
  }
  clear(): void { const errors: unknown[] = []; for (const h of [...this.handles.values()]) try { this.remove(h) } catch (e) { errors.push(e) }; if (errors.length) throw new AggregateError(errors, 'Primitive cleanup failed') }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.clear() }
}
