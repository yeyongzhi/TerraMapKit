import { drawModule } from './draw-example.js'
import { runBasemap } from './basemap-example.js'
import { markerPerformance } from './marker-performance.js'
import { primitivePerformance } from './primitive-performance.js'
import { infrastructureModules } from './infrastructure-examples.js'
import { effectModule, effectPerformance } from './effect-examples.js'
import { Color, GridImageryProvider, ImageryLayer, JulianDate } from 'cesium'
import { CoordinateKit, GeometryKit, LayerKit, MaskKit, EffectKit, PickKit, DrawKit, CameraKit, PopupKit, MeasureKit, TilesetKit, TrackKit, MarkerKit } from 'terra-map-kit'

const center = { longitude: 116.39, latitude: 39.9, height: 100 }
const position = (longitude = center.longitude, latitude = center.latitude, height = center.height) => CoordinateKit.fromDegrees(longitude, latitude, height)
const number = (key, label, value, min, max, step = 1) => ({ key, label, value, min, max, step, type: 'number' })
const select = (key, label, value, choices) => ({ key, label, value, choices, type: 'select' })
const text = (key, label, value) => ({ key, label, value, type: 'text' })
const json = value => JSON.stringify(value, null, 2)
const snippet = (module, kit, body) => `import { ${kit} } from 'terra-map-kit/${module}'\n${body}`
const samplePoints = Array.from({ length: 120 }, (_, i) => ({ id: `point-${i}`, longitude: 116.34 + i % 12 * 0.008, latitude: 39.87 + Math.floor(i / 12) * 0.006, height: 30, value: 0.2 + i % 5 * 0.2 }))
const bounds = { west: 116.30, south: 39.84, east: 116.47, north: 39.95 }
function camera(viewer, height = 16000) { viewer.camera.setView({ destination: position(center.longitude, center.latitude, height), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } }) }
function pin(viewer) { viewer.entities.add({ position: position(), point: { pixelSize: 12, color: Color.CYAN } }) }

