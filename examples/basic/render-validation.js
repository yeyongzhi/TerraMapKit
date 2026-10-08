import { Cartesian3, Color, EllipsoidTerrainProvider, GridImageryProvider } from 'cesium'
import { createMap, MarkerKit, DrawKit, LayerKit, EffectKit, MeasureKit } from 'terra-map-kit'
import 'cesium/Build/Cesium/Widgets/widgets.css'
const viewer = createMap('map', { baseLayer: false, baseLayerPicker: false, terrainProvider: new EllipsoidTerrainProvider(), requestRenderMode: true, maximumRenderTimeChange: Infinity, geocoder: false, animation: false, timeline: false, skyBox: false, skyAtmosphere: false, infoBox: false, selectionIndicator: false })
viewer.camera.setView({ destination: Cartesian3.fromDegrees(116.39, 39.9, 16000), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } })
viewer.clock.shouldAnimate = true
const markers = new MarkerKit(viewer), draws = new DrawKit(viewer), layers = new LayerKit(viewer), effects = new EffectKit(viewer), measures = new MeasureKit(viewer)
let frames = 0, effect
const errors = []; viewer.scene.postRender.addEventListener(() => frames++); viewer.scene.renderError.addEventListener((_s, error) => errors.push(error.message))
window.onDemand = { viewer, markers, draws, layers, effects, measures, errors, get frames() { return frames }, get effect() { return effect },
  add() { markers.addMarkers([{ id: 'a', position: { longitude: 116.39, latitude: 39.9, height: 100 }, point: {} }]) },
  animate(kind = 'ripple') { effect = kind === 'wave' ? effects.addWave({ position: { longitude: 116.39, latitude: 39.9 }, length: 2000 }) : effects.addRipple({ position: { longitude: 116.39, latitude: 39.9 }, radius: 1000 }) },
  async imagery() { await layers.addImageLayer({ provider: Promise.resolve(new GridImageryProvider({})) }) },
  geometry() {
    const session = draws.start({ type: 'polygon', interactive: false })
    for (const [lon, lat] of [[116.37, 39.88], [116.41, 39.88], [116.39, 39.92]]) session.addPoint(Cartesian3.fromDegrees(lon, lat, 100))
    const result = session.finish(), edit = draws.edit(result, { interactive: false })
    edit.moveVertex(0, Cartesian3.fromDegrees(116.36, 39.88, 100)); edit.finish()
  },
  measure() { const session = measures.start({ type: 'distance', interactive: false }); session.addPoint(Cartesian3.fromDegrees(116.37, 39.9, 100)); session.addPoint(Cartesian3.fromDegrees(116.41, 39.9, 100)); session.finish() },
  dispose() { effects.dispose(); markers.dispose(); draws.dispose(); layers.dispose(); measures.dispose() }
}
