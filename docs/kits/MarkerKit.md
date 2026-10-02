# MarkerKit · 业务标记

统一管理 Cesium Entity 的点、图片、文字和组合标记，支持样式更新、显隐、点击回调与资源清理。

## 模块入口与示例

```ts
import { MarkerKit } from 'terra-map-kit/marker'
```

根入口同样导出 MarkerKit 及类型。可以在[示例中心](../示例中心.md)选择 MarkerKit，调整标记类型、文字、颜色和尺寸，再点击地图中的标记。

## 方法

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `new MarkerKit(viewer)` | MarkerKit | 接收存活的原生 Viewer |
| `addMarker(options)` | MarkerHandle | 创建点、图片、标签或其组合 |
| `getMarker(id)` | MarkerHandle 或 undefined | 查询本实例标记，清除外部已移除的登记 |
| `updateMarker(id, options)` | void | 完整替换位置、样式与回调，保留 ID 和 Entity |
| `setVisible(id, show)` | void | 设置整体显隐，主动请求渲染 |
| `onClick(callback)` | 取消订阅函数 | 监听本实例所有标记；可重复独立订阅 |
| `removeMarker(id)` | boolean | 移除本实例登记的 Entity |
| `clear()` | void | 清理标记，保留 Kit 及全局点击订阅 |
| `dispose()` | void | 清理标记、点击事件及自有拾取处理器 |

## 创建与更新

```ts
import { Color } from 'cesium'
import { MarkerKit } from 'terra-map-kit/marker'

const markers = new MarkerKit(viewer)
const station = markers.addMarker({
  id: 'station-01',
  position: { longitude: 116.39, latitude: 39.9, height: 100 },
  point: { pixelSize: 14, color: Color.CYAN },
  label: { text: '北京观测站' },
  onClick: event => console.log(event.id, event.entity)
})

station.update({
  position: { longitude: 116.4, latitude: 39.9, height: 100 },
  image: { image: '/assets/station.svg', width: 32, height: 40 },
  label: { text: '观测站 · 在线' }
}) // 完整替换：未传入的 point 和 onClick 不再保留
station.setVisible(false)
station.remove()
markers.dispose() // 最后再销毁 Viewer
```

MarkerHandle 包含只读 `id`、`entity`，以及 `update(options)`、`setVisible(show)`、`remove()`。原生 Entity 可与 Cesium API 混用。更新前验证并复制输入，非法参数保留原标记；旧句柄不能操作同 ID 的新标记。

## MarkerOptions

| 参数 | 类型与默认值 | 说明 |
| --- | --- | --- |
| id | string，自动生成 | 非空 ID，同时作为原生 Entity ID；不能与 Viewer 中其他 Entity 重复 |
| position | DegreesPoint，必填 | WGS84 经度 ±180°、纬度 ±90°；height 默认 0，单位米，表示椭球高度 |
| point | MarkerPointStyle，可选 | 原生 PointGraphics 样式 |
| image | MarkerImageStyle，可选 | 原生 BillboardGraphics 样式 |
| label | MarkerLabelStyle，可选 | 原生 LabelGraphics 样式 |
| show | boolean，true | 整体显隐 |
| onClick | 回调，可选 | 只在本标记被拾取且显示时调用 |

point、image、label 至少提供一个，可以组合。height 不自动贴地。图片地址由应用提供，本 Kit 不下载缓存或代理资源；加载失败通过 Cesium 原生渲染/资源机制报告。

| 样式 | 参数 | 默认与限制 |
| --- | --- | --- |
| point | pixelSize、color、outlineColor、outlineWidth | 12 px（1–256）、Color.CYAN、Color.WHITE、1 px（0–32） |
| image | image、width、height、scale、color | 非空 URL/data URI 必填；32×40 px（各 1–2048）、1（0.01–100）、Color.WHITE；底部锚定 |
| label | text、font、fillColor、pixelOffset | string 必填；`14px sans-serif`、Color.WHITE；默认向上偏移 24 px，组合图片时按图片高度额外留出 8 px；居中并底部锚定 |

Color 各分量范围为 0–1；样式颜色、位置和 pixelOffset 均复制，之后修改输入不会改变已创建对象。文字按 Cesium Label 显示，不作为 HTML 执行。

## 点击事件

```ts
const off = markers.onClick(event => {
  console.log(event.id, event.marker, event.screenPosition, event.position)
})
off()
```

MarkerClickEvent 扩展 PickEvent：包含 `id`、`entity`、`marker`、`screenPosition`、`position` 和 `picked`。先调用标记自身回调，再调用 Kit 订阅；回调抛出的错误由调用方处理。世界坐标沿用 PickKit 的 auto 求解结果，可能为 undefined。

按原生 Entity 对象身份过滤拾取，不会响应其他 Kit 或应用创建的对象。只有存在回调/订阅时才建立自有 Canvas 拾取处理器，最后一个监听移除时释放，不修改 Viewer 自带输入处理器。

## 生命周期与限制

只清理本实例创建的 Entity。移除和 dispose 可重复调用；dispose 后添加、查询、更新或订阅抛 Error。先清理 MarkerKit，再销毁 Viewer。面向常规 Entity 业务标记；大量动态点可使用 LayerKit 的聚合图层，图片展示性能仍受 Cesium 纹理与浏览器资源限制影响。

导出类型：MarkerOptions、MarkerPointStyle、MarkerImageStyle、MarkerLabelStyle、MarkerClickEvent、MarkerHandle。
