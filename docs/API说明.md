# API 说明

Core / MapKit、CoordinateKit、LayerKit、EffectKit 及七个扩展 Kit 已实现；MaskKit 提供实验性局部贴地掩膜。当前 npm 包仍为私有，尚未发布。

## 使用方式

```ts
import * as Cesium from 'cesium'
import { createMap, LayerKit, MaskKit, CoordinateKit } from 'terra-map-kit'

// 应用负责 Cesium Widgets CSS 和静态资源配置。
const viewer: Cesium.Viewer = createMap('map', { baseLayerPicker: false })
const layers = new LayerKit(viewer)
const mask = new MaskKit(viewer)

const point: Cesium.Cartesian3 = CoordinateKit.fromDegrees(116.39, 39.9, 0)
viewer.camera.flyTo({ destination: point })
```

以上 API 已存在；运行前应用须配置静态资源、样式和有尺寸的容器，按需选择底图与 Token。无需 Token 的完整示例在 `examples/basic`。

## CoreKit / MapKit

| API | 目标输入 | 目标输出 | 状态 |
| --- | --- | --- | --- |
| `createMap(container, options?)` | DOM 元素或 ID；`Cesium.Viewer.ConstructorOptions` | 原生 `Cesium.Viewer` | 已实现 |
| `MapKit.createMap(container, options?)` | 同上 | 原生 `Cesium.Viewer` | 已实现 |

`createMap` 是 `MapKit.createMap` 的快捷导出。不会对 `Viewer` 注入 `.layers` 等额外属性；销毁仍由调用方执行 `viewer.destroy()`。

### 可运行的最小用法

```ts
import { createMap, MapKit } from 'terra-map-kit/core'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// 调用前由应用配置 CESIUM_BASE_URL 并托管 Cesium 静态资源。
// 页面须有一个带尺寸的 <div id="map"></div>。
const viewer = createMap('map', {
  baseLayerPicker: false,
  baseLayer: false,
  geocoder: false,
  animation: false,
  timeline: false
})
// 原生对象：可直接访问 scene、camera、imageryLayers。
// 页面或组件卸载时：
viewer.destroy()
```

两个入口为同一函数（`MapKit.createMap === createMap`），根入口与 `/core` 均可导入。选项原样交给 Cesium，不合并工具包默认值、不注入 Token、不自动配置资源、不提供额外销毁包装。容器或选项错误沿用 Cesium 原生异常；调用需要浏览器 DOM 和 WebGL，模块导入不创建 Viewer，在 Node.js 中导入已配套测试。

省略选项时保留 Cesium 默认行为，可能请求在线影像或地形；需要离线使用时应明确配置 Provider 或禁用默认底图。完整资源复制、容器布局、离线网格、销毁与重建示例见仓库 `examples/basic/README.md`，根目录运行 `pnpm example:dev` 后访问 `http://127.0.0.1:5173`。当前包未发布，示例使用构建后的仓库自引用。

## LayerKit

| API | 目标输入 | 目标输出 | 状态 |
| --- | --- | --- | --- |
| `new LayerKit(viewer)` | 存活的原生 `Cesium.Viewer` | LayerKit 实例 | 已实现 |
| `addImageLayer({ id?, provider, alpha?, show? })` | `ImageryProvider` 或其 Promise；可选图层参数 | `Promise<Cesium.ImageryLayer>` | 已实现 |
| `getImageLayer(id)` | 工具包登记的 ID | `Cesium.ImageryLayer \| undefined` | 已实现 |
| `removeImageLayer(idOrLayer)` | ID 或图层对象 | `boolean` | 已实现 |
| `dispose()` | 无 | `void` | 已实现 |

`LayerKit` 操作 `viewer.imageryLayers`，返回 Cesium 原生图层，方便与原生 API 混用。只移除本实例登记的图层，不清空应用中已有图层。`provider` 的创建可由调用方使用 Cesium 原生 `UrlTemplateImageryProvider`、WMS、WMTS 等类完成；常见来源的快捷方法安排在后续迭代。

```ts
import { GridImageryProvider } from 'cesium'
import { LayerKit } from 'terra-map-kit/layer'

const layers = new LayerKit(viewer)
const layer = await layers.addImageLayer({
  id: 'grid', provider: new GridImageryProvider({}), alpha: 0.6, show: true
})
layer.show = false
layer.alpha = 0.3
layers.getImageLayer('grid') // 原生对象或 undefined
layers.removeImageLayer('grid')
layers.dispose() // 不销毁 Viewer；清理之后不能重新使用此 Kit
```

