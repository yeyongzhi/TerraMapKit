# API 说明（设计稿）

当前 API **尚未实现**。签名用于固定模块边界，编码过程中若调整，需同步项目说明书、开发说明书和本页。

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

以上代码展示**目标调用形式**，目前不能直接运行。

## CoreKit / MapKit

| API | 目标输入 | 目标输出 | 状态 |
| --- | --- | --- | --- |
| `createMap(container, options?)` | DOM 元素或 ID；`Cesium.Viewer.ConstructorOptions` | 原生 `Cesium.Viewer` | 计划中 |
| `MapKit.createMap(container, options?)` | 同上 | 原生 `Cesium.Viewer` | 计划中 |

`createMap` 是 `MapKit.createMap` 的快捷导出。不会对 `Viewer` 注入 `.layers` 等额外属性；销毁仍由调用方执行 `viewer.destroy()`。

## LayerKit

| API | 目标输入 | 目标输出 | 状态 |
| --- | --- | --- | --- |
| `new LayerKit(viewer)` | 原生 `Cesium.Viewer` | LayerKit 实例 | 计划中 |
| `addImageLayer({ id?, provider, alpha?, show? })` | `ImageryProvider` 或其 Promise；可选图层参数 | `Promise<Cesium.ImageryLayer>` | 计划中 |
| `getImageLayer(id)` | 工具包登记的 ID | `Cesium.ImageryLayer \| undefined` | 计划中 |
| `removeImageLayer(idOrLayer)` | ID 或图层对象 | `boolean` | 计划中 |
| `dispose()` | 无 | `void` | 计划中 |

`LayerKit` 操作 `viewer.imageryLayers`，返回 Cesium 原生图层，方便与原生 API 混用。只移除本实例登记的图层，不清空应用中已有图层。`provider` 的创建可由调用方使用 Cesium 原生 `UrlTemplateImageryProvider`、WMS、WMTS 等类完成；常见来源的快捷方法安排在后续迭代。

## MaskKit

| API | 目标输入 | 目标输出 | 状态 |
| --- | --- | --- | --- |
| `new MaskKit(viewer)` | 原生 `Cesium.Viewer` | MaskKit 实例 | 计划中 |
| `addRegionMask({ id?, positions, outerBounds?, color? })` | 区域多边形及外侧范围 | 可移除的掩膜句柄 | 计划中 |
| `removeRegionMask(idOrHandle)` | ID 或句柄 | `boolean` | 计划中 |
| `dispose()` | 无 | `void` | 计划中 |

首版效果为区域外侧遮暗、区域内侧保持可见。`positions` 使用 WGS84 经纬度点序列；具体类型与边界、跨日期变更线、极区规则在实现时用真实 Cesium 场景验证后固定。

## CoordinateKit

| API | 目标输入 | 目标输出 | 状态 |
| --- | --- | --- | --- |
| `CoordinateKit.fromDegrees(lon, lat, height?)` | WGS84 经度、纬度、高度米 | `Cesium.Cartesian3` | 计划中 |
| `CoordinateKit.fromDegreesArray(points)` | 经纬高点数组 | `Cesium.Cartesian3[]` | 计划中 |
| `CoordinateKit.toDegrees(cartesian)` | `Cesium.Cartesian3` | `{ longitude, latitude, height }` | 计划中 |

经纬度单位为度，高度单位为米。`fromDegrees` 的核心行为应与 Cesium 原生 `Cartesian3.fromDegrees` 一致，工具包只添加输入校验、批量操作及统一类型。屏幕拾取、GCJ-02/BD-09 坐标系转换不在首版范围。
