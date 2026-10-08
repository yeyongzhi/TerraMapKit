// Dedicated development-only browser fixture; not included in the example build inputs.
import { Cartesian3, Color, JulianDate, EllipsoidTerrainProvider } from 'cesium'
import { createMap, EffectKit } from 'terra-map-kit'
import 'cesium/Build/Cesium/Widgets/widgets.css'
const viewer = createMap('map', { baseLayer: false, baseLayerPicker: false, terrainProvider: new EllipsoidTerrainProvider(), geocoder: false, animation: false, timeline: false, skyBox: false, skyAtmosphere: false, infoBox: false, selectionIndicator: false, requestRenderMode: true })
viewer.scene.globe.baseColor = Color.fromCssColorString('#14243a')
viewer.camera.setView({ destination: Cartesian3.fromDegrees(116.39, 39.9, 20000), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } })
viewer.clock.shouldAnimate = false
const kit = new EffectKit(viewer), errors = []
viewer.scene.renderError.addEventListener((_scene, error) => errors.push(error.message))
const origin = JulianDate.clone(viewer.clock.currentTime), position = { longitude: 116.39, latitude: 39.9, height: 100 }
const positions = [position, { ...position, longitude: 116.41 }, { ...position, longitude: 116.41, latitude: 39.92 }]
window.effectValidation = {
  viewer, kit, errors, completions: 0,
  create() {
    kit.clear()
    const common = { position, radius: 1000, duration: 4 }
    return [kit.addRipple(common), kit.addDiffusionCircle(common), kit.addWave(common), kit.addPulsePoint(common), kit.addRadarScan(common),
      kit.addGlowLine({ positions }), kit.addFlowLine({ positions, duration: 4 }), kit.addFlightArc({ from: positions[0], to: positions[2] }),
      kit.addWall({ positions }), kit.addPolygonPulse({ positions })].map(h => h.id)
  },
  tick(seconds) { viewer.clock.currentTime = JulianDate.addSeconds(origin, seconds, new JulianDate()); viewer.clock.onTick.raiseEvent(viewer.clock); viewer.scene.requestRender() },
  once() { return kit.addDiffusionCircle({ position, duration: 1, loop: false, onComplete: () => this.completions++ }).id },
  dispose() { kit.dispose(); viewer.destroy() }
}
