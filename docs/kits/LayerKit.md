# LayerKit · 影像图层

管理本实例创建的影像图层，支持异步 Provider、逻辑 ID 与独立清理。

## 模块入口

```ts
import { LayerKit } from 'terra-map-kit/layer'
```

使用 `new LayerKit(viewer)` 构造；viewer 必须是存活的原生 Cesium Viewer。 根入口 `terra-map-kit` 同样导出本模块。公开类与类型：`LayerKit, ImageLayerOptions`。

## 功能与方法

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

Kit 未提供独立 setVisible/setAlpha 方法，使用返回的原生 ImageryLayer 属性。若启用 requestRenderMode，修改原生属性后可主动请求重绘。


## 生命周期与错误处理

先清理本 Kit，再销毁 Viewer。dispose 可重复调用，不销毁 Viewer；清理后创建或更新会抛 Error。Kit 只拥有自身创建/登记的对象。可保留返回的原生 Entity、HTMLElement 或 Primitive 与 Cesium API 混用，但不应把 Kit 对象转移到其他 Viewer。

参数的非法类型或非有限数值通常抛 TypeError，范围或几何限制抛 RangeError；重复 ID、失效会话或已清理实例抛 Error。异步原生错误保持原始原因，详见本页的方法说明。


## 相关模块

[API 总览](../API说明.md) · [安装与使用](../安装与使用.md) · [CoordinateKit](./CoordinateKit.md)
