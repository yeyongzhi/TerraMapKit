import { Cartesian3, Color } from 'cesium'
import { EffectKit } from 'terra-map-kit'
const center = { longitude: 116.39, latitude: 39.9, height: 100 }
const route = [{ ...center, longitude: 116.35, latitude: 39.88 }, center, { ...center, longitude: 116.43, latitude: 39.92 }]
const polygon = [{ ...center, longitude: 116.37, latitude: 39.88 }, { ...center, longitude: 116.42, latitude: 39.88 }, { ...center, longitude: 116.42, latitude: 39.92 }, { ...center, longitude: 116.37, latitude: 39.92 }]
const methods = { ripple: 'addRipple', diffusion: 'addDiffusionCircle', wave: 'addWave', pulse: 'addPulsePoint', glow: 'addGlowLine', radar: 'addRadarScan', flow: 'addFlowLine', arc: 'addFlightArc', wall: 'addWall', polygon: 'addPolygonPulse' }
const select = (key, label, value, choices) => ({ key, label, value, choices, type: 'select' })
const number = (key, label, value, min, max, step = 1) => ({ key, label, value, min, max, step, type: 'number' })
const json = value => JSON.stringify(value, null, 2)
function camera(viewer, height = 20000) { viewer.camera.setView({ destination: Cartesian3.fromDegrees(116.39, 39.9, height), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } }) }
function options(p) {
  const common = { duration: p.duration, loop: p.playback === 'loop' }
  if (p.kind === 'glow' || p.kind === 'flow') return { ...common, positions: route, width: 6 }
  if (p.kind === 'arc') return { ...common, from: route[0], to: route[2], arcHeight: p.radius, width: 6 }
  if (p.kind === 'wall' || p.kind === 'polygon') return { ...common, positions: polygon, ...(p.kind === 'wall' ? { wallHeight: p.radius } : {}) }
  if (p.kind === 'wave') return { ...common, position: center, length: 10000, wavelength: p.radius, amplitude: 1000 }
  if (p.kind === 'pulse') return { ...common, position: center, pixelSize: 40, minPixelSize: 12 }
  return { ...common, position: center, radius: p.radius }
}
export const effectModule = {
  id: 'effect', kit: 'EffectKit', title: '十种地图特效', description: '点、圆、扫描、路线与区域特效；支持局部更新、时间控制和一次播放。',
  fields: [select('kind', '特效类型', 'ripple', Object.keys(methods)), number('radius', '半径 / 波长 / 抬升高度（m）', 3000, 100, 10000, 100), number('duration', '周期 / s', 3, 0.5, 10, 0.5), select('playback', '播放方式', 'loop', ['loop', 'once'])],
  code: p => `import { EffectKit } from 'terra-map-kit/effect'\nconst effects = new EffectKit(viewer)\nconst effect = effects.${methods[p.kind]}(${json(options(p))})\n// 可选操作：\n// effect.patch({ color: Color.ORANGE })\n// effect.setVisible(false)\n// effect.seek(1)\n// effect.setSpeed(2)\n// effects.pauseAll()\n// effects.clear()\n// 页面离开时：effects.dispose()`,
  run: async (ctx, p) => {
    camera(ctx.viewer); const kit = ctx.own(new EffectKit(ctx.viewer))
    const h = kit[methods[p.kind]]({ ...options(p), onComplete: () => ctx.report(`${p.kind} 播放完成；可重新播放。`) })
    ctx.button('暂停／恢复', () => h.paused ? h.resume() : h.pause())
    ctx.button('显示／隐藏', () => h.setVisible(!h.visible))
    ctx.button('局部更新颜色', () => h.patch({ color: Color.ORANGE }))
    ctx.button('重新播放', () => h.restart())
    ctx.button('跳至半周期', () => h.seek(h.duration / 2))
    ctx.button('切换 1／2 倍速', () => h.setSpeed(h.speed === 1 ? 2 : 1))
    ctx.button('全部暂停', () => kit.pauseAll()); ctx.button('全部恢复', () => kit.resumeAll())
    ctx.button('清空特效', () => { kit.clear(); ctx.report(`特效 ${kit.size} · Entity ${ctx.viewer.entities.values.length} · 时钟监听 ${ctx.viewer.clock.onTick.numberOfListeners}`) })
    ctx.report(`${p.kind} · ${p.duration} 秒 · ${p.playback === 'once' ? '播放一次' : '循环播放'}`)
  }
}
export const effectPerformance = {
  id: 'effect-performance', kit: 'EffectKit', title: '特效性能观察', description: '比较数量与类型；预热后测量 5 秒实际渲染帧率，结果仅代表当前设备。',
  fields: [select('count', '特效数量', '100', ['10', '100', '500']), select('kind', '特效类型', 'pulse', ['pulse', 'ripple', 'wave'])],
  code: p => `import { EffectKit } from 'terra-map-kit/effect'\nconst effects = new EffectKit(viewer)\nfor (let i = 0; i < ${p.count}; i++) {\n  const position = { longitude: 116.34 + i % 25 * 0.004, latitude: 39.86 + Math.floor(i / 25) * 0.004, height: 100 }\n  effects.${methods[p.kind]}({ position${p.kind === 'ripple' ? ', radius: 180, count: 3' : p.kind === 'wave' ? ', length: 200, amplitude: 30, wavelength: 100, segments: 32' : ', pixelSize: 10, minPixelSize: 4'} })\n}\n// 页面离开时：effects.dispose()`,
  run: async (ctx, p) => {
    camera(ctx.viewer, 30000); const kit = ctx.own(new EffectKit(ctx.viewer)), start = performance.now()
    for (let i = 0; i < Number(p.count); i++) {
      const position = { longitude: 116.34 + i % 25 * 0.004, latitude: 39.86 + Math.floor(i / 25) * 0.004, height: 100 }
      kit[methods[p.kind]]({ position, radius: 180, count: 3, length: 200, amplitude: 30, wavelength: 100, segments: 32, pixelSize: 10, minPixelSize: 4 })
    }
    const creation = performance.now() - start
    let measuring = false, frames = 0, measuredAt = 0, warmUntil = 0
    const off = ctx.viewer.scene.postRender.addEventListener(() => {
      if (!measuring) return
      const now = performance.now()
      if (now < warmUntil) return
      if (!measuredAt) measuredAt = now
      frames++
      if (now - measuredAt >= 5000) {
        measuring = false
        ctx.report(`${p.count} 个 ${p.kind} · 创建 ${creation.toFixed(1)} ms · 渲染 ${(1000 * (frames - 1) / (now - measuredAt)).toFixed(1)} FPS · Entity ${ctx.viewer.entities.values.length} · 时钟监听 ${ctx.viewer.clock.onTick.numberOfListeners} · ${ctx.viewer.scene.canvas.width}×${ctx.viewer.scene.canvas.height}`)
      }
    })
    ctx.own({ dispose: off })
    ctx.button('测量帧率（预热 1 秒 + 采样 5 秒）', () => { measuring = true; frames = 0; measuredAt = 0; warmUntil = performance.now() + 1000; ctx.report('正在预热并采样渲染帧率…') })
    ctx.button('全部暂停', () => kit.pauseAll()); ctx.button('全部恢复', () => kit.resumeAll())
    ctx.button('清空并检查资源', () => { measuring = false; kit.clear(); ctx.report(`清理后：特效 ${kit.size} · Entity ${ctx.viewer.entities.values.length} · 时钟监听 ${ctx.viewer.clock.onTick.numberOfListeners}`) })
    ctx.report(`${p.count} 个 ${p.kind} · 创建 ${creation.toFixed(1)} ms · Entity ${ctx.viewer.entities.values.length}；点击测量按钮采样。`)
  }
}