导出类型 `ImageLayerOptions`。省略 ID 时自动生成；需要按 ID 查询时自行提供 ID，或保留返回的图层对象。ID 必须为非空字符串；已登记和等待中的 ID 都不能重复。透明度默认为 1，范围 `[0, 1]`；show 默认为 true。非法类型抛出 TypeError，透明度越界抛出 RangeError，重复 ID、Kit 已清理或 Viewer 已销毁抛出 Error。

异步 Provider 的原始失败原因会继续抛出，不留下半成品或占用 ID。等待期间 Kit 或 Viewer 被清理，Promise 将在 Provider 结束后拒绝，不再创建图层；不负责取消 Provider 自身的网络请求。输入选项在等待前读取，之后修改选项对象不会改变本次添加。

外部提前移除的图层会在查询/移除/清理时清除登记；若外部使用 `destroy=false` 移除，本 Kit 仍负责释放其创建的对象。移除返回是否实际从原集合移除；不存在或已提前移除返回 false。不要将 Kit 所有的图层移交其他 Viewer。dispose 可重复调用，移除在 dispose 后返回 false；查询和添加在 dispose 后报错。先清理 Kit，再销毁 Viewer。

## MaskKit

| API | 目标输入 | 目标输出 | 状态 |
| --- | --- | --- | --- |
| `new MaskKit(viewer)` | 存活的原生 `Cesium.Viewer` | MaskKit 实例 | 实验性 |
| `addRegionMask({ id?, positions, outerBounds?, color? })` | 局部区域多边形及外侧矩形 | `RegionMaskHandle` | 实验性 |
| `handle.update({ positions, outerBounds?, color? })` | 完整的新区域参数 | `void` | 实验性 |
| `handle.remove()` | 无 | `boolean` | 实验性 |
| `removeRegionMask(idOrHandle)` | ID 或本实例的句柄 | `boolean` | 实验性 |
| `dispose()` | 无 | `void` | 实验性 |

### 类型与使用

```ts
import { Color } from 'cesium'
import { MaskKit } from 'terra-map-kit/mask'

const masks = new MaskKit(viewer)
const positions = [
  { longitude: 115, latitude: 38 }, { longitude: 118, latitude: 38 },
  { longitude: 118, latitude: 41 }, { longitude: 115, latitude: 41 }
]
const handle = masks.addRegionMask({
  id: 'focus', positions,
  outerBounds: { west: 110, south: 33, east: 123, north: 46 },
  color: Color.BLACK.withAlpha(0.55)
})
handle.update({ positions, color: Color.DARKBLUE.withAlpha(0.7) })
handle.remove()
masks.dispose()
```

导出 `MaskBounds`（west/south/east/north）、`RegionMaskOptions`、`RegionMaskUpdateOptions` 和 `RegionMaskHandle`。句柄含只读 id、原生 entity、update 和 remove。实体使用独立的 Cesium ID，不会与其他 Kit 的同名逻辑 ID 相撞。

### 输入与生命周期

- positions 为只读 WGS84 经度/纬度对象数组，按角度制；贴地掩膜不使用高度。允许末尾重复首点表示闭合，去掉末尾闭合点后需有 3–512 个不同顶点，支持顺时针或逆时针。不支持重复顶点、自交、退化、相邻边回折重叠与极细退化几何。
- 外侧矩形必须严格包围所有区域点；经度范围 `[-180, 180]`，纬度范围 `[-80, 80]`，矩形经纬跨度各不超过 120 度。不支持跨日期变更线。省略 outerBounds 时用点集包围盒向各方向扩展对应跨度的 25%（最小 0.1 度）；超出上述边界会拒绝，而非静默裁剪。
- 默认颜色为黑色、alpha 0.55；必须为 Cesium Color，四个分量均在 `[0, 1]`。输入和颜色会复制，后续修改原始数据不改变现有掩膜。
- 无效字段类型抛出 TypeError；几何或范围限制抛出 RangeError；重复 ID、已销毁 Viewer、已清理 Kit、更新已移除句柄抛出 Error。update 先完成校验再替换 PolygonGraphics，校验失败保持旧掩膜；更新使用完整参数，省略颜色或 bounds 时重新采用默认值。
- remove 返回本次是否从 Entity 集合移除；重复调用、外部提前移除或 Kit 已清理时返回 false。Kit 不移除其他 Entity，不销毁 Viewer。dispose 可重复调用，调用后不能继续创建或更新。

