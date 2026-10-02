import test from 'node:test'
import assert from 'node:assert/strict'
import { CustomDataSource, DataSourceCollection, ImageryLayerCollection, GeographicTilingScheme, Rectangle, SingleTileImageryProvider } from 'cesium'
import { LayerKit } from 'terra-map-kit'
import { rasterizeHeatmap } from '../dist/layer/heatmap.js'

const data = [{ id: 'a', longitude: 116, latitude: 40 }, { id: 'b', longitude: 116.01, latitude: 40 }]
const heat = { data: [{ longitude: 0, latitude: 0, value: 1 }], bounds: { west: -1, south: -1, east: 1, north: 1 }, width: 17, height: 17, radius: 4 }
function fixture() { const viewer = { imageryLayers: new ImageryLayerCollection(), dataSources: new DataSourceCollection(), scene: { requestRender() {} }, isDestroyed: () => false }; return { viewer, kit: new LayerKit(viewer) } }

test('heatmap raster preserves geographic orientation, accumulates weights and crops outside bounds', () => {
  const image = rasterizeHeatmap(heat)
  const alpha = (x, y) => image.pixels[(y * 17 + x) * 4 + 3]
  assert.equal(alpha(8, 8), 255); assert.equal(alpha(0, 0), 0)
  const empty = rasterizeHeatmap({ ...heat, data: [{ longitude: 4, latitude: 4, value: 10 }] })
  assert.ok(empty.pixels.every(value => value === 0))
  const north = rasterizeHeatmap({ ...heat, data: [{ longitude: 0, latitude: 0.5, value: 1 }] })
  assert.equal(north.pixels[(4 * 17 + 8) * 4 + 3], 255)
  const accumulated = rasterizeHeatmap({ ...heat, max: 2, data: [...heat.data, ...heat.data] })
  assert.equal(accumulated.pixels[(8 * 17 + 8) * 4], 255)
  assert.throws(() => rasterizeHeatmap({ ...heat, max: 0 }), /max/)
  assert.throws(() => rasterizeHeatmap({ ...heat, bounds: { ...heat.bounds, west: 2 } }), /bounds/)
  assert.throws(() => rasterizeHeatmap({ ...heat, data: [{ ...heat.data[0], value: -1 }] }), /value/)
})

test('cluster updates validate atomically; unified IDs, visibility and ownership', async () => {
  const { viewer, kit } = fixture()
  const foreign = new CustomDataSource('foreign'); await viewer.dataSources.add(foreign)
  const handle = await kit.addClusterLayer({ id: 'points', data })
  assert.equal(kit.getLayer('points'), handle)
  assert.equal(handle.dataSource.entities.values.length, 2)
  assert.throws(() => handle.setData([data[0], data[0]]), /Duplicate/)
  assert.equal(handle.dataSource.entities.values.length, 2)
  await assert.rejects(kit.addHeatmapLayer({ ...heat, id: 'points' }), /Duplicate/)
  await assert.rejects(kit.addImageLayer({ id: 'points', provider: {} }), /Duplicate/)
  handle.setVisible(false); handle.setClustering(false)
  assert.equal(handle.dataSource.show, false); assert.equal(handle.dataSource.clustering.enabled, false)
  const cluster = { billboard: {}, point: {}, label: {} }
  handle.dataSource.clustering.clusterEvent.raiseEvent(handle.dataSource.entities.values, cluster)
  assert.equal(cluster.label.text, '2'); assert.equal(cluster.point.id.length, 2)
  handle.setData([data[0]])
  assert.equal(handle.dataSource.entities.values.length, 1)
  kit.dispose(); kit.dispose()
  assert.equal(viewer.dataSources.length, 1); assert.equal(viewer.dataSources.get(0), foreign)
  assert.equal(handle.remove(), false)
  assert.throws(() => handle.setData(data), /disposed/)
})

test('cluster disposal during native async collection addition leaves no orphan', async () => {
  const { viewer, kit } = fixture()
  const adding = kit.addClusterLayer({ id: 'pending', data })
  kit.dispose()
  await assert.rejects(adding, /disposed/)
  assert.equal(viewer.dataSources.length, 0)
})

test('cluster synchronous addition callbacks may remove or dispose without leaking', async () => {
  for (const dispose of [false, true]) {
    const { viewer, kit } = fixture()
    viewer.dataSources.dataSourceAdded.addEventListener(() => dispose ? kit.dispose() : kit.removeLayer('cluster'))
    await assert.rejects(kit.addClusterLayer({ id: 'cluster', data }), /disposed|removed/)
    assert.equal(viewer.dataSources.length, 0)
    kit.dispose()
  }
})

test('heatmap swaps textures, preserves old data on failure and rejects stale updates', async () => {
  const oldDocument = globalThis.document
  const original = SingleTileImageryProvider.fromUrl
  const queue = []
  globalThis.document = { createElement: () => ({ getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }), toDataURL: () => 'data:image/png;base64,test' }) }
  SingleTileImageryProvider.fromUrl = () => new Promise((resolve, reject) => queue.push({ resolve, reject }))
  const provider = () => ({ rectangle: Rectangle.MAX_VALUE, tilingScheme: new GeographicTilingScheme(), tileWidth: 17, tileHeight: 17, requestImage() {} })
  const { viewer, kit } = fixture()
  try {
    const adding = kit.addHeatmapLayer({ ...heat, id: 'heat' }); queue.shift().resolve(provider())
    const handle = await adding; const originalLayer = handle.layer
    const failing = handle.setData(heat.data); queue.shift().reject(new Error('image failure'))
    await assert.rejects(failing, /image failure/); assert.equal(handle.layer, originalLayer)
    const first = handle.setData(heat.data); const second = handle.setData(heat.data)
    const [one, two] = queue.splice(0); two.resolve(provider()); await second
    one.resolve(provider()); await assert.rejects(first, /superseded/)
    assert.equal(viewer.imageryLayers.length, 1); assert.equal(originalLayer.isDestroyed(), true)
    handle.setVisible(false); assert.equal(handle.layer.show, false)
    const pending = handle.setData(heat.data); kit.removeLayer('heat'); queue.shift().resolve(provider())
    await assert.rejects(pending, /removed/); assert.equal(viewer.imageryLayers.length, 0)
    const loading = kit.addHeatmapLayer({ ...heat, id: 'loading' }); kit.dispose(); queue.shift().resolve(provider())
    await assert.rejects(loading, /disposed/); assert.equal(viewer.imageryLayers.length, 0)
  } finally { kit.dispose(); SingleTileImageryProvider.fromUrl = original; if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument }
})
