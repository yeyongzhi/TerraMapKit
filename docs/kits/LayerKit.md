# LayerKit · 图层管理

统一管理影像、热力图与点聚合图层，支持逻辑 ID、数据更新、显隐与独立清理。所有图层共享 ID 空间。

## 模块入口

```ts
import { LayerKit } from 'terra-map-kit/layer'
```

使用 `new LayerKit(viewer)` 构造；viewer 必须是存活的原生 Cesium Viewer。根入口 `terra-map-kit` 同样导出本模块及所有图层选项、数据和句柄类型。

## 功能与方法

| API | 目标输入 | 目标输出 | 状态 |
| --- | --- | --- | --- |
| `new LayerKit(viewer)` | 存活的原生 `Cesium.Viewer` | LayerKit 实例 | 已实现 |
| `addImageLayer({ id?, provider, alpha?, show? })` | `ImageryProvider` 或其 Promise；可选图层参数 | `Promise<Cesium.ImageryLayer>` | 已实现 |
| `getImageLayer(id)` | 工具包登记的 ID | `Cesium.ImageryLayer \| undefined` | 已实现 |
| `removeImageLayer(idOrLayer)` | ID 或图层对象 | `boolean` | 已实现 |
| `addHeatmapLayer(options)` | 加权点数据、固定范围和纹理参数 | `Promise<HeatmapLayerHandle>` | 已实现 |
| `addClusterLayer(options)` | 点数据、聚合距离和样式 | `Promise<ClusterLayerHandle>` | 已实现 |
| `getLayer(id)` / `removeLayer(id)` | 三类图层共享 ID | 图层/句柄或 undefined / boolean | 已实现 |
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


## ImageLayerOptions

| 参数 | 类型 / 默认值 | 说明 |
| --- | --- | --- |
| id | string，自动生成 | 非空逻辑 ID；加载中和已登记 ID 均不可重复 |
| provider | ImageryProvider 或 Promise，必填 | 使用 Cesium 原生 Provider，包含其资源配置 |
| alpha | number，1 | 透明度，范围 0–1 |
| show | boolean，true | 初始显隐状态 |


## 显隐与透明度

```ts
const layer = layers.getImageLayer("grid")
if (layer) {
  layer.show = false
  layer.alpha = 0.5
  viewer.scene.requestRender()
}
```

通过 addImageLayer 创建的影像直接使用原生 ImageryLayer 属性。热力图与聚合句柄提供 setVisible 方法。若启用 requestRenderMode，修改原生属性后可主动请求重绘。


## 生命周期与错误处理

先清理本 Kit，再销毁 Viewer。dispose 可重复调用，不销毁 Viewer；清理后创建或更新会抛 Error。Kit 只拥有自身创建/登记的对象。可保留返回的原生 Entity、HTMLElement 或 Primitive 与 Cesium API 混用，但不应把 Kit 对象转移到其他 Viewer。

参数的非法类型或非有限数值通常抛 TypeError，范围或几何限制抛 RangeError；重复 ID、失效会话或已清理实例抛 Error。异步原生错误保持原始原因，详见本页的方法说明。


## 热力图图层

`addHeatmapLayer(options): Promise<HeatmapLayerHandle>` 将加权经纬度点绘制为 Canvas 纹理，使用 Cesium 单张影像覆盖指定范围。不依赖额外热力图库。

```ts
const heat = await layers.addHeatmapLayer({
  id: 'temperature',
  bounds: { west: 116.3, south: 39.8, east: 116.5, north: 40 },
  data: [{ longitude: 116.39, latitude: 39.9, value: 1 }],
  radius: 24, min: 0, max: 2, alpha: 0.75
})
await heat.setData([{ longitude: 116.4, latitude: 39.92, value: 2 }])
heat.setVisible(false)
heat.layer.alpha = 0.5
heat.remove()
```

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| id | 自动生成 | 所有图层类型共享的非空逻辑 ID |
| data | 必填 | `readonly HeatmapPoint[]`；每点包含 longitude、latitude、非负 value |
| bounds | 必填 | west/south/east/north，单位度；正向范围，不跨日期变更线，纬度限 ±85° |
| width / height | 512 / 512 | 纹理像素，整数 16–2048 |
| radius | 24 | 核半径，纹理像素，范围 1–128；不表示屏幕像素或米 |
| min / max | 0 / 1 | 叠加权重的固定映射区间，0 ≤ min < max |
| alpha / show | 0.75 / true | 透明度 0–1、初始显隐 |

