import { Cartesian3, Color, JulianDate } from 'cesium'
import { CoordinateKit, TerrainKit, PrimitiveKit, MaterialKit, DataSourceKit, TransformKit, SceneKit, SnapshotKit, MarkerKit, DrawKit } from 'terra-map-kit'
const point = { longitude: 116.39, latitude: 39.9, height: 100 }
const origin = CoordinateKit.fromDegrees(point.longitude, point.latitude, point.height)
const positions = [[-2000, -1000], [2000, -1000], [1000, 2000]].map(([east, north]) => CoordinateKit.offset(origin, east, north))
const select = (key, label, value, choices) => ({ key, label, value, choices, type: 'select' })
const number = (key, label, value, min, max, step = 1) => ({ key, label, value, min, max, step, type: 'number' })
const camera = viewer => viewer.camera.setView({ destination: CoordinateKit.fromDegrees(point.longitude, point.latitude, 18000), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } })
export const infrastructureModules = [
  { id: 'terrain', kit: 'TerrainKit', title: '地形与高度', description: '离线椭球采样、折线加密、高度偏移；在线地形通过原生 Provider 接入。', fields: [number('offset', '采样高度偏移 / m', 100, -1000, 10000)],
    code: p => `import { TerrainKit } from 'terra-map-kit/terrain'\nconst terrain = new TerrainKit(viewer)\nconst result = await terrain.sampleHeight({ longitude: 116.39, latitude: 39.9 }, { offset: ${p.offset} })\nconst profile = await terrain.getHeightProfile([{ longitude: 116.38, latitude: 39.9 }, { longitude: 116.4, latitude: 39.9 }], 100)\nterrain.dispose()`,
    run: async (ctx, p) => { camera(ctx.viewer); const terrain = ctx.own(new TerrainKit(ctx.viewer)), sample = await terrain.sampleHeight(point, { offset: p.offset }); ctx.viewer.entities.add({ position: sample.position, point: { pixelSize: 12, color: Color.CYAN } }); const profile = await terrain.getHeightProfile([{ longitude: 116.38, latitude: 39.9 }, { longitude: 116.4, latitude: 39.9 }], 100, { offset: p.offset }); ctx.report(`采样高度 ${sample.height} 米；剖面 ${profile.length} 点，总长 ${profile.at(-1).distance.toFixed(2)} 米（椭球地形）`) }
  },
  { id: 'primitive', kit: 'PrimitiveKit', title: '线面与体几何', description: '原生普通／贴地几何，以及真正的 GeometryInstance 批处理。', fields: [select('geometry', '几何类型', 'polygon', ['polyline', 'polygon', 'rectangle', 'ellipse', 'wall', 'corridor', 'box', 'cylinder', 'ellipsoid']), select('ground', '贴地', 'false', ['false', 'true'])],
    code: () => `import { PrimitiveKit } from 'terra-map-kit/primitive'\nconst kit = new PrimitiveKit(viewer)\nconst handle = kit.add({ geometry: { type: 'polygon', positions }, color: Color.CYAN })\n// 兼容的静态几何可用 kit.addInstances([...], 'group')\n// 等待 handle.primitive.ready 后更新实例颜色\nhandle.setVisible(false)\nkit.dispose()`,
    run: async (ctx, p) => {
      camera(ctx.viewer); const kit = ctx.own(new PrimitiveKit(ctx.viewer)), type = p.geometry
      const geometry = ['polyline', 'polygon', 'wall', 'corridor'].includes(type) ? { type, positions, width: type === 'polyline' ? 5 : 200 } : type === 'rectangle' ? { type, bounds: { west: 116.37, south: 39.88, east: 116.41, north: 39.92 } } : type === 'ellipse' ? { type, center: origin, semiMajorAxis: 2000, semiMinorAxis: 1000 } : type === 'box' ? { type, dimensions: new Cartesian3(1000, 1000, 1000) } : type === 'cylinder' ? { type, length: 2000, topRadius: 600, bottomRadius: 600 } : { type, radii: new Cartesian3(1000, 1000, 1000) }
      const local = ['box', 'cylinder', 'ellipsoid'].includes(type), h = kit.add({ geometry, color: Color.CYAN.withAlpha(.7), ground: p.ground === 'true', ...(local && { modelMatrix: TransformKit.matrix(CoordinateKit.offset(origin, 0, 0, 1000)) }) })
      ctx.button('更新颜色', () => { h.setColor(Color.ORANGE); ctx.report('实例颜色已更新') }); ctx.button('隐藏几何', () => h.setVisible(false)); ctx.report(`已创建 ${type}；贴地 ${p.ground}；颜色更新须等待原生 ready`)
    }
  },
  { id: 'material', kit: 'MaterialKit', title: '材质与流动', description: '原生线面材质与可暂停、跳转、更新的流动材质。', fields: [select('kind', '材质', 'flow', ['flow', 'solid', 'dash', 'arrow', 'glow', 'outline', 'grid'])],
    code: () => `import { MaterialKit } from 'terra-map-kit/material'\nconst materials = new MaterialKit(viewer)\nconst flow = materials.addFlow({ color: Color.CYAN, speed: 1, repeat: 4 })\n// Entity.polyline.material = flow.property\n// Primitive 外观使用 flow.material\nflow.pause(); flow.seek(2); flow.resume()\nmaterials.dispose()`,
    run: async (ctx, p) => { camera(ctx.viewer); ctx.viewer.clock.shouldAnimate = true; const kit = ctx.own(new MaterialKit(ctx.viewer)); let flow, material
      if (p.kind === 'flow') { flow = kit.addFlow(); material = flow.property; ctx.button('暂停材质', () => flow.pause()); ctx.button('恢复材质', () => flow.resume()); ctx.button('跳转并更新', () => { flow.seek(2); flow.patch({ color: Color.ORANGE, speed: .5 }) }) } else material = MaterialKit[p.kind]()
      if (p.kind === 'grid') ctx.viewer.entities.add({ polygon: { hierarchy: positions, material } }); else ctx.viewer.entities.add({ polyline: { positions, width: 12, material } }); ctx.report(`已创建 ${p.kind} 材质`) }
  },
  { id: 'data-source', kit: 'DataSourceKit', title: '通用数据源', description: '离线 GeoJSON 与自有数据源显隐、替换和清理。', fields: [],
    code: () => `import { DataSourceKit } from 'terra-map-kit/data-source'\nconst sources = new DataSourceKit(viewer)\nawait sources.loadGeoJSON(geojson, { clampToGround: true }, { id: 'source' })\nsources.setVisible('source', false)\nsources.dispose()`,
    run: async ctx => { camera(ctx.viewer); const kit = ctx.own(new DataSourceKit(ctx.viewer)); await kit.loadGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'point' }, geometry: { type: 'Point', coordinates: [116.39, 39.9, 100] } }, { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[116.37, 39.88], [116.41, 39.92]] } }] }, { stroke: Color.CYAN, strokeWidth: 4 }, { id: 'source' }); ctx.button('隐藏数据源', () => kit.setVisible('source', false)); ctx.button('显示数据源', () => kit.setVisible('source', true)); ctx.report('GeoJSON 数据源已加载；支持 CZML、KML 及 CustomDataSource 接入') }
  },
  { id: 'transform', kit: 'TransformKit', title: '姿态与矩阵', description: 'WGS84 局部姿态、缩放、矩阵分解与绕中心旋转。', fields: [number('heading', 'Heading / °', 30, -180, 180), number('scale', '缩放', 1, .1, 5, .1)],
    code: p => `import { TransformKit } from 'terra-map-kit/transform'\nconst matrix = TransformKit.matrix(position, { heading: ${p.heading} * Math.PI / 180, scale: ${p.scale} })\nconst { position: translation, quaternion, scale } = TransformKit.decompose(matrix)\nconst inverse = TransformKit.inverse(matrix)`,
    run: async (ctx, p) => { camera(ctx.viewer); const kit = ctx.own(new PrimitiveKit(ctx.viewer)), matrix = TransformKit.matrix(CoordinateKit.offset(origin, 0, 0, 1000), { heading: p.heading * Math.PI / 180, scale: p.scale }); kit.add({ geometry: { type: 'box', dimensions: new Cartesian3(2000, 500, 500) }, color: Color.ORANGE, modelMatrix: matrix }); const parts = TransformKit.decompose(matrix); ctx.report(`姿态 ${p.heading}°；矩阵缩放 ${parts.scale.x.toFixed(2)}；变换和逆变换均为无状态计算`) }
  },
  { id: 'scene', kit: 'SceneKit', title: '场景与渲染', description: '模式切换、按需渲染、能力检测与可恢复配置。', fields: [select('mode', '模式', '3d', ['3d', '2d', 'columbus']), select('lighting', '光照', 'false', ['false', 'true'])],
    code: p => `import { SceneKit } from 'terra-map-kit/scene'\nconst scene = new SceneKit(viewer)\nscene.configure({ requestRenderMode: true, lighting: ${p.lighting} })\nscene.setMode('${p.mode}')\nconsole.log(scene.capabilities())\nscene.dispose()`,
    run: async (ctx, p) => { camera(ctx.viewer); const kit = ctx.own(new SceneKit(ctx.viewer)); kit.configure({ requestRenderMode: true, maximumRenderTimeChange: Infinity, lighting: p.lighting === 'true' }); kit.setMode(p.mode); ctx.button('刷新场景', () => kit.requestRender()); ctx.report(`场景 ${p.mode}；能力 ${JSON.stringify(kit.capabilities())}`) }
  },
  { id: 'snapshot', kit: 'SnapshotKit', title: '快照与截图', description: '版本化相机、场景及自有标记／绘制数据快照，导出画布 PNG。', fields: [],
    code: () => `import { SnapshotKit } from 'terra-map-kit/snapshot'\nconst snapshots = new SnapshotKit(viewer)\nconst data = snapshots.capture({ markers, drawings, layers })\n// 清理对应自有对象后再恢复，避免 ID 冲突\nawait snapshots.restore(data, { markers, drawings, layers })\nconst png = await snapshots.screenshot()\nsnapshots.dispose()`,
    run: async ctx => { camera(ctx.viewer); const kit = ctx.own(new SnapshotKit(ctx.viewer)), markers = ctx.own(new MarkerKit(ctx.viewer)), drawings = ctx.own(new DrawKit(ctx.viewer))
      markers.addMarker({ id: 'snapshot-point', position: point, point: { pixelSize: 12 } }); drawings.fromGeoJSON({ type: 'LineString', coordinates: [[116.37, 39.88], [116.41, 39.92]] }); const saved = kit.capture({ markers, drawings })
      const output = document.createElement('textarea'); output.rows = 8; output.readOnly = true; output.setAttribute('aria-label', '地图快照 JSON'); output.value = JSON.stringify(saved, null, 2); document.getElementById('actions').append(output)
      ctx.button('清理并恢复快照', async () => { markers.clear(); drawings.clear(); await kit.restore(saved, { markers, drawings }); ctx.report('快照已恢复：标记与绘制对象各 1') })
      ctx.button('导出 PNG', async () => { const blob = await kit.screenshot(); const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'map.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); ctx.report(`截图已生成 ${blob.size} 字节`) }); ctx.report('版本 1 快照已生成；仅保存显式提供的自有数据')
    }
  }
]
