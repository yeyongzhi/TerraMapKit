import { Cartesian3, Color } from 'cesium'
import { MarkerKit } from 'terra-map-kit/marker'
const data = count => Array.from({ length: count }, (_, i) => ({ position: { longitude: 116.34 + i % 100 * 0.001, latitude: 39.86 + Math.floor(i / 100) * 0.001, height: 100 }, point: { pixelSize: 5 } }))
export const markerPerformance = {
  id: 'marker-performance', kit: 'MarkerKit', title: '标记批量性能基准', description: '比较逐个与批量创建、更新、移除；统计同步耗时、渲染请求和集合通知。',
  fields: [{ key: 'count', label: '标记数量', type: 'select', value: '1000', choices: ['100', '1000', '5000'] }],
  code: p => `import { MarkerKit } from 'terra-map-kit/marker'\nconst markers = new MarkerKit(viewer)\nconst data = Array.from({ length: ${p.count} }, (_, i) => ({\n  position: { longitude: 116.34 + i % 100 * 0.001, latitude: 39.86 + Math.floor(i / 100) * 0.001 }, point: { pixelSize: 5 }\n}))\nconst handles = markers.addMarkers(data)\nmarkers.patchMarkers(handles.map(h => ({ id: h.id, patch: { show: false } })))\nmarkers.removeMarkers(handles.map(h => h.id))\n// 页面离开时 markers.dispose()`,
  run: async (ctx, p) => {
    const viewer = ctx.viewer, count = Number(p.count), kit = ctx.own(new MarkerKit(viewer))
    viewer.scene.requestRenderMode = true; viewer.scene.maximumRenderTimeChange = Infinity
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(116.39, 39.9, 30000), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } })
    const records = document.createElement('textarea'); records.id = 'marker-benchmark'; records.rows = 12; records.readOnly = true; records.setAttribute('aria-label', '标记性能基准 JSON'); document.getElementById('actions').append(records)
    let notifications = 0, requests = 0, measuring = false, alive = true
    const nativeRender = viewer.scene.requestRender
    viewer.scene.requestRender = function(...args) { if (measuring) requests++; return nativeRender.apply(this, args) }
    const off = viewer.entities.collectionChanged.addEventListener(() => { if (measuring) notifications++ })
    ctx.own({ dispose() { alive = false; off(); viewer.scene.requestRender = nativeRender } })
    const timed = operation => {
      requests = notifications = 0; measuring = true; const start = performance.now()
      try { operation(); return { ms: +(performance.now() - start).toFixed(2), requests, notifications } } finally { measuring = false }
    }
    let handles = [], samples = []
    const create = timed(() => { handles = kit.addMarkers(data(count)) })
    ctx.button('批量更新颜色', () => {
      if (!handles.length) throw new Error('请重建示例后更新标记')
      const patch = timed(() => kit.patchMarkers(handles.map(h => ({ id: h.id, patch: { point: { pixelSize: 5, color: Color.ORANGE } } }))))
      ctx.report(`批量更新 ${handles.length} 个标记：${patch.ms} ms · 集合通知 ${patch.notifications} · 同步渲染请求 ${patch.requests}`)
    })
    ctx.button('运行对比基准（三轮）', async () => {
      kit.clear(); samples = []
      for (const mode of ['single', 'batch']) for (let round = 1; round <= 3; round++) {
        if (!alive) return
        const benchmark = new MarkerKit(viewer), input = data(count), baseline = viewer.entities.values.length
        const listenerBaseline = [viewer.entities.collectionChanged.numberOfListeners, viewer.clock.onTick.numberOfListeners, viewer.scene.postRender.numberOfListeners]
        let markers = []
        try {
          const add = timed(() => { markers = mode === 'batch' ? benchmark.addMarkers(input) : input.map(item => benchmark.addMarker(item)) })
          const patches = markers.map(h => ({ id: h.id, patch: { point: { pixelSize: 6, color: Color.ORANGE } } }))
          const patch = timed(() => { if (mode === 'batch') benchmark.patchMarkers(patches); else for (const item of patches) benchmark.patchMarker(item.id, item.patch) })
          const ids = markers.map(h => h.id)
          const remove = timed(() => { if (mode === 'batch') benchmark.removeMarkers(ids); else for (const id of ids) benchmark.removeMarker(id) })
          const listeners = [viewer.entities.collectionChanged.numberOfListeners, viewer.clock.onTick.numberOfListeners, viewer.scene.postRender.numberOfListeners]
          samples.push({ mode, count, round, add, patch, remove, residualEntities: viewer.entities.values.length - baseline, residualListeners: listeners.map((value, i) => value - listenerBaseline[i]) })
        } finally { benchmark.dispose() }
        records.value = JSON.stringify({ environment: { userAgent: navigator.userAgent, canvas: [viewer.scene.canvas.width, viewer.scene.canvas.height], requestRenderMode: true }, samples }, null, 2)
        await new Promise(resolve => requestAnimationFrame(resolve))
      }
      handles = []; ctx.report(`基准完成：${samples.length} 组 · Entity ${viewer.entities.values.length} · 结果可复制为 JSON。耗时不包含异步几何构建或 GPU 上传。`)
    })
    ctx.button('清理标记并检查资源', () => { kit.clear(); handles = []; ctx.report(`清理后：Entity ${viewer.entities.values.length} · 时钟监听总数 ${viewer.clock.onTick.numberOfListeners}`) })
    ctx.report(`${count} 个标记 · 批量创建 ${create.ms} ms · 集合通知 ${create.notifications} · 同步渲染请求 ${create.requests}`)
  }
}
