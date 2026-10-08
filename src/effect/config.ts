import { Cartesian3, Color, Ellipsoid, Matrix4, Transforms } from 'cesium'
import { CoordinateKit, type DegreesPoint } from '../coordinate/index.js'
import { finite } from '../internal/index.js'
import { localArea } from '../internal/geometry.js'
import type { AnyEffectOptions, EffectKind, RippleEffectOptions, WaveEffectOptions, PulsePointOptions, RadarScanOptions, LineEffectOptions, FlowLineOptions, FlightArcOptions, WallEffectOptions } from './options.js'
export interface Config {
  input: AnyEffectOptions; color: Color; duration: number; loop: boolean; show: boolean; speed: number
  onComplete: AnyEffectOptions['onComplete']
  position: Cartesian3; height: number; frame: Matrix4; points: Cartesian3[]; heights: number[]
  radius: number; minRadius: number; count: number; length: number; amplitude: number; wavelength: number
  segments: number; width: number; pixelSize: number; minPixelSize: number; heading: number; angle: number
  glowPower: number; trailLength: number; arcHeight: number; wallHeight: number
}
function integer(value: number, name: string, min: number, max: number): number {
  finite(value, name, min, max)
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer`)
  return value
}
function point(value: DegreesPoint): DegreesPoint {
  if (!value || typeof value !== 'object') throw new TypeError('A geographic position is required')
  CoordinateKit.fromDegrees(value.longitude, value.latitude, value.height ?? 10)
  return { longitude: value.longitude, latitude: value.latitude, height: value.height ?? 10 }
}
const cartesian = (value: DegreesPoint) => CoordinateKit.fromDegrees(value.longitude, value.latitude, value.height)
export function normalize(options: AnyEffectOptions, kind: EffectKind): Config {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options must be an object')
  const input = { ...options } as AnyEffectOptions, color = input.color ?? Color.CYAN.withAlpha(0.8)
  if (!(color instanceof Color) || ![color.red, color.green, color.blue, color.alpha].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw new TypeError('Invalid Cesium color')
  input.color = Color.clone(color)
  for (const key of ['show', 'loop'] as const) if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new TypeError(`${key} must be boolean`)
  if (input.onComplete !== undefined && typeof input.onComplete !== 'function') throw new TypeError('onComplete must be a function')
  const c: Config = {
    input, color: input.color, duration: finite(input.duration ?? 3, 'duration', 0.01, 86400), loop: input.loop ?? true,
    show: input.show ?? true, speed: finite(input.speed ?? 1, 'speed', 0.001, 1000), onComplete: input.onComplete,
    position: Cartesian3.ZERO, height: 10, frame: Matrix4.IDENTITY, points: [], heights: [], radius: 1000, minRadius: 1,
    count: 1, length: 3000, amplitude: 300, wavelength: 1000, segments: 64, width: 3, pixelSize: 20,
    minPixelSize: 8, heading: 0, angle: 60, glowPower: 0.25, trailLength: 0.2, arcHeight: 1000, wallHeight: 500
  }
  if (['ripple', 'diffusion', 'wave', 'pulse', 'radar'].includes(kind)) {
    const p = input as RippleEffectOptions
    p.position = point(p.position); c.position = cartesian(p.position); c.height = p.position.height!
    c.frame = Transforms.eastNorthUpToFixedFrame(c.position, Ellipsoid.WGS84)
  }
  if (['ripple', 'diffusion', 'radar'].includes(kind)) {
    const p = input as RippleEffectOptions
    c.radius = finite(p.radius ?? 1000, 'radius', 1, 100000); c.minRadius = finite(p.minRadius ?? 1, 'minRadius', 1, c.radius)
    if (kind === 'ripple') c.count = integer(p.count ?? 3, 'count', 1, 8)
  }
  if (kind === 'wave') {
    const p = input as WaveEffectOptions
    c.length = finite(p.length ?? 3000, 'length', 1, 100000); c.amplitude = finite(p.amplitude ?? 300, 'amplitude', 0, 10000)
    c.wavelength = finite(p.wavelength ?? 1000, 'wavelength', 1, 100000); c.segments = integer(p.segments ?? 64, 'segments', 8, 256)
    c.width = finite(p.width ?? 3, 'width', 1, 10)
  }
  if (kind === 'pulse') {
    const p = input as PulsePointOptions
    c.pixelSize = finite(p.pixelSize ?? 20, 'pixelSize', 1, 256); c.minPixelSize = finite(p.minPixelSize ?? 8, 'minPixelSize', 1, c.pixelSize)
  }
  if (kind === 'radar') {
    const p = input as RadarScanOptions
    c.heading = finite(p.heading ?? 0, 'heading', -360, 360); c.angle = finite(p.angle ?? 60, 'angle', 1, 180)
    c.segments = integer(p.segments ?? 32, 'segments', 8, 256)
  }
  if (['glow', 'flow', 'wall', 'polygon'].includes(kind)) {
    const p = input as LineEffectOptions
    if (!Array.isArray(p.positions)) throw new TypeError('positions must be an array')
    if (p.positions.length < (kind === 'wall' || kind === 'polygon' ? 3 : 2) || p.positions.length > 512) throw new RangeError('Invalid vertex count (maximum 512)')
    p.positions = p.positions.map(point); c.points = p.positions.map(cartesian)
    if (kind === 'wall' || kind === 'polygon') {
      if (Cartesian3.equalsEpsilon(c.points[0]!, c.points.at(-1)!, 0, 1e-6)) { c.points.pop(); p.positions = p.positions.slice(0, -1) }
      localArea(c.points)
    } else for (let i = 1; i < c.points.length; i++) if (Cartesian3.distance(c.points[i - 1]!, c.points[i]!) < 0.001) throw new RangeError('Adjacent route vertices must differ')
    c.heights = p.positions.map(v => v.height!)
  }
  if (['glow', 'flow', 'arc'].includes(kind)) {
    const p = input as LineEffectOptions
    c.width = finite(p.width ?? 3, 'width', 1, 32); c.glowPower = finite(p.glowPower ?? 0.25, 'glowPower', 0, 1)
  }
  if (kind === 'flow') c.trailLength = finite((input as FlowLineOptions).trailLength ?? 0.2, 'trailLength', 0.001, 1)
  if (kind === 'arc') {
    const p = input as FlightArcOptions
    p.from = point(p.from); p.to = point(p.to); c.points = [cartesian(p.from), cartesian(p.to)]
    const distance = Cartesian3.distance(c.points[0]!, c.points[1]!)
    if (distance < 1 || distance > 100000) throw new RangeError('Flight arcs support endpoints 1 m–100 km apart')
    c.arcHeight = finite(p.arcHeight ?? 1000, 'arcHeight', 0, 100000); c.segments = integer(p.segments ?? 64, 'segments', 8, 256)
  }
  if (kind === 'wall') c.wallHeight = finite((input as WallEffectOptions).wallHeight ?? 500, 'wallHeight', 1, 100000)
  return c
}
