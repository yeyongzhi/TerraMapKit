import { Cartesian3 } from 'cesium'
import { CoordinateKit, DrawKit } from 'terra-map-kit'
const sample = { type: 'Feature', id: 'polygon-1', properties: { label: '多边形' }, geometry: { type: 'Polygon', coordinates: [[[116.36, 39.88, 100], [116.42, 39.88, 100], [116.39, 39.93, 100], [116.36, 39.88, 100]]] } }
export const drawModule = {
  id: 'draw', kit: 'DrawKit', title: '绘制、编辑与 GeoJSON', description: '点线面绘制，顶点编辑与撤销重做；确认或取消后导出通用 GeoJSON。',
  fields: [{ key: 'kind', label: '几何类型', value: 'polygon', type: 'select', choices: ['point', 'polyline', 'polygon'] }, { key: 'width', label: '线宽 / px', value: 3, type: 'number', min: 1, max: 10, step: 1 }],
  code: p => `import { DrawKit } from 'terra-map-kit/draw'\nconst draws = new DrawKit(viewer)\ndraws.start({ type: '${p.kind}', width: ${p.width}, onFinish: result => {\n  const edit = draws.edit(result)\n  // edit.setMode('insert'); edit.undo(); edit.redo()\n  // edit.finish(); 或 edit.cancel()\n  // draws.toFeatureCollection() 导出已确认结果\n} })\n// 页面离开时 draws.dispose()`,
  run: async (ctx, p) => {
    ctx.viewer.camera.setView({ destination: Cartesian3.fromDegrees(116.39, 39.9, 16000), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } })
    let kit = ctx.own(new DrawKit(ctx.viewer)), session, editor, selected
    const area = document.createElement('textarea'); area.id = 'draw-geojson'; area.rows = 7; area.setAttribute('aria-label', '几何 GeoJSON'); area.value = JSON.stringify(sample, null, 2)
    const start = interactive => kit.start({ type: p.kind, width: p.width, interactive, onFinish: result => { session = undefined; selected = result; ctx.report(`已完成 ${result.type} · ${result.positions.length} 个顶点`) } })
    const edit = () => {
      if (editor) return editor
      if (!selected) throw new Error('请先完成绘制或导入几何')
      editor = kit.edit(selected, { onFinish: () => { editor = undefined; ctx.report('编辑已确认') }, onCancel: () => { editor = undefined; ctx.report('编辑已取消') }, onError: error => ctx.report(`编辑失败：${error.message}`) })
      return editor
    }
    session = start(true)
    ctx.button('撤销绘制顶点', () => session?.undo()); ctx.button('完成绘制', () => session?.finish())
    ctx.button('重新绘制', () => { kit.clear(); selected = undefined; session = start(true) })
    ctx.button('生成示例几何', () => {
      kit.clear(); selected = undefined; const drawing = start(false); session = drawing
      const coordinates = sample.geometry.coordinates[0].slice(0, p.kind === 'point' ? 1 : p.kind === 'polyline' ? 2 : 3)
      for (const [lon, lat, height] of coordinates) drawing.addPoint(CoordinateKit.fromDegrees(lon, lat, height))
      if (p.kind !== 'point') drawing.finish()
    })
    for (const [mode, label] of [['vertex', '拖动顶点'], ['insert', '插入顶点'], ['delete', '删除顶点'], ['translate', '整体移动']]) ctx.button(label, () => edit().setMode(mode))
    ctx.button('撤销编辑', () => edit().undo()); ctx.button('重做编辑', () => edit().redo())
    ctx.button('确认编辑', () => { if (!editor) throw new Error('请先开始编辑'); editor.finish() }); ctx.button('取消编辑', () => editor?.cancel())
    document.getElementById('actions').append(area)
    ctx.button('导入 GeoJSON', () => {
      const candidate = new DrawKit(ctx.viewer)
      let results
      try { results = candidate.fromGeoJSON(JSON.parse(area.value), { width: p.width }) } catch (error) { candidate.dispose(); throw error }
      kit.dispose(); kit = ctx.own(candidate); session = undefined; editor = undefined; selected = results[0]
      ctx.report(`已导入 ${results.length} 个几何对象，编辑操作作用于第一个对象`)
    })
    ctx.button('导出 GeoJSON', () => { if (editor || session) throw new Error('请先完成或取消当前绘制/编辑'); area.value = JSON.stringify(kit.toFeatureCollection(), null, 2); ctx.report('已导出通用 GeoJSON') })
    ctx.button('取消绘制', () => { kit.cancel(); session = undefined })
    ctx.report('左键添加点，右键完成；也可生成或导入通用几何')
  }
}
