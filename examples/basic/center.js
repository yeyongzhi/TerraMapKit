import { Cartesian3, EllipsoidTerrainProvider, GridImageryProvider, ImageryLayer, Viewer } from 'cesium'
import { MapKit } from 'terra-map-kit/core'
import { modules } from './modules.js'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './center.css'

const element = id => document.getElementById(id)
const values = new Map(modules.map(module => [module.id, Object.fromEntries(module.fields.map(field => [field.key, field.value]))]))
let active, current, revision = 0
const base = import.meta.env.BASE_URL
element('legacy-link').href = `${base}legacy.html`
for (const module of modules) {
  const button = document.createElement('button')
  button.type = 'button'; button.dataset.module = module.id
  button.append(document.createTextNode(module.kit))
  const title = document.createElement('span'); title.textContent = module.title; button.append(title)
  button.addEventListener('click', () => { if (location.hash !== `#${module.id}`) location.hash = module.id })
  element('module-list').append(button)
}
function resources() {
  const viewer = current?.viewer
  element('resources').textContent = viewer && !viewer.isDestroyed() ? `原生 Viewer：${viewer instanceof Viewer ? '通过' : '失败'} · 影像 ${viewer.imageryLayers.length} · Entity ${viewer.entities.values.length} · 数据源 ${viewer.dataSources.length}` : `场景已清理 · 容器残留 ${element('map').childElementCount}`
}
function cleanup() {
  revision++
  const previous = current; current = undefined
  if (previous) {
    for (const disposable of previous.owned.reverse()) disposable.dispose()
    if (!previous.viewer.isDestroyed()) previous.viewer.destroy()
  }
  element('actions').replaceChildren(); resources()
}
function code(module, params) {
  const setup = `import { Cartesian3, Color, EllipsoidTerrainProvider, GridImageryProvider, ImageryLayer, JulianDate } from 'cesium'\nimport { createMap } from 'terra-map-kit/core'\nconst viewer = createMap('map', {\n  baseLayerPicker: false,\n  baseLayer: new ImageryLayer(new GridImageryProvider({})),\n  terrainProvider: new EllipsoidTerrainProvider(),\n  geocoder: false, animation: false, timeline: false\n})\nviewer.clock.shouldAnimate = true\nviewer.camera.setView({ destination: Cartesian3.fromDegrees(116.39, 39.9, 16000) })\n\n`
  let body = module.code(params)
  body = body.replace(/^(?:heat|cluster|layer|marker|sensors|tilesets)\.(?:setVisible|setClustering|show|alpha).*$/gm, '// 可选操作：$&')
  body = body.replace("image: '/pin.svg'", `image: '${base}pin.svg'`).replace("url: '/tiles/tileset.json'", `url: '${base}tiles/tileset.json'`)
  body = body.replace(/^(\w+\.dispose\(\)|\w+\.remove\(\)|off\(\))$/gm, '// 页面离开时：$1')
  if (module.id === 'layer' && params.kind !== 'imagery') body = body.replace('const layers =', `const data = Array.from({ length: 120 }, (_, i) => ({\n  id: 'sensor-' + i, longitude: 116.34 + i % 12 * 0.008,\n  latitude: 39.87 + Math.floor(i / 12) * 0.006,\n  height: 30, value: 0.2 + i % 5 * 0.2\n}))\nconst nextData = data.map(point => ({ ...point, value: point.value * 2 }))\nconst layers =`)
  return (module.id === 'map' ? '' : setup) + body + '\n\n// 最后清理 Viewer：viewer.destroy()'
}
function form(module) {
  const params = values.get(module.id)
  element('parameters').replaceChildren()
  for (const field of module.fields) {
    const label = document.createElement('label'); label.textContent = field.label
    const input = document.createElement(field.type === 'select' ? 'select' : 'input')
    input.name = field.key; input.id = `param-${field.key}`
    input.setAttribute('aria-label', field.label)
    if (field.type === 'select') for (const value of field.choices) { const option = document.createElement('option'); option.value = value; option.textContent = value; input.append(option) }
    else { input.type = field.type; input.required = true; if (field.type === 'number') { input.min = field.min; input.max = field.max; input.step = field.step } }
    input.value = params[field.key]
    input.addEventListener('input', () => { element('parameter-state').textContent = '待应用' })
    label.append(input); element('parameters').append(label)
  }
}
async function run() {
  cleanup()
  const version = revision, module = active, params = { ...values.get(module.id) }
  const owned = []
  element('status').textContent = '正在创建示例…'; element('code').textContent = code(module, params)
  element('parameter-state').textContent = '已应用'; element('copy-status').textContent = ''
  try {
    const viewer = MapKit.createMap(element('map'), { baseLayerPicker: false, baseLayer: new ImageryLayer(new GridImageryProvider({})), terrainProvider: new EllipsoidTerrainProvider(), geocoder: false, animation: false, timeline: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, ...module.viewerOptions?.(params) })
    current = { viewer, owned }; viewer.clock.shouldAnimate = true
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(116.39, 39.9, 16000) })
    const report = message => { if (version === revision) { element('status').textContent = message; resources() } }
    const off = viewer.scene.renderError.addEventListener((_scene, error) => report(`渲染失败：${error.message}`)); owned.push({ dispose: off })
    const ctx = {
      viewer, report,
      own: kit => { if (version !== revision) { kit.dispose(); throw new Error('示例已切换') } owned.push(kit); return kit },
      button: (label, callback) => {
        if (version !== revision) return
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label
        button.addEventListener('click', async () => {
          if (version !== revision) return
          button.disabled = true
          const previousStatus = element('status').textContent
          try { await callback(); if (version === revision) { if (element('status').textContent === previousStatus) report(`${module.kit} · ${label}已执行`); resources(); viewer.scene.requestRender() } }
          catch (error) { report(`操作失败：${error.message}`) }
          finally { button.disabled = false }
        })
        element('actions').append(button)
      }
    }
    await module.run(ctx, params)
    if (version === revision) resources()
  } catch (error) {
    if (version === revision) { cleanup(); element('status').textContent = `示例失败：${error.message}` }
  }
}
function navigate() {
  active = modules.find(module => module.id === location.hash.slice(1)) ?? modules[0]
  for (const button of element('module-list').children) button.setAttribute('aria-current', button.dataset.module === active.id ? 'page' : 'false')
  element('kit-name').textContent = active.kit; element('example-title').textContent = active.title; element('example-description').textContent = active.description
  const docsBase = base === '/' ? 'http://127.0.0.1:4173/' : base.replace(/examples\/$/, '')
  element('api-link').href = `${docsBase}kits/${active.kit}.html`
  form(active); void run()
}
element('parameters').addEventListener('submit', event => {
  event.preventDefault()
  const params = {}
  for (const field of active.fields) { const input = element(`param-${field.key}`); params[field.key] = field.type === 'number' ? Number(input.value) : input.value }
  values.set(active.id, params); void run()
})
element('rebuild').addEventListener('click', () => { form(active); void run() })
element('cleanup').addEventListener('click', () => { cleanup(); element('status').textContent = '当前示例已清理，可点击重建示例继续体验。' })
element('copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(element('code').textContent); element('copy-status').textContent = '代码已复制' }
  catch { element('copy-status').textContent = '浏览器未允许复制，可直接选中代码复制。' }
})
window.addEventListener('hashchange', navigate)
window.addEventListener('pagehide', cleanup)
navigate()
