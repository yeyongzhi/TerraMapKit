import assert from 'node:assert/strict'
import test from 'node:test'
import { GeographicTilingScheme, ImageryLayer, ImageryLayerCollection, Rectangle } from 'cesium'
import { LayerKit } from 'terra-map-kit'
import { LayerKit as SubpathKit } from 'terra-map-kit/layer'

const provider = () => ({ rectangle: Rectangle.MAX_VALUE, tilingScheme: new GeographicTilingScheme(), tileWidth: 256, tileHeight: 256, requestImage() {} })
function fixture() {
  const viewer = { imageryLayers: new ImageryLayerCollection(), isDestroyed: () => false }
  return { viewer, kit: new LayerKit(viewer) }
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('layer exports and ownership: remove/dispose preserves foreign layers and Viewer', async () => {
  assert.equal(LayerKit, SubpathKit)
  const { viewer, kit } = fixture()
  const foreign = new ImageryLayer(provider())
  viewer.imageryLayers.add(foreign)
  const own = await kit.addImageLayer({ id: 'a', provider: provider(), alpha: 0.3, show: false })
  assert.ok(own instanceof ImageryLayer)
  assert.equal(kit.getImageLayer('a'), own)
  assert.equal(own.alpha, 0.3)
  assert.equal(own.show, false)
  assert.equal(kit.removeImageLayer(foreign), false)
  assert.equal(kit.removeImageLayer(own), true)
  assert.equal(own.isDestroyed(), true)
  assert.equal(kit.removeImageLayer('a'), false)
  await kit.addImageLayer({ provider: provider() })
  kit.dispose(); kit.dispose()
  assert.equal(viewer.imageryLayers.length, 1)
  assert.equal(foreign.isDestroyed(), false)
  assert.equal(viewer.isDestroyed(), false)
  await assert.rejects(kit.addImageLayer({ provider: provider() }), /disposed/)
})

test('async provider reserves ID; rejection releases reservation and retains cause', async () => {
  const { viewer, kit } = fixture()
  const pending = deferred()
  const error = new Error('provider failed')
  const adding = kit.addImageLayer({ id: 'same', provider: pending.promise })
  await assert.rejects(kit.addImageLayer({ id: 'same', provider: provider() }), /Duplicate/)
  const rejection = assert.rejects(adding, candidate => candidate === error)
  pending.reject(error)
  await rejection
  assert.equal(viewer.imageryLayers.length, 0)
  await kit.addImageLayer({ id: 'same', provider: provider() })
  kit.dispose()
})

test('dispose or Viewer destruction while awaiting provider creates no layer', async () => {
  for (const destroyViewer of [false, true]) {
    const { viewer, kit } = fixture()
    const pending = deferred()
    const adding = kit.addImageLayer({ provider: pending.promise })
    if (destroyViewer) viewer.isDestroyed = () => true
    else kit.dispose()
    pending.resolve(provider())
    await assert.rejects(adding, /disposed|destroyed/)
    assert.equal(viewer.imageryLayers.length, 0)
    kit.dispose()
  }
})

test('external removal with or without destruction leaves no stale registration', async () => {
  for (const destroy of [true, false]) {
    const { viewer, kit } = fixture()
    const layer = await kit.addImageLayer({ id: 'a', provider: provider() })
    viewer.imageryLayers.remove(layer, destroy)
    assert.equal(kit.getImageLayer('a'), undefined)
    assert.equal(layer.isDestroyed(), true)
    const next = await kit.addImageLayer({ id: 'a', provider: provider() })
    viewer.imageryLayers.remove(next, false)
    assert.equal(kit.removeImageLayer('a'), false)
    assert.equal(next.isDestroyed(), true)
    kit.dispose()
  }
})

test('synchronous layerAdded callback may dispose without leaving an orphan', async () => {
  const { viewer, kit } = fixture()
  viewer.imageryLayers.layerAdded.addEventListener(() => kit.dispose())
  await assert.rejects(kit.addImageLayer({ provider: provider() }), /disposed/)
  assert.equal(viewer.imageryLayers.length, 0)
})

test('direct external destruction also detaches the stale collection entry', async () => {
  const { viewer, kit } = fixture()
  const layer = await kit.addImageLayer({ id: 'direct', provider: provider() })
  layer.destroy()
  assert.equal(kit.getImageLayer('direct'), undefined)
  assert.equal(viewer.imageryLayers.length, 0)
  kit.dispose()
})

test('validates options and destroyed Viewer before registering resources', async () => {
  const { viewer, kit } = fixture()
  for (const options of [undefined, { id: '', provider: provider() }, { provider: null },
    { provider: provider(), alpha: NaN }, { provider: provider(), show: 1 }]) {
    await assert.rejects(kit.addImageLayer(options), TypeError)
  }
  await assert.rejects(kit.addImageLayer({ provider: provider(), alpha: 1.1 }), RangeError)
  assert.equal(viewer.imageryLayers.length, 0)
  assert.throws(() => new LayerKit({ isDestroyed: () => true }), /destroyed/)
})
