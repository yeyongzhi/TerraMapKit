# DrawKit · 绘制与编辑

管理点、折线和多边形的绘制、编辑与 GeoJSON 导入导出。使用存活的原生 Cesium Viewer 构造。

```ts
import { DrawKit } from 'terra-map-kit/draw'
const draws = new DrawKit(viewer)
```

根入口也导出本模块及 DrawOptions、DrawSession、DrawResult、DrawEditOptions、DrawEditSession、EditMode、DrawGeoJSON、DrawFeatureCollection、GeoJSONImportOptions、DrawProperties 等类型。

## 管理方法

| 方法 | 行为 |
| --- | --- |
| `start(options)` | 开始绘制，取消已有绘制或编辑会话 |
| `edit(resultOrId, options?)` | 编辑本实例拥有的结果，取消旧会话 |
| `fromGeoJSON(data, options?)` | 导入几何、Feature 或 FeatureCollection，返回结果数组 |
| `getResult(id)` / `getResults()` | 查询结果；剔除被外部移除的 Entity |
| `toGeoJSON(result)` / `toFeatureCollection()` | 导出一个 / 全部已提交结果 |
| `cancel()` | 取消当前绘制或编辑 |
| `remove(idOrResult)` | 移除结果，同时取消该结果的编辑 |
| `clear()` / `dispose()` | 清理全部对象 / 释放实例，不销毁 Viewer |

## 绘制

DrawOptions.type 必填：point、polyline 或 polygon。可选 id（自动生成且必须唯一）、color（Color.CYAN）、width（3，范围 1–10 CSS 像素）、interactive（true）、positionMode（terrain）、maxPoints（点为 1，线/面为 512）、onFinish、onCancel、onError。颜色分量须在 0–1。

左键添加点，移动鼠标预览，右键完成；不足最少点数时取消。DrawSession 提供 entity、addPoint(Cartesian3)、undo():boolean、finish():DrawResult、cancel()。点添加后自动完成；折线至少两点，多边形至少三点。达到 maxPoints 尝试完成；无效几何可撤销或取消。interactive:false 不创建鼠标 handler。结束后的会话不能继续修改。

## 编辑与撤销

```ts
const [polygon] = draws.fromGeoJSON({
  type: 'Feature', id: 'geometry', properties: { visible: true },
  geometry: { type: 'Polygon', coordinates: [[
    [116.39, 39.9, 100], [116.4, 39.9, 100],
    [116.4, 39.91, 100], [116.39, 39.91, 100], [116.39, 39.9, 100]
  ]] }
})
const editor = draws.edit(polygon, {
  onChange: positions => console.log('草稿', positions),
  onFinish: result => console.log('已保存', draws.toGeoJSON(result))
})
editor.setMode('insert')
// 点击青色中点插入；也可使用 vertex、delete 或 translate。
// editor.undo(); editor.redo(); editor.finish(); 或 editor.cancel()
```

| 编辑成员 | 行为 |
| --- | --- |
| `setMode(mode)` | vertex 拖顶点；insert 点击中点；delete 点击顶点；translate 拖动整个对象 |
| `positions` / `handles` | 当前草稿冻结快照 / 辅助 Entity 的只读列表 |
| `result` / `entity` | 原结果和原生 Entity，确认时保持身份 |
| `selectVertex(index)` / `selectedIndex` | 选择顶点 / 当前选择 |
| `moveVertex(index, Cartesian3)` | 替换指定顶点 |
| `insertVertex(index, Cartesian3)` | 在 index 前插入，等于长度时追加；点不支持 |
| `removeVertex(index)` | 删除顶点，仍须满足最少点数和几何约束 |
| `translate(Cartesian3)` | 按 ECEF 米制向量整体平移 |
| `undo()` / `redo()` | 返回是否执行成功；canUndo / canRedo 可用于按钮状态 |
| `finish()` / `cancel()` | 提交并返回原结果 / 恢复原几何 |

DrawEditOptions 的 interactive 默认 true，positionMode 默认 terrain，preserveHeight 默认 true（交互顶点拖动保留原椭球高度）。程序接口直接采用传入坐标；整体移动是 ECEF 刚性平移，不保证椭球高度不变。interactive:false 不创建手柄和鼠标 handler。

历史保留最近 100 次操作，一次拖动计为一步；撤销后新修改清空重做。无效几何不改变草稿或历史。onChange 收到冻结草稿；onFinish、onCancel 在清理会话后执行。调用方回调抛错不会撤回已生效操作；交互异常交给 onError，省略时 console.error。

预览更新原 Entity，但 result.positions 和 GeoJSON 导出始终读取已提交数据，直到 finish()。每次提交产生新冻结快照，旧快照保持不变。取消、新会话、删除或 dispose 均移除手柄并释放相机锁；画布外松开鼠标或窗口失焦也会结束拖动。

## GeoJSON 与结果

输入接受 Point、LineString、单外环 Polygon，以及 Feature / FeatureCollection；集合最多 1000 个 Feature。导入前校验整个批次，重复 ID、非法坐标或不支持的几何不会留下部分结果。

坐标采用 WGS84 `[经度, 纬度, 椭球高度]`，经纬度单位为度，二维坐标高度补 0。Polygon 输入必须闭合，内部去除闭合重复点；导出补闭合点并规范外环为逆时针。约定参见 [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946)。不支持孔洞、Multi 几何、GeometryCollection、null geometry 和旧式 crs。

GeoJSONImportOptions 提供 color、width、idPrefix。逻辑 ID 优先 Feature.id，其次字符串 properties.id，否则自动生成；前缀只改变内部 ID。原 Feature 字符串或数字 ID（包括 0）保存在 featureId 并原样导出。properties 深复制并冻结，保留 null 和嵌套 JSON；拒绝循环、非有限数、函数和非普通对象，嵌套深度最多 32。bbox 与其他外来字段不保留。

DrawResult 包含只读 id、type、entity、positions、properties、featureId。导出返回独立 JSON 对象，不直接写文件；示例中心“绘制、编辑与 GeoJSON”提供通用文本导入导出。

## 几何约束与生命周期

线/面最多 512 点；任意两点相距小于 1 mm 视为重复。多边形使用第一点 ENU 切平面校验，拒绝自交、退化、跨日期变更线；任一点距第一点空间距离不超过 100 km。面使用 perPositionHeight:true，线/面保留高度，不自动贴地采样。

只操作本实例登记且仍存活的结果；外部删除后结果和会话失效。类型错误通常抛 TypeError，范围或几何错误抛 RangeError，重复 ID、失效状态抛 Error。先清理 Kit 再销毁 Viewer；dispose 可重复调用，清理后不能新增或编辑。

[API 总览](../API说明.md) · [示例中心](../示例中心.md) · [CoordinateKit](./CoordinateKit.md) · [EffectKit](./EffectKit.md)
