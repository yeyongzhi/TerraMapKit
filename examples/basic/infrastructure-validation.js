import { Cartesian3, Color, EllipsoidTerrainProvider, JulianDate, CustomShader, ClippingPlaneCollection, ClippingPlane, SceneTransforms } from 'cesium'
import { createMap, CoordinateKit as C, PrimitiveKit, MaterialKit, TerrainKit, DataSourceKit, SnapshotKit, SceneKit, CameraKit, TilesetKit, PickKit, parseWmtsCapabilities } from 'terra-map-kit'
import 'cesium/Build/Cesium/Widgets/widgets.css'
const viewer = createMap('map', { baseLayer: false, baseLayerPicker: false, terrainProvider: new EllipsoidTerrainProvider(), geocoder: false, animation: false, timeline: false, infoBox: false, selectionIndicator: false, requestRenderMode: true, maximumRenderTimeChange: Infinity })
const origin = C.fromDegrees(116.39, 39.9, 100), positions = [[-1000, -1000], [1000, -1000], [0, 1000]].map(([x, y]) => C.offset(origin, x, y))
viewer.camera.setView({ destination: C.fromDegrees(116.39, 39.9, 20000), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } })
viewer.clock.shouldAnimate = true
const baselineListeners = viewer.clock.onTick.numberOfListeners
const primitives = new PrimitiveKit(viewer), materials = new MaterialKit(viewer), terrain = new TerrainKit(viewer), sources = new DataSourceKit(viewer), snapshots = new SnapshotKit(viewer), scene = new SceneKit(viewer), camera = new CameraKit(viewer), tilesets = new TilesetKit(viewer), picks = new PickKit(viewer)
const errors = []; viewer.scene.renderError.addEventListener((_s, error) => errors.push(error.message))
let group, flow, line, tile, shader
window.infrastructure = { viewer, primitives, materials, terrain, sources, snapshots, scene, camera, tilesets, picks, errors, baselineListeners,
  geometry() { group = primitives.addInstances([{ id: 'one', geometry: { type: 'polygon', positions }, color: Color.CYAN }, { id: 'two', geometry: { type: 'polygon', positions: positions.map(p => C.offset(p, 2500, 0)) }, color: Color.ORANGE }], 'batch'); return group.id },
  ready() { return group?.primitive.ready },
  mutate() { primitives.setInstanceVisible('batch', 'two', false); primitives.setInstanceColor('batch', 'one', Color.RED) },
  ground() { return primitives.add({ id: 'ground', ground: true, geometry: { type: 'polyline', positions, width: 5 } }).primitive },
  flow() { flow = materials.addFlow({ speed: .5 }); line = primitives.add({ id: 'flow', geometry: { type: 'polyline', positions: positions.map(p => C.offset(p, 0, 0, 500)), width: 10 }, material: flow.material }); return true },
  pause() { flow.pause(); flow.seek(2); flow.patch({ color: Color.ORANGE, repeat: 8 }); return { constant: flow.property.isConstant, phase: flow.property.getValue(viewer.clock.currentTime).phase } },
  resume() { flow.resume() },
  async data() { const data = await sources.loadGeoJSON({ type: 'LineString', coordinates: [[116.38, 39.89], [116.4, 39.91]] }, { stroke: Color.YELLOW, strokeWidth: 4 }, { id: 'json' }); sources.setVisible('json', false); sources.setVisible('json', true); return data.entities.values.length },
  async screenshot() { const blob = await snapshots.screenshot(); return { type: blob.type, size: blob.size } },
  async tile() { tile = await tilesets.addTileset({ id: 'tile', url: '/tiles/tileset.json' }); tilesets.configure('tile', { maximumScreenSpaceError: 8 }); tilesets.offsetHeight('tile', 10); tilesets.onLoadProgress('tile', () => {}); shader = new CustomShader({ fragmentShaderText: 'void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = vec3(0.4, 0.6, 0.9); }' }); tilesets.setShader('tile', shader, true); tilesets.setClippingPlanes('tile', new ClippingPlaneCollection({ planes: [new ClippingPlane(new Cartesian3(1, 0, 0), 500)] })); return tilesets.getBoundingSphere('tile').radius },
  view() { camera.fitPositions(positions); const rect = camera.getViewRectangle(); return { visible: camera.isVisible(origin), rectangle: !!rect, screen: !!camera.toScreen(origin) } },
  parse() { return parseWmtsCapabilities('<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1"><Contents><Layer><ows:Identifier>base</ows:Identifier><Style><ows:Identifier>default</ows:Identifier></Style><Format>image/png</Format><TileMatrixSetLink><TileMatrixSet>w</TileMatrixSet></TileMatrixSetLink></Layer></Contents></Capabilities>')[0] },
  dispose() { primitives.dispose(); materials.dispose(); terrain.dispose(); sources.dispose(); snapshots.dispose(); camera.dispose(); tilesets.dispose(); picks.dispose(); scene.dispose(); return { entities: viewer.entities.values.length, dataSources: viewer.dataSources.length, primitives: viewer.scene.primitives.length, shaderDestroyed: shader?.isDestroyed(), listeners: viewer.clock.onTick.numberOfListeners } }
}
