# MeasureKit · 空间测量

提供空间折线距离、椭球测地线距离、局部投影面积与有符号高差。

## 模块入口

```ts
import { MeasureKit } from 'terra-map-kit/measure'
```

使用 `new MeasureKit(viewer)` 构造；viewer 必须是存活的原生 Cesium Viewer。 根入口 `terra-map-kit` 同样导出本模块。公开类与类型：`MeasureKit, MeasureType, MeasureOptions, MeasureResult`。

## 功能与方法

| 静态方法 | 语义 |
| --- | --- |
| `distance(Cartesian3[])` | 相邻采集点 ECEF 直线长度之和，米 |
| `surfaceDistance(DegreesPoint[])` | WGS84 椭球测地线长度之和，忽略高度，米 |
| `area(Cartesian3[])` | 第一顶点 ENU 切平面投影面积，平方米 |
| `heightDifference(from,to)` | to 椭球高度 − from 椭球高度，带符号米 |

静态方法不需 Viewer。area 同 DrawKit 局部限制，最多 512 点、100 km 范围，无孔洞，不是球面或地形表面积。surfaceDistance 不做地形积分，近对跖点失败需拆分线段。可视线使用 Cesium 默认弧线，distance 数值按点间 ECEF 直线计算。

实例 start({type:'distance'|'area'|'height',interactive?,onFinish?,onError?}) 返回 DrawSession；cancel()、remove(id)、clear()、dispose() 管理结果。独立 DrawKit 生成几何和结果标签，高差两点自动完成，其余右键完成。回调 MeasureResult 含 id/type/value/unit/drawing/label，unit 为 m 或 m²。默认地形拾取，高差也可程序传入不同高度点。切换交互工具时应用应取消旧工具，避免不同实例同时响应。


## MeasureOptions 与结果

| 参数 | 类型 / 默认值 | 说明 |
| --- | --- | --- |
| type | MeasureType，必填 | distance / area / height |
| interactive | boolean，true | false 时使用程序添加点 |
| onFinish | (result: MeasureResult) => void | 完成后返回测量值、单位和对象 |
| onError | (error: unknown) => void，可选 | 交互阶段异常通知 |
| result.value | number | 未格式化的计算结果 |
| result.unit | m 或 m² | 面积为 m²，其余为 m |
| result.drawing | DrawResult | 几何 Entity 和坐标快照 |
| result.label | Entity | 已加入 Viewer 的原生结果标签 |

## 程序测量示例

```ts
import { CoordinateKit, MeasureKit } from 'terra-map-kit'
const a = CoordinateKit.fromDegrees(116.39, 39.9, 100)
const b = CoordinateKit.fromDegrees(116.4, 39.91, 200)
console.log(MeasureKit.distance([a, b]))
console.log(MeasureKit.heightDifference(a, b))
const measures = new MeasureKit(viewer)
const session = measures.start({
  type: 'height', interactive: false,
  onFinish: result => console.log(result.value, result.unit)
})
session.addPoint(a)
session.addPoint(b) // 两点高差自动完成
measures.dispose()
```

## 实例方法

| 方法 | 返回值 | 行为 |
| --- | --- | --- |
| start(options) | DrawSession | 开启绘制与计算会话，新会话取消旧会话 |
| cancel() | void | 取消进行中的测量 |
| remove(id) | boolean | 删除对应几何和标签 |
| clear() | void | 取消当前会话并清除全部结果 |
| dispose() | void | 清除结果并释放内部 DrawKit |

distance/surfaceDistance 至少需要 2 点；area 至少需要 3 点。非法坐标和退化几何会抛异常。onFinish 抛错不撤回已完成结果，可继续 remove/clear。


## 生命周期与错误处理

先清理本 Kit，再销毁 Viewer。dispose 可重复调用，不销毁 Viewer；清理后创建或更新会抛 Error。Kit 只拥有自身创建/登记的对象。可保留返回的原生 Entity、HTMLElement 或 Primitive 与 Cesium API 混用，但不应把 Kit 对象转移到其他 Viewer。

参数的非法类型或非有限数值通常抛 TypeError，范围或几何限制抛 RangeError；重复 ID、失效会话或已清理实例抛 Error。异步原生错误保持原始原因，详见本页的方法说明。


## 相关模块

[API 总览](../API说明.md) · [安装与使用](../安装与使用.md) · [CoordinateKit](./CoordinateKit.md)
