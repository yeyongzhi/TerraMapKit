import { Cartesian2, Cartesian3, Color, EllipsoidTerrainProvider, SceneTransforms, PointPrimitiveCollection } from 'cesium'
import { createMap, PrimitiveMarkerKit } from 'terra-map-kit'
import 'cesium/Build/Cesium/Widgets/widgets.css'
const viewer = createMap('map', { baseLayer: false, baseLayerPicker: false, terrainProvider: new EllipsoidTerrainProvider(), geocoder: false, animation: false, timeline: false, infoBox: false, selectionIndicator: false, requestRenderMode: true, maximumRenderTimeChange: Infinity })
viewer.camera.setView({ destination: Cartesian3.fromDegrees(116.39, 39.9, 10000), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } })
const foreign = viewer.scene.primitives.add(new PointPrimitiveCollection())
const points = new PrimitiveMarkerKit(viewer), billboards = new PrimitiveMarkerKit(viewer, 'billboard')
const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16
const context = canvas.getContext('2d'); context.fillStyle = 'orange'; context.fillRect(0, 0, 16, 16)
const point = points.addMarker({ id: 'point', position: { longitude: 116.38, latitude: 39.9, height: 100 }, pixelSize: 20, color: Color.RED, display: { disableDepthTestDistance: Infinity } })
const billboard = billboards.addMarker({ id: 'image', position: { longitude: 116.40, latitude: 39.9, height: 100 }, image: canvas.toDataURL(), width: 24, height: 24, display: { disableDepthTestDistance: Infinity } })
const clicks = [], errors = []; let frames = 0
viewer.scene.renderError.addEventListener((_scene, error) => errors.push(error.message)); viewer.scene.postRender.addEventListener(() => frames++)
points.onClick(({ marker }) => clicks.push(marker.id)); billboards.onClick(({ marker }) => clicks.push(marker.id))
window.primitives = { viewer, points, billboards, point, billboard, foreign, clicks, errors, get frames() { return frames },
  screen(kind) { const p = SceneTransforms.worldToWindowCoordinates(viewer.scene, this[kind].primitive.position); return { x: p.x, y: p.y } },
  picked(kind) { const p = this.screen(kind); return (kind === 'point' ? points : billboards).pick(new Cartesian2(p.x, p.y))?.id },
  hideByDistance() { point.patch({ display: { distance: { near: 0, far: 10 } } }) },
  move() { point.setPosition({ longitude: 116.385, latitude: 39.905, height: 100 }); point.patch({ display: { distance: { near: 0, far: 100000 }, scale: { near: 100, far: 100000, nearValue: 1, farValue: .5 }, translucency: { near: 100, far: 100000, nearValue: 1, farValue: .5 } } }) },
  dispose() { points.dispose(); billboards.dispose() }
}
