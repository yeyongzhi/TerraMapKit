import { Cartesian3, Ellipsoid, EllipsoidGeodesic, Entity, LabelStyle, Color, type Viewer } from 'cesium'
import { CoordinateKit, type DegreesPoint } from '../coordinate/index.js'
import { DrawKit, type DrawSession, type DrawResult } from '../draw/index.js'
import { assertViewer, clonePosition, render } from '../internal/index.js'
import { localArea } from '../internal/geometry.js'

export type MeasureType = 'distance' | 'area' | 'height'
export interface MeasureResult {
  readonly id: string; readonly type: MeasureType; readonly value: number
  readonly unit: 'm' | 'm²'; readonly drawing: DrawResult; readonly label: Entity
}
export interface MeasureOptions {
  type: MeasureType; interactive?: boolean
  onFinish?: (result: MeasureResult) => void; onError?: (error: unknown) => void
}

export class MeasureKit {
  private disposed = false
  private readonly drawings: DrawKit
  private readonly results = new Map<string, MeasureResult>()
  constructor(private readonly viewer: Viewer) { this.assertActive(); this.drawings = new DrawKit(viewer) }
  private assertActive(): void { assertViewer(this.viewer, this.disposed, 'MeasureKit') }
  static distance(positions: readonly Cartesian3[]): number {
    if (!Array.isArray(positions) || positions.length < 2) throw new RangeError('Distance requires at least two positions')
    const points = Array.from(positions, clonePosition)
    return points.slice(1).reduce((sum, point, i) => sum + Cartesian3.distance(points[i]!, point), 0)
  }
  static surfaceDistance(positions: readonly DegreesPoint[]): number {
    if (!Array.isArray(positions) || positions.length < 2) throw new RangeError('Surface distance requires two points')
    const points = Array.from(positions, point => Ellipsoid.WGS84.cartesianToCartographic(CoordinateKit.fromDegrees(point.longitude, point.latitude))!)
    let distance = 0
    for (let i = 1; i < points.length; i++) {
      if (points[i]!.longitude === points[i - 1]!.longitude && points[i]!.latitude === points[i - 1]!.latitude) continue
      try { distance += new EllipsoidGeodesic(points[i - 1], points[i], Ellipsoid.WGS84).surfaceDistance }
      catch { throw new RangeError('Geodesic is undefined or near antipodal; split the segment') }
    }
    if (!Number.isFinite(distance)) throw new RangeError('Geodesic did not converge')
    return distance
  }
  static area(positions: readonly Cartesian3[]): number { return localArea(positions) }
  static heightDifference(from: Cartesian3, to: Cartesian3): number {
    return CoordinateKit.toDegrees(clonePosition(to)).height - CoordinateKit.toDegrees(clonePosition(from)).height
  }
  start(options: MeasureOptions): DrawSession {
    this.assertActive()
    if (!options || !['distance', 'area', 'height'].includes(options.type)) throw new TypeError('Invalid measure type')
    return this.drawings.start({
      type: options.type === 'area' ? 'polygon' : 'polyline',
      interactive: options.interactive ?? true,
      maxPoints: options.type === 'height' ? 2 : 512,
      onError: error => options.onError?.(error),
      onFinish: drawing => {
        let result: MeasureResult
        let label: Entity | undefined
        try {
          this.assertActive()
          const value = options.type === 'area' ? MeasureKit.area(drawing.positions)
            : options.type === 'height' ? MeasureKit.heightDifference(drawing.positions[0]!, drawing.positions[1]!)
              : MeasureKit.distance(drawing.positions)
          const unit = options.type === 'area' ? 'm²' : 'm'
          label = this.viewer.entities.add({ position: drawing.positions[drawing.positions.length - 1]!,
            label: { text: `${value.toFixed(2)} ${unit}`, font: '16px sans-serif', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 2, style: LabelStyle.FILL_AND_OUTLINE, disableDepthTestDistance: Number.POSITIVE_INFINITY } })
          this.assertActive()
          if (!this.viewer.entities.contains(label) || !this.viewer.entities.contains(drawing.entity)) throw new Error('Measurement entities were removed during creation')
          result = Object.freeze({ id: drawing.id, type: options.type, value, unit, drawing, label })
          this.results.set(result.id, result); render(this.viewer)
        } catch (error) { if (label) this.viewer.entities.remove(label); this.drawings.remove(drawing); throw error }
        options.onFinish?.(result)
      }
    })
  }
  remove(id: string): boolean {
    if (this.disposed) return false
    const result = this.results.get(id)
    if (!result) return false
    this.results.delete(id)
    const drawing = this.drawings.remove(result.drawing), label = this.viewer.entities.remove(result.label)
    render(this.viewer); return drawing || label
  }
  cancel(): void { this.drawings.cancel() }
  clear(): void { this.drawings.cancel(); for (const id of [...this.results.keys()]) this.remove(id) }
  dispose(): void { if (!this.disposed) { this.clear(); this.drawings.dispose(); this.disposed = true } }
}
