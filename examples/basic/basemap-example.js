import { Color, GridImageryProvider } from 'cesium'
import { LayerKit, createImageryProvider } from 'terra-map-kit/layer'

export async function runBasemap(ctx, params) {
  const kit = ctx.own(new LayerKit(ctx.viewer))
  const background = ctx.viewer.imageryLayers.get(0)
  await kit.setBaseLayer({ provider: new GridImageryProvider({}), alpha: params.alpha })
  if (background) ctx.viewer.imageryLayers.remove(background)
  const container = document.createElement('div'); container.className = 'basemap-settings'
  const field = (name, title, type = 'text', value = '') => {
    const label = document.createElement('label'); label.textContent = title
    const input = document.createElement('input'); input.id = `basemap-${name}`; input.type = type; input.value = value; input.setAttribute('aria-label', title)
    label.append(input); container.append(label); return input
  }
  const label = document.createElement('label'); label.textContent = '底图来源'
  const source = document.createElement('select'); source.id = 'basemap-source'; source.setAttribute('aria-label', '底图来源')
  for (const [value, text] of [['grid', '离线网格'], ['amap', '高德 XYZ'], ['tianditu', '天地图 WMTS'], ['xyz', '通用 XYZ'], ['wmts', '通用 WMTS'], ['wms', '通用 WMS']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = text; source.append(option)
  }
  label.append(source); container.append(label)
  const url = field('url', '服务 URL'); url.placeholder = 'XYZ 包含 {z}/{x}/{y}，WMS/WMTS 填服务地址'
  const key = field('key', '天地图 key', 'password'); key.autocomplete = 'off'
  const layer = field('layer', '图层名称', 'text', 'vec')
  const matrix = field('matrix', 'WMTS 矩阵 ID', 'text', 'w')
  const annotations = field('annotations', '叠加天地图注记', 'checkbox'); annotations.checked = true
  const opacity = field('alpha', '底图透明度', 'range', String(params.alpha)); opacity.min = 0; opacity.max = 1; opacity.step = 0.05
  const updateFields = () => {
    const type = source.value
    url.parentElement.hidden = type === 'grid' || type === 'tianditu'
    key.parentElement.hidden = type !== 'tianditu'
    layer.parentElement.hidden = !['tianditu', 'wmts', 'wms'].includes(type)
    matrix.parentElement.hidden = type !== 'wmts'
    annotations.parentElement.hidden = type !== 'tianditu'
  }
  source.addEventListener('change', updateFields); updateFields()
  opacity.addEventListener('input', () => { const current = kit.getBaseLayer(); if (current) { current.alpha = Number(opacity.value); ctx.viewer.scene.requestRender() } })
  const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = '高德需提供可用 XYZ 地址；天地图需 key。在线服务需支持 CORS。高德坐标偏移需应用处理；密钥不会写入代码示例。'; container.append(hint)
  document.getElementById('actions').append(container)
  ctx.button('切换底图', async () => {
    const type = source.value
    let provider, annotationProvider
    if (type === 'grid') provider = new GridImageryProvider({ color: Color.CYAN })
    else {
      const options = type === 'tianditu' ? { key: key.value, layer: layer.value } : type === 'wmts'
        ? { url: url.value, layer: layer.value, style: 'default', format: 'image/png', tileMatrixSetID: matrix.value }
        : type === 'wms' ? { url: url.value, layers: layer.value, parameters: { transparent: true, format: 'image/png' } }
          : { url: url.value }
      if (type !== 'tianditu' && !url.value.trim()) throw new Error('请填写服务 URL；当前底图保留')
      provider = createImageryProvider({ type, options })
      const overlay = { vec: 'cva', img: 'cia', ter: 'cta' }[layer.value]
      if (type === 'tianditu' && annotations.checked && overlay) annotationProvider = createImageryProvider({ type, options: { key: key.value, layer: overlay } })
    }
    ctx.report(`正在加载 ${type}；成功后替换，失败保留当前底图`)
    try {
      await kit.setBaseLayer({ provider, annotations: annotationProvider, alpha: Number(opacity.value), timeoutMs: 10000 })
      ctx.report(`底图切换成功：${type}${annotationProvider ? ' + 注记' : ''}`)
    } catch (error) { ctx.report(`底图切换失败，保留原底图：${error.message}`) }
  })
  ctx.button('移除底图', () => kit.removeBaseLayer())
  ctx.report('离线网格底图已创建；配置来源后点击切换底图。')
}
