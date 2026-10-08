import { Cartesian3, Color } from 'cesium'
import { MarkerKit, PrimitiveMarkerKit } from 'terra-map-kit/marker'
const positions = count => Array.from({ length: count }, (_, i) => ({ longitude: 116.34 + i % 250 * .0004, latitude: 39.86 + Math.floor(i / 250) * .0004, height: 100 }))
const chunks = (items, operation) => { for (let i = 0; i < items.length; i += 10000) operation(items.slice(i, i + 10000)) }
const timed = operation => { const start = performance.now(); const result = operation(); return { result, ms: +(performance.now() - start).toFixed(2) } }
export const primitivePerformance = {
  id: 'primitive-performance', kit: 'MarkerKit', title: 'Primitive 点位与性能', description: '点集合、图标集合、拾取及距离控制；比较 Entity 与 Primitive 创建、更新和清理。',
  fields: [{ key: 'count', label: '点位数量', type: 'select', value: '1000', choices: ['1000', '10000', '50000'] }],
  code: () => `import { PrimitiveMarkerKit } from 'terra-map-kit/marker'\nconst points = new PrimitiveMarkerKit(viewer, 'point')\nconst handles = points.addMarkers([{ position: { longitude: 116.39, latitude: 39.9, height: 100 },\n  display: { distance: { near: 0, far: 100000 }, scale: { near: 100, far: 100000, nearValue: 1, farValue: .2 } } }])\npoints.onClick(({ marker }) => console.log(marker.id))\npoints.patchMarkers(handles.map(h => ({ id: h.id, patch: { pixelSize: 8 } })))\npoints.dispose()`,
  run: async (ctx, p) => {
    const viewer = ctx.viewer, count = Number(p.count), input = positions(count)
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16
    const c = canvas.getContext('2d'); c.fillStyle = '#ffb14e'; c.fillRect(0, 0, 16, 16)
    const image = canvas.toDataURL()
    viewer.scene.requestRenderMode = true; viewer.scene.maximumRenderTimeChange = Infinity
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(116.39, 39.9, 30000), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } })
    let alive = true, running = false, current
    const pendingFrames = new Set()
    ctx.own({ dispose() { alive = false; for (const finish of [...pendingFrames]) finish(); current?.dispose() } })
    const records = document.createElement('textarea'); records.id = 'primitive-benchmark'; records.rows = 12; records.readOnly = true; records.setAttribute('aria-label', 'Primitive 性能基准 JSON'); document.getElementById('actions').append(records)
    const baseline = () => ({ entities: viewer.entities.values.length, collections: viewer.scene.primitives.length, listeners: [viewer.clock.onTick.numberOfListeners, viewer.scene.postRender.numberOfListeners, viewer.entities.collectionChanged.numberOfListeners] })
    const frame = () => new Promise(resolve => {
      if (!alive) { resolve(); return }
      const finish = () => { off(); pendingFrames.delete(finish); resolve() }
      const off = viewer.scene.postRender.addEventListener(finish); pendingFrames.add(finish); viewer.scene.requestRender()
    })
    const preview = () => {
      current?.dispose(); current = new PrimitiveMarkerKit(viewer, 'point')
      current.addMarkers(input.map(position => ({ position, pixelSize: 7, display: { distance: { near: 0, far: 100000 }, scale: { near: 100, far: 100000, nearValue: 1, farValue: .2 }, translucency: { near: 100, far: 100000, nearValue: 1, farValue: .2 } } })))
      current.onClick(({ marker }) => ctx.report(`拾取 Primitive：${marker.id}`))
      ctx.report(`${count} 个 Primitive 点位已创建；点击点位可拾取。`)
    }
    preview()
    ctx.button('集合显隐', () => { if (running || !current) return; current.setVisible(false); ctx.report('集合已隐藏，重建示例可恢复') })
    ctx.button('运行 Entity / Primitive 对比', async () => {
      if (running) return
      running = true; current?.dispose(); current = undefined
      const samples = []
      try {
        // Cesium lazily creates and retains its Entity visualizer collections until Viewer destruction.
        const warmup = viewer.entities.add({ position: Cartesian3.fromDegrees(116.39, 39.9, 100), point: { pixelSize: 5 } })
        try { await frame() } finally { if (!viewer.isDestroyed()) viewer.entities.remove(warmup) }
        if (!alive) return
        await frame(); if (!alive) return
        const original = baseline()
        for (const mode of ['entity-point', 'primitive-point', 'primitive-billboard']) {
          if (!alive) return
          const start = baseline(), kit = mode === 'entity-point' ? new MarkerKit(viewer) : new PrimitiveMarkerKit(viewer, mode === 'primitive-point' ? 'point' : 'billboard')
          current = kit
          let handles = []
          try {
            const data = input.map(position => mode === 'entity-point' ? { position, point: { pixelSize: 5, outlineWidth: 0 } } : { position, pixelSize: 5, ...(mode === 'primitive-billboard' ? { image, width: 5, height: 5 } : {}) })
            const add = timed(() => chunks(data, chunk => handles.push(...kit.addMarkers(chunk)))).ms
            const firstFrameStart = performance.now(); await frame()
            if (mode === 'primitive-billboard') {
              const deadline = performance.now() + 15000
              while (alive && !handles.every(h => h.primitive.ready)) {
                if (performance.now() > deadline) throw new Error('图标纹理准备超时')
                await frame()
              }
            }
            const frameWait = +(performance.now() - firstFrameStart).toFixed(2)
            if (!alive) return
            const patches = handles.map(h => ({ id: h.id, patch: mode === 'entity-point' ? { point: { pixelSize: 6, color: Color.ORANGE, outlineWidth: 0 } } : { color: Color.ORANGE, ...(mode === 'primitive-point' ? { pixelSize: 6 } : { width: 6, height: 6 }) } }))
            const patch = timed(() => chunks(patches, chunk => kit.patchMarkers(chunk))).ms
            await frame(); if (!alive) return
            const ids = handles.map(h => h.id), remove = timed(() => chunks(ids, chunk => kit.removeMarkers(chunk))).ms
            kit.dispose(); current = undefined; await frame(); if (!alive) return
            const end = baseline()
            samples.push({ mode, count, add, patch, remove, frameWait, residualEntities: end.entities - start.entities, residualCollections: end.collections - start.collections, residualListeners: end.listeners.map((n, i) => n - start.listeners[i]) })
            records.value = JSON.stringify({ environment: { userAgent: navigator.userAgent, canvas: [viewer.scene.canvas.width, viewer.scene.canvas.height], requestRenderMode: true }, samples }, null, 2)
          } finally { kit.dispose(); if (current === kit) current = undefined }
        }
        ctx.report(`对比完成：${samples.length} 组 · Entity 残留 ${viewer.entities.values.length - original.entities} · 集合残留 ${viewer.scene.primitives.length - original.collections}`)
      } finally { running = false }
    })
    ctx.button('清理集合', () => { if (running) return; current?.dispose(); current = undefined; ctx.report('Primitive 集合已清理') })
  }
}