export const modules = [
  {
    id: 'map', kit: 'MapKit', title: '地图创建', description: '创建原生 Viewer，调整底图网格与背景颜色。',
    fields: [number('cells', '网格数量', 8, 2, 32), select('background', '背景', '#152a44', ['#152a44', '#123d32', '#3d2438'])],
    viewerOptions: p => ({ baseLayer: new ImageryLayer(new GridImageryProvider({ cells: p.cells, backgroundColor: Color.fromCssColorString(p.background) })) }),
    code: p => `import { GridImageryProvider, ImageryLayer, Color } from 'cesium'\nimport { MapKit } from 'terra-map-kit/core'\nconst viewer = MapKit.createMap('map', {\n  baseLayerPicker: false,\n  baseLayer: new ImageryLayer(new GridImageryProvider({\n    cells: ${p.cells}, backgroundColor: Color.fromCssColorString(${json(p.background)})\n  }))\n})\n// 应用结束时调用 viewer.destroy()`,
    run: async ctx => { ctx.report('原生 Viewer 已创建；使用顶部按钮重建或清理。') }
  },
  {
    id: 'coordinate', kit: 'CoordinateKit', title: '坐标转换', description: 'WGS84 转换、ENU 米制偏移与三维距离；在地图上查看结果。',
    fields: [number('longitude', '经度 / °', 116.39, -180, 180, 0.01), number('latitude', '纬度 / °', 39.9, -90, 90, 0.01), number('height', '椭球高度 / m', 100, 0, 100000)],
    code: p => snippet('coordinate', 'CoordinateKit, GeometryKit', `const point = CoordinateKit.fromDegrees(${p.longitude}, ${p.latitude}, ${p.height})\nconst degrees = CoordinateKit.toDegrees(point)\nconst shifted = CoordinateKit.offset(point, 500, 300, 0)\nconst local = CoordinateKit.toLocal(point, shifted)\nconst distance = GeometryKit.polylineLength([point, shifted])\nconsole.log(degrees, local, distance)`),
    run: async (ctx, p) => { const point = position(p.longitude, p.latitude, p.height); ctx.viewer.entities.add({ position: point, point: { pixelSize: 15, color: Color.ORANGE } }); ctx.viewer.camera.setView({ destination: position(p.longitude, p.latitude, p.height + 20000) }); const shifted = CoordinateKit.offset(point, 500, 300); ctx.viewer.entities.add({ position: shifted, point: { pixelSize: 15, color: Color.CYAN } }); ctx.viewer.entities.add({ polyline: { positions: [point, shifted], width: 3, material: Color.CYAN } }); ctx.report(`ENU 偏移：东 500 米 / 北 300 米；三维距离 ${GeometryKit.polylineLength([point, shifted]).toFixed(2)} 米；Cartesian3：${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)}；往返：${json(CoordinateKit.toDegrees(point))}`) }
  },
  {
    id: 'layer', kit: 'LayerKit', title: '底图、影像与数据图层', description: '切换网格、高德、天地图及 XYZ/WMTS/WMS；体验热力图与点聚合。',
    fields: [select('kind', '图层类型', 'basemap', ['basemap', 'heatmap', 'cluster', 'imagery']), number('alpha', '影像透明度', 0.75, 0, 1, 0.05), number('radius', '热力核半径 / 纹理 px', 24, 1, 128), number('pixelRange', '聚合距离 / 屏幕 px', 55, 0, 300)],
    code: p => p.kind === 'basemap' ? snippet('layer', 'LayerKit', `const layers = new LayerKit(viewer)\nawait layers.setBaseLayer({ provider: new GridImageryProvider({}), alpha: ${p.alpha} })\n// 高德：createImageryProvider({ type: 'amap', options: { url: amapXYZUrl } })\n// 天地图：createImageryProvider({ type: 'tianditu', options: { key: 'YOUR_TIANDITU_KEY', layer: 'vec' } })\n// 注记通过 setBaseLayer({ provider, annotations: annotationProvider }) 一起切换\n// 也可使用 type: 'xyz' / 'wmts' / 'wms' 与原生配置\n// import { createImageryProvider } from 'terra-map-kit/layer'\n// 等待 Provider 和首张测试瓦片，失败保留当前底图\n// layers.removeBaseLayer()\nlayers.dispose()`) : snippet('layer', 'LayerKit', `const layers = new LayerKit(viewer)\n${p.kind === 'heatmap' ? `// data 为通用加权点数组\nconst heat = await layers.addHeatmapLayer({\n  data, bounds: ${json(bounds)}, radius: ${p.radius}, max: 2, alpha: ${p.alpha}\n})\nawait heat.setData(nextData)\nheat.setVisible(false)` : p.kind === 'cluster' ? `const cluster = await layers.addClusterLayer({ data, pixelRange: ${p.pixelRange} })\ncluster.setData(nextData)\ncluster.setClustering(false)` : `// import { GridImageryProvider } from 'cesium'\nconst layer = await layers.addImageLayer({\n  provider: new GridImageryProvider({}), alpha: ${p.alpha}\n})\nlayer.show = false`}\nlayers.dispose()`),
    run: async (ctx, p) => {
      document.getElementById('param-radius').parentElement.hidden = p.kind !== 'heatmap'
      document.getElementById('param-pixelRange').parentElement.hidden = p.kind !== 'cluster'
      if (p.kind === 'basemap') return runBasemap(ctx, p)
      const kit = ctx.own(new LayerKit(ctx.viewer)); camera(ctx.viewer, 35000)
      let handle
      if (p.kind === 'heatmap') { handle = await kit.addHeatmapLayer({ data: samplePoints, bounds, radius: p.radius, max: 2, alpha: p.alpha }); ctx.button('权重加倍', () => handle.setData(samplePoints.map(point => ({ ...point, value: point.value * 2 })))) }
      else if (p.kind === 'cluster') { handle = await kit.addClusterLayer({ data: samplePoints, pixelRange: p.pixelRange }); ctx.button('开启／关闭聚合', () => handle.setClustering(!handle.dataSource.clustering.enabled)); const pick = ctx.own(new PickKit(ctx.viewer)); pick.onClick(event => { const member = event.picked?.id ?? event.picked?.primitive?.id; if (Array.isArray(member)) ctx.report(`聚合包含 ${member.length} 点：${member.map(entity => entity.id).join('、')}`) }) }
      else { const layer = await kit.addImageLayer({ provider: new GridImageryProvider({ color: Color.ORANGE, cells: 20 }), alpha: p.alpha }); handle = { setVisible: show => { layer.show = show; ctx.viewer.scene.requestRender() }, remove: () => kit.removeImageLayer(layer) } }
      let show = true; ctx.button('显示／隐藏', () => handle.setVisible(show = !show)); ctx.button('移除图层', () => handle.remove()); ctx.report(`LayerKit · ${p.kind} 已创建；数据图层使用 120 个示例观测点。`)
    }
  },
  {
    id: 'marker', kit: 'MarkerKit', title: '地图标记', description: '点、图片、文字与组合标记；点击标记读取标记 ID。',
    fields: [select('kind', '标记类型', 'image', ['point', 'image', 'label', 'combined']), text('text', '文字标签', '文字标记'), number('size', '标记尺寸 / px', 32, 8, 96), select('color', '点颜色', '#22d3ee', ['#22d3ee', '#fb923c', '#a78bfa'])],
    code: p => snippet('marker', 'MarkerKit', `const markers = new MarkerKit(viewer)\nconst marker = markers.addMarker({\n  id: 'station', position: ${json(center)},\n  ${p.kind === 'point' || p.kind === 'combined' ? `point: { pixelSize: ${p.size}, color: Color.fromCssColorString(${json(p.color)}) },\n  ` : ''}${p.kind === 'image' || p.kind === 'combined' ? `image: { image: '/pin.svg', width: ${p.size}, height: ${p.size * 1.25} },\n  ` : ''}${p.kind !== 'point' ? `label: { text: ${json(p.text)} },\n  ` : ''}onClick: event => console.log(event.id, event.entity)\n})\nmarker.setVisible(false)\nmarker.remove()\nmarkers.dispose()`),
    run: async (ctx, p) => {
      camera(ctx.viewer); const kit = ctx.own(new MarkerKit(ctx.viewer))
      const options = { position: center, ...(p.kind === 'point' || p.kind === 'combined' ? { point: { pixelSize: p.size, color: Color.fromCssColorString(p.color) } } : {}), ...(p.kind === 'image' || p.kind === 'combined' ? { image: { image: `${import.meta.env.BASE_URL}pin.svg`, width: p.size, height: p.size * 1.25 } } : {}), ...(p.kind !== 'point' ? { label: { text: p.text } } : {}), onClick: event => ctx.report(`点击地图标记：${event.id} · ${p.text}`) }
      const marker = kit.addMarker({ ...options, id: 'station' }); let show = true
      ctx.button('显示／隐藏', () => marker.setVisible(show = !show)); ctx.button('更新位置与文字', () => marker.update({ ...options, position: { ...center, longitude: 116.41 }, label: { text: `${p.text} · 已更新` } })); ctx.button('移除标记', () => marker.remove()); ctx.report('MarkerKit 已创建；点击地图中央标记查看标记 ID。')
    }
  },
  {
    id: 'mask', kit: 'MaskKit', title: '局部区域掩膜', description: '保留中心多边形，遮暗外围局部矩形；实验性能力。',
    fields: [number('alpha', '遮罩透明度', 0.7, 0, 1, 0.05), number('extent', '关注区域半宽 / °', 0.04, 0.01, 0.1, 0.01)],
    code: p => snippet('mask', 'MaskKit', `const masks = new MaskKit(viewer)\nconst region = masks.addRegionMask({\n  positions: [\n    { longitude: ${116.39 - p.extent}, latitude: ${39.9 - p.extent} },\n    { longitude: ${116.39 + p.extent}, latitude: ${39.9 - p.extent} },\n    { longitude: 116.39, latitude: ${39.9 + p.extent} }\n  ],\n  outerBounds: { west: 116.2, south: 39.7, east: 116.6, north: 40.1 },\n  color: Color.BLACK.withAlpha(${p.alpha})\n})\nregion.remove()\nmasks.dispose()`),
    run: async (ctx, p) => { camera(ctx.viewer, 40000); pin(ctx.viewer); const kit = ctx.own(new MaskKit(ctx.viewer)); const handle = kit.addRegionMask({ positions: [{ longitude: 116.39 - p.extent, latitude: 39.9 - p.extent }, { longitude: 116.39 + p.extent, latitude: 39.9 - p.extent }, { longitude: 116.39, latitude: 39.9 + p.extent }], outerBounds: { west: 116.2, south: 39.7, east: 116.6, north: 40.1 }, color: Color.BLACK.withAlpha(p.alpha) }); ctx.button('移除掩膜', () => handle.remove()); ctx.report('三角关注区域保持可见，外围矩形遮暗。') }
  },
  effectModule,
  effectPerformance,
  markerPerformance,
  primitivePerformance,
  ...infrastructureModules,
  {
    id: 'pick', kit: 'PickKit', title: '屏幕拾取', description: '点击地图查看屏幕坐标、地理坐标和被拾取对象。',
    fields: [select('mode', '位置求解模式', 'auto', ['auto', 'depth', 'terrain', 'ellipsoid'])],
    code: p => snippet('pick', 'PickKit', `const picks = new PickKit(viewer)\nconst off = picks.onClick(event => {\n  const position = picks.toWorld(event.screenPosition, '${p.mode}')\n  console.log(position, event.picked)\n})\noff()\npicks.dispose()`),
    run: async (ctx, p) => { camera(ctx.viewer); pin(ctx.viewer); const kit = ctx.own(new PickKit(ctx.viewer)); kit.onClick(event => { const point = kit.toWorld(event.screenPosition, p.mode); ctx.report(point ? `拾取：${json(CoordinateKit.toDegrees(point))}；对象：${event.picked ? '有' : '无'}` : '该模式没有取得世界坐标。') }); ctx.report('点击地球表面或中心点，查看拾取结果。') }
  },
  drawModule,
  {
    id: 'measure', kit: 'MeasureKit', title: '空间测量', description: '距离、局部面积与椭球高差；结果附单位。',
    fields: [select('kind', '测量类型', 'distance', ['distance', 'area', 'height']), number('height', '终点高度 / m', 600, 200, 5000, 100)],
    code: p => snippet('measure', 'MeasureKit', `const measures = new MeasureKit(viewer)\nconst session = measures.start({\n  type: '${p.kind}',\n  onFinish: result => console.log(result.value, result.unit)\n})\n// 默认使用地图交互；也可用下面的预设点：\n// session.addPoint(Cartesian3.fromDegrees(${p.kind === 'height' ? '116.39, 39.9' : '116.36, 39.88'}, 100))\n// session.addPoint(Cartesian3.fromDegrees(${p.kind === 'height' ? '116.39, 39.9' : '116.42, 39.88'}, ${p.height}))\n${p.kind === 'area' ? '// session.addPoint(Cartesian3.fromDegrees(116.39, 39.93, 100))\n' : ''}// session.finish()\nmeasures.dispose()`),
    run: async (ctx, p) => { camera(ctx.viewer); const kit = ctx.own(new MeasureKit(ctx.viewer)); let session; const start = interactive => kit.start({ type: p.kind, interactive, onFinish: result => { session = undefined; ctx.report(`${result.type}：${result.value.toFixed(2)} ${result.unit}`) } }); session = start(true); ctx.button('撤销顶点', () => session?.undo()); ctx.button('完成测量', () => session?.finish()); ctx.button('生成示例', () => { kit.cancel(); kit.clear(); session = start(false); const points = p.kind === 'height' ? [position(), position(116.39, 39.9, p.height)] : [position(116.36, 39.88), position(116.42, 39.88, p.height), position(116.39, 39.93)]; for (const point of points.slice(0, p.kind === 'area' ? 3 : 2)) session.addPoint(point); session?.finish() }); ctx.report('点击地图进行测量，或生成预设测量示例。') }
  },
  {
    id: 'camera', kit: 'CameraKit', title: '镜头控制', description: '飞行、视角保存与恢复、围绕地理位置环绕。',
    fields: [number('height', '镜头高度 / m', 12000, 2000, 60000, 1000), number('speed', '环绕速度 / rad/s', 0.2, 0.05, 1, 0.05)],
    code: p => snippet('camera', 'CameraKit', `const camera = new CameraKit(viewer)\ncamera.setView({ longitude: 116.39, latitude: 39.9, height: ${p.height} })\nconst saved = camera.saveView()\ncamera.startOrbit(${json(center)}, { range: ${p.height}, speed: ${p.speed} })\ncamera.stopOrbit()\ncamera.restoreView(saved)\ncamera.dispose()`),
    run: async (ctx, p) => { camera(ctx.viewer, p.height); pin(ctx.viewer); const kit = ctx.own(new CameraKit(ctx.viewer)); let saved = kit.saveView(); ctx.button('保存视角', () => { saved = kit.saveView(); ctx.report('视角已保存') }); ctx.button('恢复视角', () => kit.restoreView(saved)); ctx.button('启动环绕', () => kit.startOrbit(center, { range: p.height, speed: p.speed })); ctx.button('停止环绕', () => kit.stopOrbit()); ctx.button('飞至观测站', () => kit.flyToPosition({ ...center, height: p.height }, { duration: 1 })); ctx.report('可拖动地图，再保存和恢复视角。') }
  },
  {
    id: 'popup', kit: 'PopupKit', title: '地理弹窗', description: '安全文本与地理锚点，随镜头投影更新位置。',
    fields: [text('content', '弹窗文本', '文字标记 · 在线'), number('height', '锚点高度 / m', 500, 0, 3000, 100)],
    code: p => snippet('popup', 'PopupKit', `const popups = new PopupKit(viewer)\nconst popup = popups.addPopup({\n  position: { longitude: 116.39, latitude: 39.9, height: ${p.height} },\n  content: ${json(p.content)}\n})\npopup.remove()\npopups.dispose()`),
    run: async (ctx, p) => { camera(ctx.viewer); pin(ctx.viewer); const kit = ctx.own(new PopupKit(ctx.viewer)); const handle = kit.addPopup({ position: { ...center, height: p.height }, content: p.content }); ctx.button('关闭弹窗', () => handle.remove()); ctx.report('拖动镜头查看弹窗跟随地理锚点。') }
  },
  {
    id: 'tileset', kit: 'TilesetKit', title: '三维模型', description: '加载本地 3D Tiles 立方体，调整样式和显隐。',
    fields: [select('color', '模型颜色', 'turquoise', ['turquoise', 'orange', 'purple', 'white'])],
    code: p => snippet('tileset', 'TilesetKit', `const tilesets = new TilesetKit(viewer)\nawait tilesets.addTileset({\n  id: 'building', url: '/tiles/tileset.json',\n  style: { color: "color('${p.color}')" }\n})\ntilesets.setVisible('building', false)\ntilesets.dispose()`),
    run: async (ctx, p) => { camera(ctx.viewer, 3000); const kit = ctx.own(new TilesetKit(ctx.viewer)); const tile = await kit.addTileset({ id: 'building', url: `${import.meta.env.BASE_URL}tiles/tileset.json`, style: { color: `color('${p.color}')` } }); ctx.button('显示／隐藏', () => kit.setVisible('building', !tile.show)); ctx.button('移除模型', () => kit.removeTileset('building')); ctx.report('离线 3D Tiles 已加载：400 米立方体；无需访问在线服务。') }
  },
  {
    id: 'track', kit: 'TrackKit', title: '轨迹回放', description: '采样位置插值、播放控制、倍速和时间跳转。',
    fields: [number('speed', '播放倍速', 1, 0.25, 4, 0.25), number('height', '最高高度 / m', 600, 100, 3000, 100)],
    code: p => snippet('track', 'TrackKit', `const tracks = new TrackKit(viewer)\nconst start = JulianDate.clone(viewer.clock.currentTime)\nconst track = tracks.addTrack({ loop: true, samples: [\n  { time: start, position: { longitude: 116.35, latitude: 39.88, height: 100 } },\n  { time: JulianDate.addSeconds(start, 10, new JulianDate()),\n    position: { longitude: 116.39, latitude: 39.9, height: ${p.height} } },\n  { time: JulianDate.addSeconds(start, 20, new JulianDate()),\n    position: { longitude: 116.43, latitude: 39.92, height: 100 } }\n] })\ntrack.setSpeed(${p.speed})\n// 可选操作：track.seek(10)\ntracks.dispose()`),
    run: async (ctx, p) => { camera(ctx.viewer); const kit = ctx.own(new TrackKit(ctx.viewer)); const start = JulianDate.clone(ctx.viewer.clock.currentTime); const handle = kit.addTrack({ loop: true, samples: [{ time: start, position: { longitude: 116.35, latitude: 39.88, height: 100 } }, { time: JulianDate.addSeconds(start, 10, new JulianDate()), position: { ...center, height: p.height } }, { time: JulianDate.addSeconds(start, 20, new JulianDate()), position: { longitude: 116.43, latitude: 39.92, height: 100 } }] }); handle.setSpeed(p.speed); ctx.button('暂停／继续', () => handle.paused ? handle.play() : handle.pause()); ctx.button('跳至 10 秒', () => handle.seek(10)); ctx.button('移除轨迹', () => handle.remove()); ctx.report(`20 秒循环轨迹 · ${p.speed} 倍速；黄色点沿采样路线移动。`) }
  }
]
