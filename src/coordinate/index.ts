import { Cartesian3, Cartographic, Ellipsoid, Matrix4, Transforms, Math as CesiumMath } from 'cesium'
import { clonePosition, finite } from '../internal/index.js'
export { GeometryKit, type CartesianBounds, type SegmentProjection } from './geometry.js'

/** WGS84 longitude/latitude in degrees, height in metres. */
export interface DegreesPoint {
  longitude: number
  latitude: number
  height?: number
}

export interface DegreesCoordinate {
  longitude: number
  latitude: number
  height: number
}

function assertFinite(value: number, name: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`)
  }
}

/** Stateless WGS84 conversions; no Viewer or browser initialization required. */
export class CoordinateKit {
  /** WGS84 east/north/up to Earth-fixed matrix. Origin must be away from the centre. */
  static createLocalFrame(origin: Cartesian3): Matrix4 {
    return Transforms.eastNorthUpToFixedFrame(clonePosition(origin), Ellipsoid.WGS84, new Matrix4())
  }

  /** Local x/y/z are east/north/up metres in the tangent frame at origin. */
  static toLocal(origin: Cartesian3, position: Cartesian3): Cartesian3 {
    const inverse = Matrix4.inverseTransformation(CoordinateKit.createLocalFrame(origin), new Matrix4())
    const result = Matrix4.multiplyByPoint(inverse, clonePosition(position), new Cartesian3())
    if (![result.x, result.y, result.z].every(Number.isFinite)) throw new RangeError('Local coordinate exceeds finite numeric range')
    return result
  }

  static fromLocal(origin: Cartesian3, local: Cartesian3): Cartesian3 {
    if (!local) throw new TypeError('local is required')
    finite(local.x, 'local.x'); finite(local.y, 'local.y'); finite(local.z, 'local.z')
    const result = Matrix4.multiplyByPoint(CoordinateKit.createLocalFrame(origin), local, new Cartesian3())
    return clonePosition(result)
  }

  /** Tangent-frame translation, not travel along the ellipsoid or terrain. */
  static offset(origin: Cartesian3, east: number, north: number, up = 0): Cartesian3 {
    finite(east, 'east'); finite(north, 'north'); finite(up, 'up')
    return CoordinateKit.fromLocal(origin, new Cartesian3(east, north, up))
  }

  /** Vertex mean in the ENU frame, returned in world coordinates; not a polygon centroid. */
  static localCenter(origin: Cartesian3, positions: readonly Cartesian3[]): Cartesian3 {
    if (!Array.isArray(positions)) throw new TypeError('positions must be an array')
    if (positions.length < 1 || positions.length > 10000) throw new RangeError('Expected 1–10000 positions')
    const inverse = Matrix4.inverseTransformation(CoordinateKit.createLocalFrame(origin), new Matrix4())
    const mean = new Cartesian3()
    for (const position of Array.from(positions, clonePosition)) {
      const local = Matrix4.multiplyByPoint(inverse, position, new Cartesian3())
      Cartesian3.divideByScalar(local, positions.length, local)
      Cartesian3.add(mean, local, mean)
    }
    return CoordinateKit.fromLocal(origin, mean)
  }

  /** Longitude: [-180, 180], latitude: [-90, 90]; height defaults to zero. */
  static fromDegrees(longitude: number, latitude: number, height = 0): Cartesian3 {
    assertFinite(longitude, 'longitude')
    assertFinite(latitude, 'latitude')
    assertFinite(height, 'height')
    if (longitude < -180 || longitude > 180) {
      throw new RangeError('longitude must be between -180 and 180 degrees')
    }
    if (latitude < -90 || latitude > 90) {
      throw new RangeError('latitude must be between -90 and 90 degrees')
    }
    const result = Cartesian3.fromDegrees(longitude, latitude, height, Ellipsoid.WGS84)
    if (![result.x, result.y, result.z].every(Number.isFinite)) {
      throw new RangeError('height produces an unrepresentable Cartesian3')
    }
    return result
  }

  /** Returns new Cartesian3 objects in input order without modifying points. */
  static fromDegreesArray(points: readonly DegreesPoint[]): Cartesian3[] {
    if (!Array.isArray(points)) {
      throw new TypeError('points must be an array of longitude/latitude objects')
    }
    // Array.from also validates holes rather than silently preserving them.
    return Array.from(points, (point, index) => {
      if (point === null || typeof point !== 'object') {
        throw new TypeError(`points[${index}] must be a longitude/latitude object`)
      }
      return CoordinateKit.fromDegrees(point.longitude, point.latitude, point.height)
    })
  }

  /** Converts a finite Cartesian3 using WGS84; the ellipsoid centre is undefined. */
  static toDegrees(cartesian: Cartesian3): DegreesCoordinate {
    if (cartesian === null || typeof cartesian !== 'object') {
      throw new TypeError('cartesian must have finite x, y and z components')
    }
    assertFinite(cartesian.x, 'cartesian.x')
    assertFinite(cartesian.y, 'cartesian.y')
    assertFinite(cartesian.z, 'cartesian.z')
    const result = Cartographic.fromCartesian(cartesian, Ellipsoid.WGS84)
    if (!result || ![result.longitude, result.latitude, result.height].every(Number.isFinite)) {
      throw new RangeError('cartesian cannot be converted to a finite WGS84 coordinate')
    }
    return {
      longitude: CesiumMath.toDegrees(result.longitude),
      latitude: CesiumMath.toDegrees(result.latitude),
      height: result.height
    }
  }
}
