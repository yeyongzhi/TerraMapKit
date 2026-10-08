import { ConstantPositionProperty, ConstantProperty, Entity, PointGraphics, PolylineGraphics, PolygonGraphics, PolygonHierarchy, type Cartesian3, type Color } from 'cesium'
import type { DrawType } from './types.js'
export function setGeometry(entity: Entity, type: DrawType, points: readonly Cartesian3[]): void {
  if (type === 'point') entity.position = new ConstantPositionProperty(points[0])
  else {
    if (entity.polyline) entity.polyline.positions = new ConstantProperty(type === 'polygon' ? [...points, points[0]!] : [...points])
    if (entity.polygon) entity.polygon.hierarchy = new ConstantProperty(new PolygonHierarchy([...points]))
  }
}
export function createEntity(type: DrawType, points: readonly Cartesian3[], color: Color, width: number): Entity {
  const entity = new Entity()
  if (type === 'point') entity.point = new PointGraphics({ pixelSize: 10, color })
  else {
    entity.polyline = new PolylineGraphics({ width, material: color })
    if (type === 'polygon') entity.polygon = new PolygonGraphics({ material: color.withAlpha(color.alpha * 0.35), perPositionHeight: true })
  }
  setGeometry(entity, type, points)
  return entity
}
