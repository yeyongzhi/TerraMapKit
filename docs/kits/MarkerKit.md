# MarkerKit · 地图标记

统一管理 Cesium Entity 的点、图片、文字和组合标记，支持位置编辑、通用属性、JSON 导入导出及点击、悬停事件。

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
| `patchMarker(id, options)` | void | 局部更新顶层字段；样式组整体替换，不能修改 ID |
| `getMarkers()` | readonly MarkerHandle[] | 查询本实例全部存活标记 |
| `fromJSON(data)` / `toJSON()` | 句柄数组 / MarkerData[] | 批量导入 / 导出已确认的位置、样式与属性 |
| `edit(idOrHandle, options?)` / `cancelEdit()` | MarkerEditSession / void | 编辑位置 / 取消当前编辑 |
| `setVisible(id, show)` | void | 设置整体显隐，主动请求渲染 |
| `onHover(callback)` | 取消订阅函数 | 监听 enter / leave，重复订阅独立取消 |
| `onClick(callback)` | 取消订阅函数 | 监听本实例所有标记；可重复独立订阅 |
| `removeMarker(id)` | boolean | 移除本实例登记的 Entity |
| `clear()` | void | 清理标记，保留 Kit 及全局点击订阅 |
| `dispose()` | void | 清理标记、点击事件及自有拾取处理器 |

## 创建与更新

### 批量操作

```ts
const handles = markers.addMarkers([
  { id: 'a', position: { longitude: 116.39, latitude: 39.9 }, point: {} },
  { id: 'b', position: { longitude: 116.4, latitude: 39.9 }, point: {} }
])
markers.patchMarkers(handles.map(h => ({ id: h.id, patch: { show: false } })))
const removed = markers.removeMarkers(['a', 'b']) // 实际移除数量
```

addMarkers 接收 readonly MarkerOptions[]，返回冻结的句柄数组；patchMarkers 接收 readonly MarkerPatch[]（id、patch），返回 void；removeMarkers 接收 readonly string[]，返回实际移除数量。每批最多 10000 条，空数组为无操作。创建、更新不允许重复 ID；移除重复 ID 去重，不存在的 ID 忽略。

输入在修改前整批校验；无效参数不会取消编辑或改变已有标记。创建运行失败清理新增对象；更新运行失败恢复仍由当前 Kit 管理的原对象，不复活被外部删除或替换的对象。清理或回滚的回调再抛错会以 AggregateError 报告。移除是删除操作，回调失败后继续处理其余对象，不撤销已经发生的删除。

正常批次合并为一次 collectionChanged 通知与一次 Kit 渲染请求，拾取订阅只在批次结束后同步；fromJSON 和 clear 复用同样的批量合并行为。原生 Entity.definitionChanged 或编辑回调仍可能在更新过程中执行。collectionChanged 在提交后派发，外部回调抛错或主动修改对象不能保证事务回滚，调用方需自行处理。更新保持句柄与 Entity 身份，patch 中样式组整体替换。

按需渲染场景使用 requestRenderMode:true 与 maximumRenderTimeChange:Infinity；批量修改仍主动刷新。性能示例见[标记性能基准](../标记性能.md)。

```ts
import { Color } from 'cesium'
import { MarkerKit } from 'terra-map-kit/marker'

const markers = new MarkerKit(viewer)
const marker = markers.addMarker({
  id: 'marker-01',
  position: { longitude: 116.39, latitude: 39.9, height: 100 },
  point: { pixelSize: 14, color: Color.CYAN },
  label: { text: '文字标记' },
  onClick: event => console.log(event.id, event.entity)
})

marker.update({
  position: { longitude: 116.4, latitude: 39.9, height: 100 },
  image: { image: '/assets/marker.svg', width: 32, height: 40 },
  label: { text: '图片标记' }
}) // 完整替换：未传入的 point 和 onClick 不再保留
marker.setVisible(false)
marker.remove()
markers.dispose() // 最后再销毁 Viewer
```

MarkerHandle 包含只读 id、entity、position、properties，以及 update、patch、setPosition、setVisible、remove。position 是已确认的冻结经纬度快照，properties 深复制并冻结。原生 Entity 可与 Cesium API 混用；非法参数保留原标记，旧句柄不能操作同 ID 的新标记。update 完整替换，patch 保留未传字段；patch 中的 point/image/label 各组整体替换，不深合并。

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
| onHover | 回调，可选 | MarkerHoverEvent，phase 为 enter 或 leave |
| properties | JSON 对象或 null，默认 null | 支持嵌套普通对象与数组；拒绝循环、函数、非有限数与非普通对象；最多嵌套 32 层 |

point、image、label 至少提供一个，可以组合。height 不自动贴地。图片地址由应用提供，本 Kit 不下载缓存或代理资源；加载失败通过 Cesium 原生渲染/资源机制报告。