### 已验证范围与限制

掩膜是外环矩形加一个区域孔洞的地表多边形，边采用 RHUMB（恒向线），分类仅作用于地形。**仅外侧矩形内部、关注区域以外被遮暗，矩形以外不受影响**，不是全球屏幕遮罩。不遮挡天空、独立 Entity 或 3D Tiles，不支持多孔洞输入。

已在本机浏览器验证椭球地表、局部孔洞、更新、移除、倾斜视角及合成高度图地形的渲染。真实在线地形服务、不同浏览器/GPU、移动端、极区、日期变更线和复杂地理拓扑尚未验证，因此保持实验性。几何校验在局部经纬平面完成；高顶点数采用 O(n²) 相交检查，512 点为输入上限，不是实时更新性能承诺。

## EffectKit

波纹圈、扩散圈、波形线及生命周期说明见 [Entity 特效](./特效说明.md)，可从根入口或 `terra-map-kit/effect` 导入。

## CoordinateKit

| API | 目标输入 | 目标输出 | 状态 |
| --- | --- | --- | --- |
| `CoordinateKit.fromDegrees(lon, lat, height?)` | WGS84 经度、纬度、高度米 | `Cesium.Cartesian3` | 已实现 |
| `CoordinateKit.fromDegreesArray(points)` | 经纬高点数组 | `Cesium.Cartesian3[]` | 已实现 |
| `CoordinateKit.toDegrees(cartesian)` | `Cesium.Cartesian3` | `{ longitude, latitude, height }` | 已实现 |

### 类型与使用示例

根入口与 `terra-map-kit/coordinate` 子路径均导出 `CoordinateKit`、`DegreesPoint` 和 `DegreesCoordinate`。方法是静态方法，无须 Viewer、DOM、Token 或实例化；当前包未发布，示例用于构建后的本地包。

```ts
import { CoordinateKit, type DegreesPoint } from 'terra-map-kit/coordinate'

const points: readonly DegreesPoint[] = [
  { longitude: 116.39, latitude: 39.9 },
  { longitude: 121.47, latitude: 31.23, height: 100 }
]
const position = CoordinateKit.fromDegrees(116.39, 39.9, 100)
const positions = CoordinateKit.fromDegreesArray(points)
const { longitude, latitude, height } = CoordinateKit.toDegrees(position)
```

```ts
interface DegreesPoint {
  longitude: number
  latitude: number
  height?: number
}
interface DegreesCoordinate {
  longitude: number
  latitude: number
  height: number
}
```

### 参数约定与错误

- 固定使用 `Ellipsoid.WGS84`，不受应用修改 Cesium 默认椭球的影响。经纬度单位为度，高度单位为米；高度省略或为 `undefined` 时使用 0，允许负高度。
- 经度必须在 `[-180, 180]`，纬度必须在 `[-90, 90]`，边界包含在内；不自动归一化越界经度。
- 非数字、NaN、Infinity 等输入抛出 `TypeError`；经纬度越界抛出 `RangeError`。极端高度若生成非有限 Cartesian 分量，也抛出 `RangeError`。
- 批量输入支持只读数组，不修改原数组；按输入顺序返回新的 Cartesian3 对象，空数组返回空数组。数组空位、非法点或非法字段会使整个调用抛错，不跳过错误点。
- `toDegrees` 校验 x/y/z 为有限数字；地心 `(0, 0, 0)` 没有确定的经纬高，抛出 `RangeError`。其他无法获得有限转换结果的输入同样抛出 `RangeError`。
- 结果为新对象，不需要资源释放。浮点往返不能按严格相等比较；测试中常规点采用角度 `1e-8` 度、高度 `1e-4` 米容差，这不是所有输入的精度保证。极点经度不唯一；极端负高度可能穿过地心，不能保证往返还原输入。

屏幕拾取由 PickKit 提供；GCJ-02/BD-09 坐标系转换未实现。七个扩展 Kit 的方法表和示例见 [扩展 Kit 说明](./扩展Kit说明.md)。
