import { Cartesian3, Cartographic, Ellipsoid, Math as CesiumMath } from 'cesium'

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