| 样式 | 参数 | 默认与限制 |
| --- | --- | --- |
| point | pixelSize、color、outlineColor、outlineWidth | 12 px（1–256）、Color.CYAN、Color.WHITE、1 px（0–32） |
| image | image、width、height、scale、color | 非空 URL/data URI 必填；32×40 px（各 1–2048）、1（0.01–100）、Color.WHITE；底部锚定 |
| label | text、font、fillColor、pixelOffset | string 必填；`14px sans-serif`、Color.WHITE；默认向上偏移 24 px，组合图片时按图片高度额外留出 8 px；居中并底部锚定 |

Color 各分量范围为 0–1；样式颜色、位置和 pixelOffset 均复制，之后修改输入不会改变已创建对象。文字按 Cesium Label 显示，不作为 HTML 执行。

## 点击与悬停事件

MarkerClickEvent 包含 id、entity、marker、screenPosition、position 和 picked。onClick 返回取消订阅函数；标记自身回调先于 Kit 回调。onHover 接收 phase: enter 或 leave，仅目标变化时触发。通过 Entity 身份过滤，重叠几何使用 drillPick 查找自有标记。只有存在订阅时才创建自有 Canvas 处理器，取消最后一个监听时释放。

## 位置编辑

```ts
marker.setPosition({ longitude: 116.4, latitude: 39.9, height: 100 })
marker.patch({ point: { color: Color.RED } })
marker.patch({ label: { text: '文字标记' } })
const editor = markers.edit(marker, {
  onChange: position => console.log('预览', position),
  onFinish: marker => console.log('确认', marker.position)
})
// 拖动标记后 editor.finish()；取消使用 editor.cancel()。
```

MarkerEditOptions：interactive 默认 true，positionMode 默认 terrain，preserveHeight 默认 true（鼠标拖动保留原椭球高度）；支持 onChange、onFinish、onCancel、onError。interactive:false 可用 moveTo(DegreesPoint) 程序编辑而不创建鼠标 handler；程序接口高度省略为 0。

MarkerEditSession 暴露 marker、position 草稿、moveTo、finish 和 cancel。预览修改原 Entity，但 MarkerHandle.position、toJSON 始终读取已确认坐标。finish 提交并返回原句柄，cancel 恢复原位置。新编辑、update/patch、隐藏、删除和 dispose 会取消当前相关编辑。拖动时临时关闭相机输入，鼠标松开、画布外松开、失焦或取消均恢复原值。回调在状态更新后执行；交互错误交给 onError，未指定时 console.error。

## JSON 数据

```ts
const saved = markers.toJSON()
// JSON.stringify(saved) 可保存到文件或应用存储。
markers.clear()
const restored = markers.fromJSON(JSON.parse(JSON.stringify(saved)))
```

MarkerData 是 JSON 数据格式，与 Cesium 类型的 MarkerOptions 区分：颜色为四分量 RGBA 数组（0–1），pixelOffset 为 `{x,y}`。包含 id、position、show、properties 和可选 point/image/label/display；导入缺省 show/properties 为 true/null。ID 必须为非空字符串，批次最多 10000 条。全批次预校验；重复 ID、与 Viewer 对象冲突或无效坐标/样式不会留下部分对象，原生创建失败回滚该批次。

导出深复制通用属性和已确认位置、样式，不包含回调或未确认草稿。颜色序列化为 RGBA 数组。

## 生命周期与限制

只清理本实例创建的 Entity。移除和 dispose 可重复调用；dispose 后添加、查询、更新或订阅抛 Error。先清理 MarkerKit，再销毁 Viewer。面向常规 Entity 地图标记；大量动态点可使用 LayerKit 的聚合图层，图片展示性能仍受 Cesium 纹理与浏览器资源限制影响。

导出类型包括：MarkerProperties、MarkerData、MarkerHoverEvent、MarkerEditOptions、MarkerEditSession；原有类型保持导出。
## 距离显示控制

MarkerOptions 新增 `display?: MarkerDisplayOptions | undefined`，统一应用于该标记的 point、image 和 label。`createMarkerDisplayOptions(display)` 可独立生成 Cesium 原生属性，供应用自己的 Graphics 或 Primitive 使用。

```ts
import { createMarkerDisplayOptions, type MarkerDisplayOptions } from 'terra-map-kit/marker'
const display: MarkerDisplayOptions = {
  distance: { near: 0, far: 100000 },
  scale: { near: 100, far: 100000, nearValue: 1, farValue: .2 },
  translucency: { near: 100, far: 100000, nearValue: 1, farValue: 0 },
  disableDepthTestDistance: 0
}
marker.patch({ display })
marker.patch({ display: undefined }) // 清除距离属性，恢复深度测试
const nativeOptions = createMarkerDisplayOptions(display)
```

