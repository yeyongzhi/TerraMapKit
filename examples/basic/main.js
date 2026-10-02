import { Color, CustomHeightmapTerrainProvider, EllipsoidTerrainProvider, GeographicTilingScheme, GridImageryProvider, ImageryLayer, JulianDate, Math as CesiumMath, Viewer } from 'cesium'
import { createMap, MapKit, CoordinateKit, LayerKit, MaskKit, EffectKit, PickKit, DrawKit, CameraKit, PopupKit, MeasureKit, TilesetKit, TrackKit } from 'terra-map-kit'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './style.css'

const container = document.querySelector('#map')
const status = document.querySelector('#status')
const checks = document.querySelector('#checks')
let viewer
let generation = 0
let removeRenderError
let layers, masks, maskHandle
let effects, effectHandle, effectKind
let picks, draws, cameras, popups, measures, tilesets, tracks, trackHandle, session, offPick, savedView
let syntheticTerrain = false
const region = [
  { longitude: 115, latitude: 38 }, { longitude: 118, latitude: 38 },
  { longitude: 118, latitude: 41 }, { longitude: 115, latitude: 41 }
]
const outerBounds = { west: 110, south: 33, east: 123, north: 46 }

function report(message) {
  status.textContent = message
  if (viewer && !viewer.isDestroyed()) {
    checks.textContent = `原生 Viewer：${viewer instanceof Viewer ? '通过' : '失败'} ｜ 选项透传：${!viewer.animation && !viewer.timeline && !viewer.baseLayerPicker ? '通过' : '失败'} ｜ 图层：${viewer.imageryLayers.length} ｜ Entity：${viewer.entities.values.length} ｜ 地形：${syntheticTerrain ? '合成山地' : '椭球'}`
  }
}

function action(callback) {
  return async () => {
    try {
      if (!viewer || viewer.isDestroyed()) throw new Error('请先重建地图')
      await callback()
    } catch (error) {
      report(`操作失败：${error.message}`)
      console.error(error)
    }
  }
}

function destroyMap() {
  removeRenderError?.()
  removeRenderError = undefined
  layers?.dispose()
  masks?.dispose()
  effects?.dispose()
  offPick?.(); offPick = undefined
  for (const kit of [draws, measures, picks, cameras, popups, tilesets, tracks]) kit?.dispose()
  picks = draws = cameras = popups = measures = tilesets = tracks = trackHandle = session = savedView = undefined
  effects = effectHandle = effectKind = undefined
  layers = masks = maskHandle = undefined
  if (viewer && !viewer.isDestroyed()) viewer.destroy()
  viewer = undefined
  status.textContent = '地图已销毁，可以重建。'
  checks.textContent = `容器残留：${container.childElementCount} 个元素`
}

function initialize() {
  destroyMap()
  try {
    // A procedural grid and ellipsoid terrain avoid external imagery/ion requests.
    const options = {
      baseLayerPicker: false,
      baseLayer: new ImageryLayer(new GridImageryProvider()),
      terrainProvider: new EllipsoidTerrainProvider(),
      geocoder: false,
      animation: false,
      timeline: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false
    }
    const useStaticEntry = generation % 2 === 1
    viewer = useStaticEntry
      ? MapKit.createMap(container, options)
      : createMap('map', options)
    generation += 1
    layers = new LayerKit(viewer)
    masks = new MaskKit(viewer)
    effects = new EffectKit(viewer)
    picks = new PickKit(viewer); draws = new DrawKit(viewer); cameras = new CameraKit(viewer)
    popups = new PopupKit(viewer); measures = new MeasureKit(viewer); tilesets = new TilesetKit(viewer); tracks = new TrackKit(viewer)
    viewer.clock.shouldAnimate = true
    syntheticTerrain = false
    viewer.scene.globe.baseColor = Color.fromCssColorString('#152a44')
    viewer.camera.setView({ destination: CoordinateKit.fromDegrees(116.39, 39.9, 22000000) })
    viewer.entities.add({
      position: CoordinateKit.fromDegrees(116.39, 39.9),
      point: { pixelSize: 10, color: Color.CYAN }
    })
    removeRenderError = viewer.scene.renderError.addEventListener((_scene, error) => {
      status.textContent = `渲染失败：${error.message}`
    })
    report(`地图已创建 · ${useStaticEntry ? 'MapKit.createMap（元素）' : 'createMap（ID）'} · 第 ${generation} 次`)
  } catch (error) {
    destroyMap()
    status.textContent = `初始化失败：${error.message}`
    console.error(error)
  }
}

