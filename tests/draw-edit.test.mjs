import assert from 'node:assert/strict'
import test from 'node:test'
import { Cartesian3, EntityCollection, JulianDate, Color } from 'cesium'
import { DrawKit, CoordinateKit } from 'terra-map-kit'
const point = (lon = 116.39, lat = 39.9, height = 100) => CoordinateKit.fromDegrees(lon, lat, height)
const ring = [[116.37, 39.88, 100], [116.42, 39.88, 100], [116.42, 39.92, 100], [116.37, 39.92, 100], [116.37, 39.88, 100]]
const feature = (id = 'polygon') => ({ type: 'Feature', id, properties: { name: '示例多边形', rules: { enabled: true }, tags: ['safe', 3] }, geometry: { type: 'Polygon', coordinates: [ring.map(p => [...p])] } })
function fixture() { const viewer = { entities: new EntityCollection(), isDestroyed: () => false, scene: { requestRender() {} } }; return { viewer, kit: new DrawKit(viewer) } }
test('imports mixed FeatureCollection; ids, properties and height round-trip without aliasing', () => {
  const { viewer, kit } = fixture(), polygon = feature(0)
  const data = { type: 'FeatureCollection', features: [polygon, { type: 'Feature', id: 'point', properties: null, geometry: { type: 'Point', coordinates: [116.39, 39.9] } }, { type: 'Feature', properties: { id: 'road' }, geometry: { type: 'LineString', coordinates: [[116.39, 39.9, 10], [116.4, 39.91, 30]] } }] }
  const results = kit.fromGeoJSON(data)
  assert.ok(Object.isFrozen(results)); assert.equal(results[0].id, '0'); assert.equal(results[0].featureId, 0)
  assert.equal(results[0].positions.length, 4); assert.equal(viewer.entities.values.length, 3)
  polygon.properties.rules.enabled = false; polygon.geometry.coordinates[0][0][0] = 0
  assert.equal(results[0].properties.rules.enabled, true); assert.ok(Object.isFrozen(results[0].properties.rules))
  const exported = kit.toFeatureCollection()
  assert.equal(exported.features[0].id, 0); assert.equal(exported.features[0].properties.rules.enabled, true)
  assert.deepEqual(exported.features[0].geometry.coordinates[0][0], exported.features[0].geometry.coordinates[0].at(-1))
  assert.ok(Math.abs(exported.features[0].geometry.coordinates[0][0][0] - 116.37) < 1e-8)
  assert.equal(exported.features[1].properties, null); assert.ok(Math.abs(exported.features[1].geometry.coordinates[2]) < 1e-7)
  exported.features[0].properties.rules.enabled = false
  assert.equal(results[0].properties.rules.enabled, true)
  const other = new DrawKit(viewer), again = other.fromGeoJSON(kit.toFeatureCollection())
  assert.deepEqual(again.map(r => r.id), ['0', 'point', 'road'])
  assert.deepEqual(again[0].properties, results[0].properties)
  for (let i = 0; i < results[0].positions.length; i++) assert.ok(Cartesian3.distance(again[0].positions[i], results[0].positions[i]) < 1e-6)
  kit.dispose(); other.dispose()
})
test('invalid batches and duplicate ids leave existing geometry and active editing unchanged', () => {
  const { kit, viewer } = fixture(), [result] = kit.fromGeoJSON(feature())
  const edit = kit.edit(result, { interactive: false })
  const invalid = { type: 'FeatureCollection', features: [feature('new'), { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [] } }] }
  assert.throws(() => kit.fromGeoJSON(invalid), /Only Point/)
  assert.equal(viewer.entities.values.length, 1); assert.equal(kit.getResults().length, 1)
  assert.throws(() => kit.fromGeoJSON(feature()), /Duplicate/)
  edit.moveVertex(0, point(116.365, 39.88)); edit.cancel(); assert.equal(kit.getResult('polygon'), result)
  kit.dispose()
})
test('rejects holes, open rings, self-intersections, unsupported CRS and malformed coordinates', () => {
  const { kit } = fixture()
  const invalid = [
    { type: 'Polygon', coordinates: [ring, ring] }, { type: 'Polygon', coordinates: [ring.slice(0, -1)] },
    { type: 'Polygon', coordinates: [[[116.37, 39.88], [116.42, 39.92], [116.37, 39.92], [116.42, 39.88], [116.37, 39.88]]] },
    { type: 'Point', coordinates: [181, 0] }, { type: 'Point', coordinates: ['1', 0] },
    { type: 'Point', coordinates: [0, 0, NaN] }, { type: 'Point', coordinates: [0, 0, 0, 0] },
    { type: 'Feature', geometry: null }, { type: 'Feature', id: '', geometry: { type: 'Point', coordinates: [0, 0] } },
    { type: 'FeatureCollection', crs: {}, features: [] }
  ]
  for (const input of invalid) assert.throws(() => kit.fromGeoJSON(input))
  assert.equal(kit.getResults().length, 0)
  const cyclic = {}; cyclic.self = cyclic
  assert.throws(() => kit.fromGeoJSON({ ...feature(), properties: cyclic }), /Circular/)
  assert.throws(() => kit.fromGeoJSON({ ...feature(), properties: { date: new Date() } }), /plain JSON/)
  kit.dispose()
})
test('edits are drafts; confirm retains result and native Entity identities, snapshots stay immutable', () => {
  const { kit } = fixture(), [result] = kit.fromGeoJSON(feature())
  const saved = result.positions, entity = result.entity
  let changes = 0, finished
  const edit = kit.edit(result, { interactive: false, onChange: positions => { changes++; assert.ok(Object.isFrozen(positions[0])) }, onFinish: r => finished = r })
  edit.moveVertex(0, point(116.36, 39.88, 100))
  assert.equal(result.positions, saved); assert.ok(Cartesian3.distance(edit.positions[0], saved[0]) > 100)
  assert.ok(Cartesian3.distance(result.entity.polygon.hierarchy.getValue(JulianDate.now()).positions[0], edit.positions[0]) < 1e-6)
  assert.ok(Math.abs(kit.toGeoJSON(result).geometry.coordinates[0][0][0] - 116.37) < 1e-8)
  const returned = edit.finish()
  assert.equal(returned, result); assert.equal(finished, result); assert.equal(result.entity, entity)
  assert.notEqual(result.positions, saved); assert.ok(Cartesian3.distance(saved[0], point(116.37, 39.88)) < 1e-6)
  assert.equal(changes, 1); assert.throws(() => edit.undo(), /no longer/)
  kit.dispose()
})
test('invalid edits retain draft, history and committed data; cancel restores original', () => {
  const { kit } = fixture(), [result] = kit.fromGeoJSON(feature()), original = result.positions
  const edit = kit.edit(result, { interactive: false })
  edit.moveVertex(0, point(116.365, 39.88)); const draft = edit.positions
  assert.throws(() => edit.moveVertex(0, draft[1]), /Duplicate/)
  assert.deepEqual(edit.positions, draft); assert.equal(edit.canUndo, true)
  assert.throws(() => edit.moveVertex(0, point(116.39, 39.93)), /intersect/)
  assert.deepEqual(edit.positions, draft)
  edit.cancel(); edit.cancel(); assert.equal(result.positions, original)
  assert.deepEqual(result.entity.polygon.hierarchy.getValue(JulianDate.now()).positions, original)
  kit.dispose()
})
test('insert, remove, translation, undo and redo preserve topology and branch history', () => {
  const { kit } = fixture(), [result] = kit.fromGeoJSON(feature()), edit = kit.edit(result, { interactive: false })
  edit.insertVertex(1, point(116.395, 39.88)); assert.equal(edit.positions.length, 5)
  edit.removeVertex(1); assert.equal(edit.positions.length, 4)
  assert.equal(edit.undo(), true); assert.equal(edit.positions.length, 5)
  assert.equal(edit.redo(), true); assert.equal(edit.positions.length, 4)
  edit.translate(new Cartesian3(5, 10, 2)); const translated = edit.positions
  assert.ok(Cartesian3.equals(translated[0], Cartesian3.add(result.positions[0], new Cartesian3(5, 10, 2), new Cartesian3())))
  edit.undo(); edit.moveVertex(0, point(116.365, 39.88)); assert.equal(edit.redo(), false)
  assert.throws(() => edit.insertVertex(0.5, point()), /integer/)
  edit.removeVertex(0); assert.throws(() => edit.removeVertex(0), /At least 3/)
  edit.cancel(); kit.dispose()
})
test('point and line edits work; ids and properties survive commits', () => {
  const { kit } = fixture(), [result] = kit.fromGeoJSON({ type: 'Feature', id: 'point', properties: { label: 'point' }, geometry: { type: 'Point', coordinates: [116.39, 39.9, 100] } })
  const edit = kit.edit(result, { interactive: false }); edit.moveVertex(0, point(116.4)); assert.throws(() => edit.insertVertex(1, point()), /Cannot insert/)
  assert.throws(() => edit.removeVertex(0), /At least 1/); edit.finish()
  assert.equal(kit.toGeoJSON(result).id, 'point'); assert.deepEqual(result.properties, { label: 'point' })
  const [line] = kit.fromGeoJSON({ type: 'LineString', coordinates: [[116.39, 39.9], [116.41, 39.91]] }, { idPrefix: 'import-', color: Color.RED })
  const editor = kit.edit(line, { interactive: false }); editor.insertVertex(1, point(116.4, 39.905, 0)); editor.finish()
  assert.equal(line.positions.length, 3); kit.dispose()
})
test('ownership, external removal, session switching and disposed cleanup are isolated', () => {
  const { kit, viewer } = fixture(), other = new DrawKit(viewer), foreign = viewer.entities.add({})
  const [a] = kit.fromGeoJSON(feature()), [b] = other.fromGeoJSON(feature())
  assert.throws(() => kit.edit(b, { interactive: false }), /owned/)
  assert.throws(() => kit.toGeoJSON(b), /owned/)
  const edit = kit.edit(a, { interactive: false }); edit.moveVertex(0, point(116.365, 39.88))
  const draw = kit.start({ type: 'polyline', interactive: false }); assert.throws(() => edit.finish(), /no longer/); draw.cancel()
  const stale = kit.edit(a, { interactive: false }); viewer.entities.remove(a.entity)
  assert.equal(kit.getResult(a.id), undefined); assert.throws(() => stale.moveVertex(0, point()), /no longer/)
  kit.dispose(); kit.dispose(); assert.ok(viewer.entities.contains(b.entity)); assert.ok(viewer.entities.contains(foreign))
  other.dispose(); assert.deepEqual(viewer.entities.values, [foreign])
})
test('import rollback handles native failure and synchronous disposal without leaving batch entities', () => {
  for (const dispose of [false, true]) {
    const { kit, viewer } = fixture(), foreign = viewer.entities.add({}), add = viewer.entities.add.bind(viewer.entities)
    let calls = 0
    viewer.entities.add = entity => { if (++calls === 2 && !dispose) throw new Error('native failure'); const added = add(entity); if (calls === 2 && dispose) kit.dispose(); return added }
    assert.throws(() => kit.fromGeoJSON({ type: 'FeatureCollection', features: [feature('a'), feature('b')] }), dispose ? /disposed/ : /native failure/)
    assert.deepEqual(viewer.entities.values, [foreign]); if (!dispose) assert.equal(kit.getResults().length, 0)
    viewer.entities.add = add; kit.dispose()
  }
})
test('callback errors leave committed edit and undo history consistent; disposal still cleans', () => {
  const { kit, viewer } = fixture(), [result] = kit.fromGeoJSON(feature())
  const edit = kit.edit(result, { interactive: false, onChange: () => { throw new Error('change callback') }, onFinish: () => { throw new Error('finish callback') } })
  assert.throws(() => edit.moveVertex(0, point(116.365, 39.88)), /change callback/)
  assert.equal(edit.canUndo, true)
  assert.throws(() => edit.undo(), /change callback/); assert.equal(edit.canRedo, true)
  assert.throws(() => edit.redo(), /change callback/)
  assert.throws(() => edit.finish(), /finish callback/); assert.equal(kit.getResult(result.id), result)
  kit.edit(result, { interactive: false, onCancel: () => { throw new Error('cancel callback') } })
  assert.throws(() => kit.dispose(), /cancel callback/); assert.equal(viewer.entities.values.length, 0)
})
test('clockwise rings export counterclockwise, properties.id does not override Feature.id, active IDs are reserved', () => {
  const { kit } = fixture(), input = feature('feature-id')
  input.properties.id = 'property-id'; input.geometry.coordinates[0].reverse()
  const [result] = kit.fromGeoJSON(input, { idPrefix: 'loaded-' })
  assert.equal(result.id, 'loaded-feature-id'); assert.equal(result.featureId, 'feature-id')
  const ring = kit.toGeoJSON(result).geometry.coordinates[0]
  const area = ring.slice(0, -1).reduce((sum, p, i) => sum + p[0] * ring[i + 1][1] - ring[i + 1][0] * p[1], 0)
  assert.ok(area > 0); assert.equal(kit.toGeoJSON(result).properties.id, 'property-id')
  const draw = kit.start({ id: 'reserved', type: 'polyline', interactive: false })
  assert.throws(() => kit.fromGeoJSON(feature('reserved')), /Duplicate/)
  draw.cancel(); kit.dispose()
})