near/far 为非负有限米数，far 必须大于 near；scale 值为非负有限数，translucency 值在 0–1。深度测试阈值为非负米数：0 保持测试、Infinity 始终禁用、有限正数表示相机超过该距离后禁用。禁用可能让点穿透地形或模型显示。display 在 patch 时整体替换，不合并内部字段；传入值独立复制。MarkerData 保存同样配置，其中 Infinity 阈值使用字符串 `"infinity"`，避免 JSON 转为 null；导入会还原。

## PrimitiveMarkerKit · 原生点位集合

```ts
import { PrimitiveMarkerKit } from 'terra-map-kit/marker'
import { Color } from 'cesium'
const display = { distance: { near: 0, far: 100000 } }
const points = new PrimitiveMarkerKit(viewer, 'point')
const handles = points.addMarkers([
  { id: 'a', position: { longitude: 116.39, latitude: 39.9, height: 100 }, pixelSize: 8, display }
])
points.patchMarkers([{ id: 'a', patch: { color: Color.ORANGE } }])
handles[0].setPosition({ longitude: 116.4, latitude: 39.9, height: 100 })
const off = points.onClick(({ marker }) => console.log(marker.id))
points.setVisible(false)
points.removeMarkers(['a'])
off()
points.dispose()

const images = new PrimitiveMarkerKit(viewer, 'billboard')
images.addMarker({ position: { longitude: 116.39, latitude: 39.9 }, image: '/pin.svg', width: 24, height: 24 })
// 离开页面时 images.dispose()
```

每实例拥有一个 PointPrimitiveCollection 或 BillboardCollection，kind 默认 point，创建后不能切换。位置采用 WGS84 经纬度、高度米；不创建 Entity，不注册时钟或渲染监听。不提供标签、编辑与 JSON，这些能力由 Entity MarkerKit 提供。

```ts
interface PrimitiveMarkerOptions {
  id?: string
  position: DegreesPoint
  show?: boolean
  color?: Color
  pixelSize?: number
  image?: string
  width?: number
  height?: number
  scale?: number
  display?: MarkerDisplayOptions | undefined
}
interface PrimitiveMarkerPatch { id: string; patch: Partial<Omit<PrimitiveMarkerOptions, 'id'>> }
interface PrimitiveMarkerHandle {
  readonly id: string
  readonly primitive: PointPrimitive | Billboard
  patch(options: Partial<Omit<PrimitiveMarkerOptions, 'id'>>): void
  setPosition(position: DegreesPoint): void
  setVisible(show: boolean): void
  remove(): boolean
}
```

| API | 说明 |
| --- | --- |
| `new PrimitiveMarkerKit(viewer, kind?)` | 创建并挂载本实例集合，kind 为 point 或 billboard |
| `size: number` | 当前仍存在的自有点位数量 |
| `addMarker(options)` | 返回 PrimitiveMarkerHandle |
| `addMarkers(readonly options[])` | 返回只读句柄数组 |
| `patchMarkers(readonly patches[])` | 保持原生对象身份，批量更新 |
| `removeMarkers(readonly ids[])` | 去重后删除，返回实际删除数量，忽略缺失 ID |
| `pick(Cartesian2)` | 返回最上层被拾取的自有可见句柄或 undefined |
| `onClick(callback)` | 懒创建画布拾取 handler，返回独立取消订阅函数；事件包含 PickEvent 与 marker |
| `setVisible(boolean)` | 设置整个集合显隐，不改各点位 show |
| `clear()` | 清空点位，保留集合以便复用 |
| `dispose()` | 释放拾取 handler、移除并销毁集合，可重复调用 |

point 的 pixelSize 默认 5、范围 1–256，默认青色；billboard 必须提供非空 image URL/data URI，默认白色 tint，width/height 默认 32、范围 1–2048，scale 默认 1、范围 .01–100。point 不接受 image；width/height/scale 仅用于 billboard。show 默认 true；display 与 Entity 共用同一配置和校验。图片异步加载与纹理准备由 Cesium 管理，add 返回不代表图片加载成功；图标原生对象 ready 为 true 才能渲染。

批次上限 50000，预校验空位、字段、重复 ID、坐标和全部 patch；patch 的 ID 不可修改，style 为顶层字段更新，display 整体替换。正常批次只请求一次渲染；单点方法也请求刷新，适配 requestRenderMode。创建失败回滚该批次新点位；原生 setter 失败时尝试恢复已更新点位。直接修改 primitive、原生回调抛错或外部销毁不构成事务保证。新旧同 ID 使用身份隔离，旧句柄不能操作替代对象。

ID 只需在本实例内唯一。拾取以句柄身份验证，不将其他集合中的同名 ID 视为自有对象；遮挡仍遵循 scene.pick，不执行穿透拾取。清理保留其他集合和 Viewer；外部移除或销毁集合后操作会拒绝，仍可 dispose。先销毁 Kit，再销毁 Viewer。静态资源与大量不同图像的纹理成本由应用负责。

[点位集合性能与实测](../点位集合性能.md) · [交互示例](../示例中心.md)
