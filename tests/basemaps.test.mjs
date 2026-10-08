import assert from 'node:assert/strict'
import test from 'node:test'
import { Resource, ImageryLayerCollection, WebMercatorTilingScheme } from 'cesium'
import { LayerKit, createAmapImageryProvider, createTiandituImageryProvider } from 'terra-map-kit/layer'
test('basemap factories validate and construct native providers without external requests', async () => {
  const amap = createAmapImageryProvider({ url: 'https://tiles.example.com/{z}/{x}/{y}.png', maximumLevel: 19 })
  assert.ok(amap.tilingScheme instanceof WebMercatorTilingScheme); assert.equal(amap.maximumLevel, 19)
  const wmts = createTiandituImageryProvider({ key: 'test-key', layer: 'cva', maximumLevel: 16 })
  assert.equal(wmts.minimumLevel, 1); assert.equal(wmts.maximumLevel, 16)
  assert.throws(() => createAmapImageryProvider({ url: '' }), /url/)
  assert.throws(() => createAmapImageryProvider({ url: 'https://tiles.example.com/static.png' }), /XYZ/)
  assert.throws(() => createTiandituImageryProvider({ key: '' }), /key/)
  assert.throws(() => createTiandituImageryProvider({ key: 'test-key', layer: 'wrong' }), /layer/)
  assert.throws(() => createTiandituImageryProvider({ key: 'test-key', maximumLevel: 1.5 }), /integer/)
  const original = Resource.prototype.fetchImage, urls = []
  Resource.prototype.fetchImage = function() { urls.push(this.url); return Promise.resolve({}) }
  try {
    await amap.requestImage(1, 2, 3); await wmts.requestImage(0, 1, 2)
    assert.ok(urls.some(url => url.includes('/3/1/2.png')))
    const request = new URL(urls.find(url => url.includes('tianditu')))
    assert.equal(request.searchParams.get('tk'), 'test-key'); assert.equal(request.searchParams.get('layer'), 'cva'); assert.equal(request.searchParams.get('tilematrix'), '2')
  } finally { Resource.prototype.fetchImage = original }
})
test('basemap additions preserve LayerKit ownership, duplicate IDs and cleanup', async () => {
  const viewer = { imageryLayers: new ImageryLayerCollection(), isDestroyed: () => false }, kit = new LayerKit(viewer)
  const a = await kit.addAmapLayer({ id: 'amap', url: 'https://tiles.example.com/{z}/{x}/{y}.png', alpha: 0.5 })
  const t = await kit.addTiandituLayer({ id: 'tdt', key: 'test-key', show: false })
  assert.equal(kit.getImageLayer('amap'), a); assert.equal(a.alpha, 0.5); assert.equal(t.show, false)
  await assert.rejects(kit.addTiandituLayer({ id: 'tdt', key: 'test-key' }), /Duplicate/)
  assert.equal(kit.removeImageLayer(a), true); kit.dispose(); assert.equal(viewer.imageryLayers.length, 0)
})