权重在圆形核内以 `(1 - 距离²/半径²)²` 衰减并相加。低于 min 的像素透明，高于 max 的像素饱和；颜色从蓝色经过青、绿、黄过渡到红色。范围外点忽略；空数据生成透明图层。更新保持范围、核半径和色标不变。

需要浏览器 Canvas。适合局部、低频更新的数据展示；每次更新重建整张纹理，核采样估算超过 5000 万次会拒绝。大规模或持续高频数据应使用后续 GPU 或分块方案。固定纹理在高倍率放大时会出现像素化。

句柄包含 `id`、`kind: 'heatmap'`、当前原生 `layer`、`setData()`、`setVisible()`、`remove()`。更新成功后原生 ImageryLayer 会被替换并释放，使用 `heat.layer` 获取当前对象。加载失败保留旧图层；并发更新以最后发起的调用为准，被取代的 Promise 拒绝。移除或 dispose 期间完成的更新不会留下图层。

## 点聚合图层

`addClusterLayer(options): Promise<ClusterLayerHandle>` 创建独立 CustomDataSource，通过 Cesium 原生 EntityCluster 按屏幕距离聚合点，聚合标记显示成员数量。

```ts
const sensors = await layers.addClusterLayer({
  id: 'sensors', pixelRange: 80, minimumClusterSize: 2,
  data: [
    { id: 's1', longitude: 116.39, latitude: 39.9, height: 30 },
    { id: 's2', longitude: 116.391, latitude: 39.901, height: 30 }
  ]
})
sensors.setData([{ id: 's3', longitude: 116.4, latitude: 39.9, label: '站点' }])
sensors.setClustering(false)
sensors.setVisible(false)
sensors.remove()
```

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| data | 必填 | `readonly ClusterPoint[]`；每点为 id、longitude、latitude、可选 height 和 label |
| pixelRange | 80 | 屏幕聚合距离，像素，0–1000 |
| minimumClusterSize | 2 | 最少聚合成员数，≥2 的整数 |
| enabled / show | true / true | 是否聚合、是否显示整个图层 |
| color / pointSize | Color.CYAN / 10 | 原生 Color、点像素大小 1–128 |

height 默认 0，表示 WGS84 椭球高度（米），不自动贴地。点 ID 在本数据源中唯一；更新前验证所有数据，非法输入保持原数据。空数据清空点。聚合按当前镜头的屏幕距离计算，不代表统计区域或固定地理网格。

句柄暴露 `dataSource`，可通过 Cesium 原生属性进一步配置；`setData()` 整批替换点。聚合点的拾取 ID 为成员 `Entity[]`，普通点为 Entity，可配合 PickKit 的 `onClick()` 读取 `event.picked.id` 或 `event.picked.primitive.id`。

## 统一查询与移除

```ts
layers.getLayer('sensors') // ImageryLayer、数据图层句柄或 undefined
layers.removeLayer('sensors') // boolean
layers.dispose() // 释放影像、热力纹理、数据源及聚合监听
```

保留现有 `getImageLayer()` / `removeImageLayer()` 用于 `addImageLayer()` 创建的影像。新方法 `getLayer()` / `removeLayer()` 覆盖三类图层。不要把 Kit 的数据源或影像移交其他 Viewer。句柄移除可重复调用，移除后更新抛出 Error。

新增导出类型：`HeatmapPoint`、`HeatmapBounds`、`HeatmapLayerOptions`、`HeatmapLayerHandle`、`ClusterPoint`、`ClusterLayerOptions`、`ClusterLayerHandle`、`DataLayerHandle`，均可从根入口或 `/layer` 导入。

## 相关模块

[API 总览](../API说明.md) · [安装与使用](../安装与使用.md) · [CoordinateKit](./CoordinateKit.md)
