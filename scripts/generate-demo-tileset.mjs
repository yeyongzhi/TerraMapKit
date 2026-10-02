// Authored offline fixture: a 400 m cube in a local ENU frame, embedded glTF buffer.
import { mkdir, writeFile } from 'node:fs/promises'
import { Cartesian3, Matrix4, Transforms } from 'cesium'
const positions = new Float32Array([-200,0,200, 200,0,200, 200,0,-200, -200,0,-200, -200,400,200, 200,400,200, 200,400,-200, -200,400,-200])
const indices = new Uint16Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7])
const data = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)])
const gltf = { asset: { version: '2.0', generator: 'TerraMapKit offline sample' }, extensionsUsed: ['KHR_materials_unlit'],
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
  materials: [{ extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] }, doubleSided: true }],
  buffers: [{ byteLength: data.length, uri: `data:application/octet-stream;base64,${data.toString('base64')}` }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 }, { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-200,0,-200], max: [200,400,200] }, { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' }] }
const transform = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(116.39, 39.9, 30))
const tileset = { asset: { version: '1.1' }, geometricError: 40000, root: { transform: Matrix4.toArray(transform), boundingVolume: { box: [0,0,200,200,0,0,0,200,0,0,0,200] }, geometricError: 0, refine: 'ADD', content: { uri: 'box.gltf' } } }
// glTF is Y-up; Cesium converts (x, y, z) to local ENU (x, -z, y).
await mkdir('examples/basic/public/tiles', { recursive: true })
await writeFile('examples/basic/public/tiles/box.gltf', JSON.stringify(gltf))
await writeFile('examples/basic/public/tiles/tileset.json', JSON.stringify(tileset))
