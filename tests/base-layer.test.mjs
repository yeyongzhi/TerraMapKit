import assert from 'node:assert/strict'
import test from 'node:test'
import { GeographicTilingScheme, ImageryLayer, ImageryLayerCollection, Rectangle } from 'cesium'
import { LayerKit, createImageryProvider } from 'terra-map-kit/layer'
const provider = (requestImage = () => Promise.resolve({})) => ({ rectangle: Rectangle.MAX_VALUE, tilingScheme: new GeographicTilingScheme(), tileWidth: 256, tileHeight: 256, requestImage })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const fixture = () => { let destroyed = false; const viewer = { imageryLayers: new ImageryLayerCollection(), isDestroyed: () => destroyed, scene: { requestRender() {} } }; return { viewer, kit: new LayerKit(viewer), destroy: () => { destroyed = true } } }

test('base replacement preflights tiles, retains foreign layers and commits annotations together', async () => {
  const { viewer, kit } = fixture(), foreign = new ImageryLayer(provider()); viewer.imageryLayers.add(foreign)
  const first = await kit.setBaseLayer({ provider: provider() }), pending = deferred()
  const switching = kit.setBaseLayer({ provider: provider(() => pending.promise), annotations: provider(), alpha: 0.4 })
  await Promise.resolve(); assert.equal(kit.getBaseLayer(), first); assert.equal(first.isDestroyed(), false)
  pending.resolve({}); const second = await switching
  assert.equal(kit.getBaseLayer(), second); assert.equal(first.isDestroyed(), true)
  assert.equal(viewer.imageryLayers.get(0), second); assert.equal(viewer.imageryLayers.get(1).alpha, 0.4)
  assert.equal(viewer.imageryLayers.length, 3); kit.removeImageLayer(second)
  assert.equal(kit.getBaseLayer(), undefined); assert.equal(viewer.imageryLayers.length, 1)
  kit.dispose(); assert.equal(foreign.isDestroyed(), false)
})
test('tile/annotation rejection, timeout and throttling preserve the committed base', async () => {
  const { kit, viewer } = fixture(), first = await kit.setBaseLayer({ provider: provider() })
  const error = new Error('tile unavailable')
  await assert.rejects(kit.setBaseLayer({ provider: provider(() => Promise.reject(error)) }), e => e === error)
  await assert.rejects(kit.setBaseLayer({ provider: provider(), annotations: Promise.reject(error) }), e => e === error)
  await assert.rejects(kit.setBaseLayer({ provider: provider(() => undefined) }), /preflight/)
  await assert.rejects(kit.setBaseLayer({ provider: new Promise(() => {}), timeoutMs: 5 }), /timed out/)
  await assert.rejects(kit.setBaseLayer({ provider: provider(), alpha: 2 }), /alpha/)
  assert.equal(kit.getBaseLayer(), first); assert.equal(viewer.imageryLayers.length, 1); kit.dispose()
})
test('last switch wins; superseded provider promises settle without orphan layers', async () => {
  const { kit, viewer } = fixture(), pending = deferred()
  const older = kit.setBaseLayer({ provider: pending.promise })
  const rejection = assert.rejects(older, /superseded/)
  const latest = await kit.setBaseLayer({ provider: provider() }); await rejection
  pending.reject(new Error('late provider failure')); await Promise.resolve()
  assert.equal(kit.getBaseLayer(), latest); assert.equal(viewer.imageryLayers.length, 1); kit.dispose()
})
test('cancel and disposal interrupt pending preflight; late completion cannot attach', async () => {
  for (const dispose of [false, true]) {
    const { kit, viewer } = fixture(), pending = deferred()
    await kit.setBaseLayer({ provider: provider() })
    const switching = kit.setBaseLayer({ provider: provider(() => pending.promise) })
    await Promise.resolve(); const rejection = assert.rejects(switching, /cancelled|disposed/)
    if (dispose) kit.dispose(); else kit.removeBaseLayer()
    await rejection; pending.resolve({}); await Promise.resolve()
    assert.equal(viewer.imageryLayers.length, 0); kit.dispose()
  }
})
test('synchronous annotation insertion failure and reentrant disposal clean staging layers', async () => {
  const { kit, viewer } = fixture(), first = await kit.setBaseLayer({ provider: provider() })
  const add = viewer.imageryLayers.add.bind(viewer.imageryLayers); let calls = 0, failedLayer
  const off = viewer.imageryLayers.layerRemoved.addEventListener(layer => { if (layer !== first) throw new Error('rollback callback failed') })
  viewer.imageryLayers.add = (...args) => { if (++calls === 2) { failedLayer = args[0]; throw new Error('annotation insertion failed') } return add(...args) }
  await assert.rejects(kit.setBaseLayer({ provider: provider(), annotations: provider() }), /insertion/)
  assert.equal(kit.getBaseLayer(), first); assert.equal(viewer.imageryLayers.length, 1)
  assert.equal(failedLayer.isDestroyed(), true); off()
  viewer.imageryLayers.add = add
  viewer.imageryLayers.layerAdded.addEventListener(() => kit.dispose())
  await assert.rejects(kit.setBaseLayer({ provider: provider() }), /disposed/)
  assert.equal(viewer.imageryLayers.length, 0)
})
test('unified XYZ, WMTS and WMS sources construct correct native requests and validate types', async () => {
  const xyz = createImageryProvider({ type: 'xyz', options: { url: 'https://example.com/{z}/{x}/{y}.png' } })
  const wmts = createImageryProvider({ type: 'wmts', options: { url: 'https://example.com/wmts', layer: 'base', style: 'default', tileMatrixSetID: 'w' } })
  const wms = createImageryProvider({ type: 'wms', options: { url: 'https://example.com/wms', layers: 'base' } })
  assert.equal(xyz.constructor.name, 'UrlTemplateImageryProvider'); assert.equal(wmts.constructor.name, 'WebMapTileServiceImageryProvider'); assert.equal(wms.constructor.name, 'WebMapServiceImageryProvider')
  assert.throws(() => createImageryProvider({ type: 'unknown', options: {} }), /Unknown/)
  assert.throws(() => createImageryProvider({ type: 'wmts', options: {} }))
})
test('post-commit removal callbacks preserve the new group and cannot leave old annotations', async () => {
  const { kit, viewer } = fixture()
  const old = await kit.setBaseLayer({ provider: provider(), annotations: provider() })
  const oldAnnotation = viewer.imageryLayers.get(1)
  let throwing = true
  const off = viewer.imageryLayers.layerRemoved.addEventListener(() => { if (throwing) throw new Error('application callback') })
  await assert.rejects(kit.setBaseLayer({ provider: provider() }), /application callback/)
  assert.ok(kit.getBaseLayer()); assert.equal(viewer.imageryLayers.length, 1)
  assert.equal(old.isDestroyed(), true); assert.equal(oldAnnotation.isDestroyed(), true)
  throwing = false; off(); kit.dispose()
  const next = fixture(); await next.kit.setBaseLayer({ provider: provider() })
  next.viewer.imageryLayers.layerRemoved.addEventListener(() => next.kit.removeBaseLayer())
  await assert.rejects(next.kit.setBaseLayer({ provider: provider() }), /cancelled/)
  assert.equal(next.viewer.imageryLayers.length, 0); next.kit.dispose()
})
