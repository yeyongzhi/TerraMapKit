import { Cartesian3, Color, EllipsoidTerrainProvider, SceneTransforms } from 'cesium'
import { createMap, DrawKit, CoordinateKit, EffectKit } from 'terra-map-kit'
import 'cesium/Build/Cesium/Widgets/widgets.css'
const viewer = createMap('map', { baseLayer: false, baseLayerPicker: false, terrainProvider: new EllipsoidTerrainProvider(), geocoder: false, animation: false, timeline: false, skyBox: false, skyAtmosphere: false, infoBox: false, selectionIndicator: false, requestRenderMode: true, homeButton: false, sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false })
viewer.scene.globe.baseColor = Color.fromCssColorString('#14243a')
viewer.camera.setView({ destination: Cartesian3.fromDegrees(116.39, 39.9, 16000), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } })
viewer.clock.shouldAnimate = false
const kit = new DrawKit(viewer), errors = []
const effects = new EffectKit(viewer)
const [result] = kit.fromGeoJSON({ type: 'Feature', id: 'polygon', properties: { name: '示例多边形', rules: { enabled: true } }, geometry: { type: 'Polygon', coordinates: [[[116.37, 39.88, 100], [116.41, 39.88, 100], [116.41, 39.92, 100], [116.37, 39.92, 100], [116.37, 39.88, 100]]] } })
let editor, changes = 0
viewer.scene.renderError.addEventListener((_scene, error) => errors.push(error.message))
const screen = point => { const p = SceneTransforms.worldToWindowCoordinates(viewer.scene, point); return { x: p.x, y: p.y } }
window.drawValidation = {
  viewer, kit, result, errors,
  get editor() { return editor },
  start() { editor = kit.edit(result, { positionMode: 'ellipsoid', onChange: () => changes++, onError: error => errors.push(error.message) }); return editor.handles.length },
  handle(index) { return screen(editor.handles[index].position.getValue(viewer.clock.currentTime)) },
  center() { return screen(Cartesian3.fromDegrees(116.39, 39.9, 100)) },
  overlay() { const positions = result.positions.map(p => CoordinateKit.toDegrees(p)); effects.addWall({ positions }); effects.addPolygonPulse({ positions }) },
  clearOverlay() { effects.clear() },
  state() { return { changes, draft: editor?.positions.map(p => CoordinateKit.toDegrees(p)), committed: result.positions.map(p => CoordinateKit.toDegrees(p)), entities: viewer.entities.values.length, inputs: viewer.scene.screenSpaceCameraController.enableInputs, undo: editor?.canUndo, redo: editor?.canRedo } }
}