document.querySelector('#reset').addEventListener('click', initialize)
document.querySelector('#destroy').addEventListener('click', destroyMap)
document.querySelector('#layer-add').addEventListener('click', action(async () => {
  if (layers.getImageLayer('overlay')) { report('演示图层已存在'); return }
  const current = layers
  await current.addImageLayer({
    id: 'overlay', alpha: Number(document.querySelector('#alpha').value),
    provider: Promise.resolve(new GridImageryProvider({
      color: Color.YELLOW, glowColor: Color.ORANGE, backgroundColor: Color.DARKBLUE.withAlpha(0.5), cells: 16
    }))
  })
  if (layers === current) report('演示图层已添加（异步 Provider）')
}))
document.querySelector('#layer-toggle').addEventListener('click', action(() => {
  const layer = layers.getImageLayer('overlay')
  if (!layer) { report('请先添加演示图层'); return }
  layer.show = !layer.show
  report(`演示图层：${layer.show ? '显示' : '隐藏'}`)
}))
document.querySelector('#alpha').addEventListener('input', action(() => {
  const layer = layers.getImageLayer('overlay')
  if (layer) { layer.alpha = Number(document.querySelector('#alpha').value); report(`演示图层透明度：${layer.alpha}`) }
}))
document.querySelector('#layer-remove').addEventListener('click', action(() => {
  const removed = layers.removeImageLayer('overlay')
  report(`演示图层${removed ? '已移除' : '不存在'}；原生底图保留`)
}))
document.querySelector('#mask-add').addEventListener('click', action(() => {
  maskHandle?.remove()
  maskHandle = masks.addRegionMask({ id: 'region', positions: region, outerBounds })
  viewer.camera.setView({ destination: CoordinateKit.fromDegrees(116.5, 39.5, 1500000) })
  report('掩膜已添加：中心区域可见，外侧矩形范围遮暗')
}))
document.querySelector('#mask-update').addEventListener('click', action(() => {
  if (!maskHandle) { report('请先添加掩膜'); return }
  maskHandle.update({ positions: region.map(point => ({ longitude: point.longitude + 1, latitude: point.latitude })), outerBounds, color: Color.DARKBLUE.withAlpha(0.7) })
  report('掩膜已更新：关注区域东移 1 度')
}))
document.querySelector('#mask-remove').addEventListener('click', action(() => {
  maskHandle?.remove(); maskHandle = undefined
  report('掩膜已移除；原生标记保留')
}))
document.querySelector('#tilt').addEventListener('click', action(() => {
  viewer.camera.setView({
    destination: CoordinateKit.fromDegrees(116.5, 32.5, 700000),
    orientation: { heading: 0, pitch: CesiumMath.toRadians(-40), roll: 0 }
  })
  report('倾斜视角：检查地表贴合与孔洞边界')
}))
document.querySelector('#terrain').addEventListener('click', action(() => {
  syntheticTerrain = !syntheticTerrain
  const scheme = new GeographicTilingScheme()
  viewer.terrainProvider = syntheticTerrain
    ? new CustomHeightmapTerrainProvider({
      width: 32, height: 32, tilingScheme: scheme,
      callback(x, y, level) {
        const rectangle = scheme.tileXYToRectangle(x, y, level)
        return Float32Array.from({ length: 32 * 32 }, (_, index) => {
          const lon = rectangle.west + (rectangle.east - rectangle.west) * (index % 32) / 31
          const lat = rectangle.north - (rectangle.north - rectangle.south) * Math.floor(index / 32) / 31
          return 3000 * Math.sin(lon * 80) ** 2 * Math.cos(lat * 80) ** 2
        })
      }
    }) : new EllipsoidTerrainProvider()
  report(`地形已切换：${syntheticTerrain ? '合成山地（最高约 3000 米）' : '椭球'}`)
}))
const effectPosition = { longitude: 116.39, latitude: 39.9, height: 100 }
function showEffect(kind) {
  effectHandle?.remove()
  effectKind = kind
  const options = { position: effectPosition, duration: 4, color: Color.CYAN.withAlpha(0.85) }
  effectHandle = kind === 'wave'
    ? effects.addWave({ ...options, length: 80000, wavelength: 30000, amplitude: 8000, width: 4 })
    : kind === 'ripple'
      ? effects.addRipple({ ...options, radius: 40000, count: 4 })
      : effects.addDiffusionCircle({ ...options, radius: 40000 })
  viewer.camera.setView({ destination: CoordinateKit.fromDegrees(116.39, 39.9, 200000) })
  report(`Entity 特效已创建：${kind}；跟随 Viewer 时钟循环`)
}
for (const kind of ['ripple', 'diffusion', 'wave']) {
  document.querySelector(`#effect-${kind}`).addEventListener('click', action(() => showEffect(kind)))
}
document.querySelector('#effect-update').addEventListener('click', action(() => {
  if (!effectHandle) { report('请先创建特效'); return }
  const options = { position: effectPosition, duration: 2, color: Color.ORANGE.withAlpha(0.9) }
  effectHandle.update(effectKind === 'wave'
    ? { ...options, length: 80000, wavelength: 20000, amplitude: 10000, width: 5 }
    : { ...options, radius: 30000, count: 3 })
  report('特效已更新：橙色、周期 2 秒；动画从头开始')
}))
document.querySelector('#effect-pause').addEventListener('click', action(() => {
  if (!effectHandle) { report('请先创建特效'); return }
  if (effectHandle.paused) effectHandle.resume()
  else effectHandle.pause()
  report(`特效已${effectHandle.paused ? '暂停' : '恢复'}`)
}))
document.querySelector('#effect-remove').addEventListener('click', action(() => {
  effectHandle?.remove(); effectHandle = effectKind = undefined
  report('特效已清除；原生标记保留')
}))
const center = { longitude: 116.39, latitude: 39.9, height: 100 }
function stopInput() { offPick?.(); offPick = undefined; draws.cancel(); measures.cancel(); session = undefined }
document.querySelector('#tool-start').addEventListener('click', action(() => {
  stopInput(); cameras.setView({ ...center, height: 12000 }, { pitch: -Math.PI / 2 })
  const tool = document.querySelector('#tool-kind').value
  if (tool === 'pick') {
    offPick = picks.onClick(event => {
      if (!event.position) { report('点击处没有可拾取坐标'); return }
      const p = CoordinateKit.toDegrees(event.position)
      report(`拾取：${p.longitude.toFixed(5)}°, ${p.latitude.toFixed(5)}°，${p.height.toFixed(1)} m；对象：${event.picked ? '有' : '无'}`)
    })
  } else if (tool.startsWith('draw-')) {
    session = draws.start({ type: tool.slice(5), onFinish: result => { session = undefined; report(`绘制完成：${result.type} · ${result.positions.length} 点；可通过 toGeoJSON() 导出`) }, onError: error => report(error.message) })
  } else {
    session = measures.start({ type: tool.slice(8), onFinish: result => { session = undefined; report(`测量结果：${result.value.toFixed(2)} ${result.unit}`) }, onError: error => report(error.message) })
  }
  report('左键添加点，右键完成；也可使用撤销／完成／取消按钮。高差需两个点。')
}))
document.querySelector('#tool-undo').addEventListener('click', action(() => { report(session?.undo() ? '已撤销最后一点' : '没有可撤销的点') }))
document.querySelector('#tool-finish').addEventListener('click', action(() => { if (session) session.finish(); else report('没有正在绘制的对象') }))
document.querySelector('#tool-cancel').addEventListener('click', action(() => { stopInput(); report('交互已取消') }))
document.querySelector('#tool-clear').addEventListener('click', action(() => { stopInput(); draws.clear(); measures.clear(); report('绘制和测量结果已清除') }))
document.querySelector('#tool-demo').addEventListener('click', action(() => {
  stopInput(); draws.clear(); measures.clear(); cameras.setView({ ...center, height: 12000 }, { pitch: -Math.PI / 2 })
  const polygon = draws.start({ type: 'polygon', interactive: false })
  for (const p of [{ ...center, longitude: 116.36 }, { ...center, longitude: 116.38 }, { ...center, longitude: 116.38, latitude: 39.92 }]) polygon.addPoint(CoordinateKit.fromDegrees(p.longitude, p.latitude, p.height))
  polygon.finish()
  const measurement = measures.start({ type: 'distance', interactive: false, onFinish: result => report(`演示面与距离：${result.value.toFixed(2)} m；原生 Entity 已创建`) })
  measurement.addPoint(CoordinateKit.fromDegrees(116.40, 39.9, 100)); measurement.addPoint(CoordinateKit.fromDegrees(116.43, 39.92, 100)); measurement.finish()
}))
document.querySelector('#camera-save').addEventListener('click', action(() => { savedView = cameras.saveView(); report('视角已保存') }))
document.querySelector('#camera-restore').addEventListener('click', action(() => { if (savedView) { cameras.restoreView(savedView); report('视角已恢复') } else report('请先保存视角') }))
document.querySelector('#camera-orbit').addEventListener('click', action(() => { cameras.startOrbit(center, { range: 10000, speed: 0.2 }); report('环绕已启动，跟随模拟时间') }))
document.querySelector('#camera-stop').addEventListener('click', action(() => { cameras.stopOrbit(); report('环绕已停止') }))
document.querySelector('#popup-show').addEventListener('click', action(() => {
  popups.removePopup('demo'); popups.addPopup({ id: 'demo', position: { ...center, height: 500 }, content: 'PopupKit\n北京 · WGS84 地理锚点\n文本内容安全显示' })
  cameras.setView({ ...center, height: 12000 }, { pitch: -Math.PI / 2 }); report('地理弹窗已显示，随镜头移动')
}))
document.querySelector('#popup-remove').addEventListener('click', action(() => { popups.clear(); report('弹窗已关闭') }))
document.querySelector('#tiles-add').addEventListener('click', action(async () => {
  if (tilesets.getTileset('demo')) { report('离线模型已存在'); return }
  const kit = tilesets
  const tileset = await kit.addTileset({ id: 'demo', url: '/tiles/tileset.json', style: { color: "color('turquoise')" } })
  if (kit !== tilesets) return
  tileset.tileLoad.addEventListener(() => { if (kit === tilesets) report('离线 3D Tiles 内容已就绪：400 米立方体') })
  tileset.tileFailed.addEventListener(error => report(`模型内容加载失败：${error.message}`))
  await kit.flyTo('demo', { duration: 0 })
  cameras.setView({ ...center, height: 3000 }, { heading: 0, pitch: -Math.PI / 2, roll: 0 })
  report('离线 3D Tiles 已加载：400 米立方体')
}))
document.querySelector('#tiles-style').addEventListener('click', action(() => { tilesets.setStyle('demo', { color: "color('orange')" }); report('模型样式已更新为橙色') }))
document.querySelector('#tiles-toggle').addEventListener('click', action(() => { const tile = tilesets.getTileset('demo'); if (tile) { tilesets.setVisible('demo', !tile.show); report(`模型${tile.show ? '显示' : '隐藏'}`) } }))
document.querySelector('#tiles-remove').addEventListener('click', action(() => { tilesets.removeTileset('demo'); report('模型已移除并销毁') }))
document.querySelector('#track-add').addEventListener('click', action(() => {
  trackHandle?.remove(); const start = JulianDate.clone(viewer.clock.currentTime)
  trackHandle = tracks.addTrack({ loop: true, samples: [
    { time: start, position: { longitude: 116.35, latitude: 39.88, height: 200 } },
    { time: JulianDate.addSeconds(start, 10, new JulianDate()), position: { longitude: 116.39, latitude: 39.93, height: 600 } },
    { time: JulianDate.addSeconds(start, 20, new JulianDate()), position: { longitude: 116.43, latitude: 39.88, height: 200 } }
  ] }); cameras.setView({ ...center, height: 16000 }, { pitch: -Math.PI / 2 }); report('轨迹已启动：20 秒循环，黄色移动点')
}))
document.querySelector('#track-pause').addEventListener('click', action(() => { if (trackHandle) { if (trackHandle.paused) trackHandle.play(); else trackHandle.pause(); report(`轨迹${trackHandle.paused ? '暂停' : '播放'}`) } }))
document.querySelector('#track-seek').addEventListener('click', action(() => { trackHandle?.seek(10); report('轨迹已跳转至第 10 秒') }))
document.querySelector('#track-speed').addEventListener('click', action(() => { trackHandle?.setSpeed(2); report('轨迹速度：2 倍') }))
document.querySelector('#track-remove').addEventListener('click', action(() => { trackHandle?.remove(); trackHandle = undefined; report('轨迹已清除') }))
window.addEventListener('pagehide', destroyMap)
initialize()
