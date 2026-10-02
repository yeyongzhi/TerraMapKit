# MaskKit · 区域掩膜

以外侧矩形和关注区域孔洞构造局部地表遮暗效果，当前为实验性能力。

## 模块入口

```ts
import { MaskKit } from 'terra-map-kit/mask'
```

使用 `new MaskKit(viewer)` 构造；viewer 必须是存活的原生 Cesium Viewer。 根入口 `terra-map-kit` 同样导出本模块。公开类与类型：`MaskKit, MaskBounds, RegionMaskOptions, RegionMaskUpdateOptions, RegionMaskHandle`。

## 功能与方法

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


## RegionMaskOptions

| 参数 | 类型 / 默认值 | 说明 |
| --- | --- | --- |
| id | string，自动生成 | 本实例逻辑 ID |
| positions | readonly 经纬度点数组，必填 | 关注区域轮廓，高度不参与掩膜 |
| outerBounds | MaskBounds，按点集推导 | west/south/east/north，单位度，须严格包围轮廓 |
| color | Cesium.Color，黑色 alpha 0.55 | 外侧遮暗颜色，分量为 0–1 |

RegionMaskUpdateOptions 与创建参数相同但无 id；handle.update 使用完整新参数而非局部补丁。无 clear 方法，可逐个 remove 或统一 dispose。


## 生命周期与错误处理

先清理本 Kit，再销毁 Viewer。dispose 可重复调用，不销毁 Viewer；清理后创建或更新会抛 Error。Kit 只拥有自身创建/登记的对象。可保留返回的原生 Entity、HTMLElement 或 Primitive 与 Cesium API 混用，但不应把 Kit 对象转移到其他 Viewer。

参数的非法类型或非有限数值通常抛 TypeError，范围或几何限制抛 RangeError；重复 ID、失效会话或已清理实例抛 Error。异步原生错误保持原始原因，详见本页的方法说明。


## 相关模块

[API 总览](../API说明.md) · [安装与使用](../安装与使用.md) · [CoordinateKit](./CoordinateKit.md)
