import type { Color, Entity } from 'cesium'
import type { DegreesPoint } from '../coordinate/index.js'
export interface EffectBaseOptions {
  id?: string; color?: Color; duration?: number; show?: boolean; loop?: boolean; speed?: number
  onComplete?: (handle: EffectHandle<EffectBaseOptions>) => void
}
export interface EffectOptions extends EffectBaseOptions { position: DegreesPoint }
export interface CircleEffectOptions extends EffectOptions { radius?: number; minRadius?: number }
export interface RippleEffectOptions extends CircleEffectOptions { count?: number }
export interface WaveEffectOptions extends EffectOptions { length?: number; amplitude?: number; wavelength?: number; segments?: number; width?: number }
export interface PulsePointOptions extends EffectOptions { pixelSize?: number; minPixelSize?: number }
export interface RadarScanOptions extends EffectOptions { radius?: number; heading?: number; angle?: number; segments?: number }
export interface LineEffectOptions extends EffectBaseOptions { positions: readonly DegreesPoint[]; width?: number; glowPower?: number }
export interface FlowLineOptions extends LineEffectOptions { trailLength?: number }
export interface FlightArcOptions extends EffectBaseOptions { from: DegreesPoint; to: DegreesPoint; arcHeight?: number; segments?: number; width?: number; glowPower?: number }
export interface PolygonPulseOptions extends EffectBaseOptions { positions: readonly DegreesPoint[] }
export interface WallEffectOptions extends PolygonPulseOptions { wallHeight?: number }
export type EffectKind = 'ripple' | 'diffusion' | 'wave' | 'pulse' | 'glow' | 'radar' | 'flow' | 'arc' | 'wall' | 'polygon'
export interface EffectHandle<T extends EffectBaseOptions = EffectOptions> {
  readonly id: string; readonly kind: EffectKind; readonly entities: readonly Entity[]
  readonly paused: boolean; readonly visible: boolean; readonly completed: boolean
  readonly currentTime: number; readonly duration: number; readonly speed: number
  /** Replace all options; restart the cycle, retaining pause state. */
  update(options: Omit<T, 'id'>): void
  /** Merge supplied options and retain the playback cursor. */
  patch(options: Partial<Omit<T, 'id'>>): void
  setVisible(show: boolean): void
  pause(): void; resume(): void; restart(): void; seek(seconds: number): void; setSpeed(speed: number): void
  remove(): boolean
}
export type AnyEffectOptions = RippleEffectOptions | WaveEffectOptions | PulsePointOptions | RadarScanOptions | LineEffectOptions | FlowLineOptions | FlightArcOptions | WallEffectOptions | PolygonPulseOptions
