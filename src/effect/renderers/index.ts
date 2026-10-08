import { Cartesian3, type Entity } from 'cesium'
import type { Config } from '../config.js'
import type { EffectKind } from '../options.js'
import { createContext, type Phase, type RenderState, type Renderer } from './context.js'
import { renderCircle } from './circle.js'
import { renderPulse } from './pulse.js'
import { renderWave } from './wave.js'
import { renderRadar } from './radar.js'
import { renderGlow } from './glow.js'
import { renderArc } from './arc.js'
import { renderFlow } from './flow.js'
import { renderPolygon } from './polygon.js'
import { renderWall } from './wall.js'
const renderers: Record<EffectKind, Renderer> = { ripple: renderCircle, diffusion: renderCircle, pulse: renderPulse, wave: renderWave, radar: renderRadar, glow: renderGlow, arc: renderArc, flow: renderFlow, polygon: renderPolygon, wall: renderWall }
export function buildEntities(state: RenderState, phase: Phase): Entity[] { return renderers[state.kind](createContext(state, phase)) }
export function needsRebuild(previous: Config, next: Config, kind: EffectKind): boolean {
  if (!Cartesian3.equals(previous.position, next.position) || previous.count !== next.count || previous.segments !== next.segments) return true
  if (previous.points.length !== next.points.length || previous.points.some((p, i) => !Cartesian3.equals(p, next.points[i]!))) return true
  return kind === 'arc' && previous.arcHeight !== next.arcHeight || kind === 'wall' && previous.wallHeight !== next.wallHeight
}
