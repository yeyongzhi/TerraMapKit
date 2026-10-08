import { Cartesian3, Color, EllipsoidTerrainProvider, SceneTransforms } from 'cesium'
import { createMap, MarkerKit, EffectKit } from 'terra-map-kit'
import 'cesium/Build/Cesium/Widgets/widgets.css'
const viewer = createMap('map', { baseLayer: false, baseLayerPicker: false, terrainProvider: new EllipsoidTerrainProvider(), geocoder: false, animation: false, timeline: false, skyBox: false, skyAtmosphere: false, infoBox: false, selectionIndicator: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false })
viewer.scene.globe.baseColor = Color.fromCssColorString('#14243a')
viewer.camera.setView({ destination: Cartesian3.fromDegrees(116.39, 39.9, 16000), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } })
const kit = new MarkerKit(viewer), effects = new EffectKit(viewer), errors = [], events = []
const marker = kit.addMarker({ id: 'marker', position: { longitude: 116.39, latitude: 39.9, height: 100 }, point: { pixelSize: 24 }, label: { text: '测试标记' }, properties: { name: '测试标记', nested: { enabled: true } } })
const other = kit.addMarker({ id: 'other', position: { longitude: 116.42, latitude: 39.91, height: 100 }, image: { image: '/pin.svg' }, label: { text: '图标标记' } })
kit.onClick(event => events.push(`click:${event.id}`))
kit.onHover(event => events.push(`${event.phase}:${event.id}`))
viewer.scene.renderError.addEventListener((_scene, error) => errors.push(error.message))
let editor
window.markerValidation = {
  viewer, kit, marker, other, errors, events,
  screen(id = 'marker') { const entity = kit.getMarker(id).entity, p = SceneTransforms.worldToWindowCoordinates(viewer.scene, entity.position.getValue(viewer.clock.currentTime)); return { x: p.x, y: p.y } },
  start() { editor = kit.edit(marker, { positionMode: 'ellipsoid', onError: error => errors.push(error.message) }) },
  get editor() { return editor },
  overlay() { effects.addPulsePoint({ position: marker.position, pixelSize: 50, color: Color.RED }) },
  state() { return { position: marker.position, draft: editor?.position, inputs: viewer.scene.screenSpaceCameraController.enableInputs, entities: viewer.entities.values.length, json: kit.toJSON(), events: [...events], errors: [...errors] } }
}
