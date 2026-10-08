# CoordinateKit · 坐标转换

提供 WGS84 经纬高与地心坐标转换、ENU 局部坐标和通用几何计算，可独立于 Viewer 使用。`GeometryKit` 同样从本入口和根入口导出，是静态计算工具，不增加 Viewer 模块或监听。

## 模块入口

```ts
import { CoordinateKit } from 'terra-map-kit/coordinate'
```

静态方法，无需 Viewer 或实例。 根入口 `terra-map-kit` 同样导出本模块。公开类与类型：`CoordinateKit, GeometryKit, DegreesPoint, DegreesCoordinate, CartesianBounds, SegmentProjection`。

## 功能与方法

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

屏幕拾取由 [PickKit](./PickKit.md) 提供；GCJ-02/BD-09 坐标系转换未实现。


## 方法签名

```ts
declare class CoordinateKit {
  static createLocalFrame(origin: Cartesian3): Matrix4
  static toLocal(origin: Cartesian3, position: Cartesian3): Cartesian3
  static fromLocal(origin: Cartesian3, local: Cartesian3): Cartesian3
  static offset(origin: Cartesian3, east: number, north: number, up?: number): Cartesian3
  static localCenter(origin: Cartesian3, positions: readonly Cartesian3[]): Cartesian3
  static fromDegrees(longitude: number, latitude: number, height?: number): Cartesian3
  static fromDegreesArray(points: readonly DegreesPoint[]): Cartesian3[]
  static toDegrees(cartesian: Cartesian3): DegreesCoordinate
}
interface CartesianBounds { minimum: Cartesian3; maximum: Cartesian3; center: Cartesian3 }
interface SegmentProjection { position: Cartesian3; fraction: number; distance: number }
declare class GeometryKit {
  static bounds(positions: readonly Cartesian3[]): CartesianBounds
  static closestPointOnSegment(point: Cartesian3, start: Cartesian3, end: Cartesian3): SegmentProjection
  static distanceToSegment(point: Cartesian3, start: Cartesian3, end: Cartesian3): number
  static polylineLength(positions: readonly Cartesian3[]): number
  static interpolatePolyline(positions: readonly Cartesian3[], distance: number): Cartesian3
  static validatePolyline(positions: readonly Cartesian3[]): void
  static validatePolygon(positions: readonly Cartesian3[]): void
  static localPolygonArea(positions: readonly Cartesian3[]): number
}
```

## 数据类型

DegreesPoint 包含 longitude、latitude 及可选 height；DegreesCoordinate 的 height 为必需数字。无需构造实例，没有事件监听或清理步骤。数组返回顺序与输入一致，每个结果都是独立对象。


## ENU 与通用几何

```ts
import { CoordinateKit, GeometryKit } from 'terra-map-kit/coordinate'
import { Cartesian3 } from 'cesium'
const origin = CoordinateKit.fromDegrees(116.39, 39.9, 100)
const moved = CoordinateKit.offset(origin, 500, 300, 20)
const local = CoordinateKit.toLocal(origin, moved) // x=东，y=北，z=上，单位米
const restored = CoordinateKit.fromLocal(origin, new Cartesian3(500, 300, 20))
const length = GeometryKit.polylineLength([origin, moved])
const midpoint = GeometryKit.interpolatePolyline([origin, moved], length / 2)
```

| 方法 | 返回与约定 |
| --- | --- |
| `CoordinateKit.createLocalFrame(origin)` | 新 `Matrix4`，WGS84 ENU 到地心坐标 |
| `CoordinateKit.toLocal(origin, position)` | 新 `Cartesian3`，世界坐标转局部米制坐标 |
| `CoordinateKit.fromLocal(origin, local)` | 新 `Cartesian3`，局部坐标转世界坐标 |
| `CoordinateKit.offset(origin, east, north, up=0)` | 东、北、上米制偏移后的世界坐标 |
| `CoordinateKit.localCenter(origin, positions)` | ENU 顶点算术平均的世界坐标；不是面积重心 |
| `GeometryKit.bounds(positions)` | `{ minimum, maximum, center }`，输入坐标系中的轴对齐包围盒与盒中心 |
| `GeometryKit.closestPointOnSegment(point, start, end)` | `{ position, fraction, distance }`；比例限制在 0–1，退化线段比例为 0 |
| `GeometryKit.distanceToSegment(point, start, end)` | 到三维直线段的距离 |
| `GeometryKit.polylineLength(positions)` | 三维线段长度总和；单点为 0 |
| `GeometryKit.interpolatePolyline(positions, distance)` | 从起点按距离插值，超出长度返回终点，跳过零长线段 |
| `GeometryKit.validatePolyline(positions)` | 成功返回 `void`，拒绝不足两点及相邻距离 ≤1e-6 的点 |
| `GeometryKit.validatePolygon(positions)` | 成功返回 `void`，执行下述共享局部多边形校验 |
| `GeometryKit.localPolygonArea(positions)` | 经共享校验的局部 ENU 投影面积，平方米 |

几何方法接受 `readonly Cartesian3[]`，不修改输入，返回独立对象。除多边形外，数组长度上限为 10000；计算允许零向量及任意有限笛卡尔坐标，是否为米取决于调用者输入。ENU 方法的世界坐标须距地心至少 1 米；不提供球面或地形贴地移动，长距离偏移会离开地球表面。局部中心同样可能低于表面，不自动抬升。极点处方位遵循 Cesium 的 ENU 约定。

多边形校验与 DrawKit、MeasureKit、EffectKit 复用同一个内部实现：单个外环、3–512 个顶点，允许末点在 1e-6 米内重复首点作为闭合标记；以首点 ENU 投影校验重复、重叠、自交和非零面积，所有点距首点不超过 100 km，拒绝相邻经度跨越日期变更线。不支持洞或全球多边形。DrawKit 另保留更严格的绘制重复点容差与输入限制；MaskKit 保留经纬度平面、纬度和外框专用规则。折线校验允许非相邻重复及自交，因为它们是有效的通用路径。

非法类型、空位、非有限分量抛出 `TypeError`；数量、负插值距离、退化多边形、越界或计算溢出抛出 `RangeError`。长度与最近点使用三维直线段，面积使用切平面投影，均不是椭球测地线或地形表面测量。包围盒中心也不是地理范围中心。

## 相关模块

[API 总览](../API说明.md) · [安装与使用](../安装与使用.md) · [MapKit](./MapKit.md)
