import type { Cartesian3, Color, Entity } from 'cesium'
import type { PickPositionMode } from '../pick/index.js'
import type { DrawSnapOptions } from './snap.js'
export type DrawType = 'point' | 'polyline' | 'polygon'
import type { JSONValue } from '../internal/json.js'
export type { JSONValue } from '../internal/json.js'
export type DrawProperties = { readonly [key: string]: JSONValue } | null
export interface DrawResult {
  readonly id: string; readonly type: DrawType; readonly entity: Entity
  /** Current committed immutable snapshot. Previously saved snapshots remain unchanged. */
  readonly positions: readonly Cartesian3[]
  readonly properties: DrawProperties
  readonly featureId: string | number | undefined
}
export interface DrawOptions {
  snap?: DrawSnapOptions
  id?: string; type: DrawType; color?: Color; width?: number
  interactive?: boolean; positionMode?: PickPositionMode; maxPoints?: number
  onFinish?: (result: DrawResult) => void; onCancel?: () => void; onError?: (error: unknown) => void
}
export interface DrawSession {
  readonly entity: Entity
  addPoint(position: Cartesian3): void; undo(): boolean; finish(): DrawResult; cancel(): void
}
export interface DrawGeoJSON {
  type: 'Feature'; id?: string | number
  properties: DrawProperties
  geometry: { type: 'Point'; coordinates: number[] } | { type: 'LineString'; coordinates: number[][] } | { type: 'Polygon'; coordinates: number[][][] }
}
export interface DrawFeatureCollection { type: 'FeatureCollection'; features: DrawGeoJSON[] }
export interface GeoJSONImportOptions { color?: Color; width?: number; idPrefix?: string }
export type EditMode = 'vertex' | 'insert' | 'delete' | 'translate'
export interface DrawEditOptions {
  snap?: DrawSnapOptions
  interactive?: boolean; positionMode?: PickPositionMode; preserveHeight?: boolean
  onChange?: (positions: readonly Cartesian3[]) => void
  onFinish?: (result: DrawResult) => void; onCancel?: () => void; onError?: (error: unknown) => void
}
export interface DrawEditSession {
  readonly result: DrawResult; readonly entity: Entity
  readonly positions: readonly Cartesian3[]; readonly handles: readonly Entity[]
  readonly mode: EditMode; readonly selectedIndex: number | undefined
  readonly canUndo: boolean; readonly canRedo: boolean
  setMode(mode: EditMode): void; selectVertex(index: number): void
  moveVertex(index: number, position: Cartesian3): void
  /** Insert before index; index == length appends. */
  insertVertex(index: number, position: Cartesian3): void
  removeVertex(index: number): void
  /** Rigid translation by an ECEF delta in metres. */
  translate(delta: Cartesian3): void
  rotate(center: Cartesian3, axis: Cartesian3, angle: number): void
  scale(center: Cartesian3, factor: number): void
  undo(): boolean; redo(): boolean; finish(): DrawResult; cancel(): void
}
