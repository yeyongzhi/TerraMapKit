# CoordinateKit · 坐标转换

提供 WGS84 经纬高与地心坐标的双向转换，可独立于 Viewer 使用。

## 模块入口

```ts
import { CoordinateKit } from 'terra-map-kit/coordinate'
```

静态方法，无需 Viewer 或实例。 根入口 `terra-map-kit` 同样导出本模块。公开类与类型：`CoordinateKit, DegreesPoint, DegreesCoordinate`。

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
  static fromDegrees(longitude: number, latitude: number, height?: number): Cartesian3
  static fromDegreesArray(points: readonly DegreesPoint[]): Cartesian3[]
  static toDegrees(cartesian: Cartesian3): DegreesCoordinate
}
```

## 数据类型

DegreesPoint 包含 longitude、latitude 及可选 height；DegreesCoordinate 的 height 为必需数字。无需构造实例，没有事件监听或清理步骤。数组返回顺序与输入一致，每个结果都是独立对象。


## 相关模块

[API 总览](../API说明.md) · [安装与使用](../安装与使用.md) · [MapKit](./MapKit.md)
