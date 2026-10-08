import { Cartesian3, HeadingPitchRoll, Matrix3, Matrix4, Quaternion, Transforms, Ellipsoid } from 'cesium'
import { clonePosition, finite } from '../internal/index.js'
export interface TransformOptions { heading?: number; pitch?: number; roll?: number; scale?: number | Cartesian3 }
export class TransformKit {
  static direction(from: Cartesian3, to: Cartesian3): Cartesian3 {
    const delta = Cartesian3.subtract(clonePosition(to), clonePosition(from), new Cartesian3())
    if (Cartesian3.magnitude(delta) < 1e-6) throw new RangeError('Direction requires distinct points')
    return Cartesian3.normalize(delta, delta)
  }
  static quaternion(heading = 0, pitch = 0, roll = 0): Quaternion {
    return Quaternion.fromHeadingPitchRoll(new HeadingPitchRoll(finite(heading, 'heading'), finite(pitch, 'pitch'), finite(roll, 'roll')), new Quaternion())
  }
  static angles(quaternion: Quaternion): HeadingPitchRoll {
    if (!quaternion || ![quaternion.x, quaternion.y, quaternion.z, quaternion.w].every(Number.isFinite) || Quaternion.magnitude(quaternion) === 0) throw new TypeError('Invalid quaternion')
    return HeadingPitchRoll.fromQuaternion(Quaternion.normalize(quaternion, new Quaternion()), new HeadingPitchRoll())
  }
  static matrix(position: Cartesian3, options: TransformOptions = {}): Matrix4 {
    const rotation = Matrix3.fromQuaternion(TransformKit.quaternion(options.heading, options.pitch, options.roll))
    const local = Matrix4.fromRotationTranslation(rotation, Cartesian3.ZERO, new Matrix4())
    const scale = typeof options.scale === 'number' ? new Cartesian3(options.scale, options.scale, options.scale) : options.scale ?? new Cartesian3(1, 1, 1)
    for (const axis of ['x', 'y', 'z'] as const) finite(scale[axis], `scale.${axis}`, Number.MIN_VALUE)
    Matrix4.multiplyByScale(local, scale, local)
    return Matrix4.multiply(Transforms.eastNorthUpToFixedFrame(clonePosition(position), Ellipsoid.WGS84), local, new Matrix4())
  }
  static validate(matrix: Matrix4): Matrix4 {
    if (!matrix || !Array.from({ length: 16 }, (_, i) => matrix[i]).every(v => typeof v === 'number' && Number.isFinite(v))) throw new TypeError('matrix must contain 16 finite values')
    return Matrix4.clone(matrix)
  }
  static decompose(matrix: Matrix4) {
    const copy = TransformKit.validate(matrix), scale = Matrix4.getScale(copy, new Cartesian3())
    if (Math.min(scale.x, scale.y, scale.z) <= 0) throw new RangeError('Singular transform')
    return { position: Matrix4.getTranslation(copy, new Cartesian3()), scale, quaternion: Quaternion.fromRotationMatrix(Matrix4.getRotation(copy, new Matrix3()), new Quaternion()) }
  }
  static apply(matrix: Matrix4, point: Cartesian3): Cartesian3 {
    if (!point) throw new TypeError('point is required')
    finite(point.x, 'x'); finite(point.y, 'y'); finite(point.z, 'z')
    const result = Matrix4.multiplyByPoint(TransformKit.validate(matrix), point, new Cartesian3())
    if (![result.x, result.y, result.z].every(Number.isFinite)) throw new RangeError('Transform overflow')
    return result
  }
  static inverse(matrix: Matrix4): Matrix4 { return Matrix4.inverse(TransformKit.validate(matrix), new Matrix4()) }
  static rotateAround(matrix: Matrix4, center: Cartesian3, axis: Cartesian3, angle: number): Matrix4 {
    const origin = clonePosition(center)
    if (!axis || ![axis.x, axis.y, axis.z].every(Number.isFinite) || Cartesian3.magnitude(axis) === 0) throw new TypeError('axis must be nonzero and finite')
    const q = Quaternion.fromAxisAngle(Cartesian3.normalize(axis, new Cartesian3()), finite(angle, 'angle'))
    const rotation = Matrix4.fromRotationTranslation(Matrix3.fromQuaternion(q), origin, new Matrix4())
    const negative = Matrix4.fromTranslation(Cartesian3.negate(origin, new Cartesian3()))
    return Matrix4.multiply(Matrix4.multiply(rotation, negative, rotation), TransformKit.validate(matrix), new Matrix4())
  }
}
