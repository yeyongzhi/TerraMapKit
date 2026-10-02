# CameraKit · 镜头控制

统一位置定位、飞行、视角保存恢复和围绕地理锚点的镜头运动。

## 模块入口

```ts
import { CameraKit } from 'terra-map-kit/camera'
```

使用 `new CameraKit(viewer)` 构造；viewer 必须是存活的原生 Cesium Viewer。 根入口 `terra-map-kit` 同样导出本模块。公开类与类型：`CameraKit, CameraView, CameraPositionOptions, CameraFlightOptions, OrbitOptions`。

## 功能与方法

| 方法 | 返回 / 行为 |
| --- | --- |
| `setView(position, options?)` | 经纬高位置及 heading/pitch/roll 弧度 |
| `flyToPosition(position, options?)` | `Promise<boolean>`，duration 默认 2 秒 |
| `flyTo(target, options?)` | 原生 Viewer.flyTo 目标和选项，`Promise<boolean>` |
| `cancelFlight()` | 本实例登记的飞行返回 false |
| `saveView()` / `restoreView(view)` | 克隆位置、角度、transform / 恢复 |
| `startOrbit(position, options?)` | 返回停止函数，新环绕替换旧环绕 |
| `stopOrbit()` / `dispose()` | 解绑 onTick，恢复开始前的 transform |

OrbitOptions：range 默认 10000 米（1–1e8），pitch 默认 −π/4（−π/2–0），speed 默认 0.2 弧度/模拟秒（−10–10，负数反向）。停止后保持当前镜头位置并恢复参考系。保存恢复和环绕针对 **3D 场景**，不保证跨 2D/Columbus 模式还原。镜头为全局共享对象，同一时间由一个控制方操作。取消 Kit 等待不会取消 Viewer.flyTo 等待中的外部资源加载。


## CameraPositionOptions / CameraFlightOptions

| 参数 | 类型 / 默认值 | 说明 |
| --- | --- | --- |
| position | DegreesPoint，必填 | 经度/纬度单位度，height 默认 0 米 |
| heading | number，当前 heading | 航向角，弧度，须有限 |
| pitch | number，当前 pitch | 俯仰角，−π/2–π/2 弧度 |
| roll | number，当前 roll | 横滚角，弧度，须有限 |
| duration | number，2 | 仅飞行使用，0–3600 秒，0 为立即完成 |


## OrbitOptions

| 参数 | 类型 / 默认值 | 说明 |
| --- | --- | --- |
| range | number，10000 | 到锚点距离，1–100000000 米 |
| pitch | number，−π/4 | 环绕俯仰角，−π/2–0 弧度 |
| speed | number，0.2 | 每模拟秒的弧度，−10–10，允许反向 |

## 使用示例

```ts
import { CameraKit } from 'terra-map-kit/camera'
const camera = new CameraKit(viewer)
const saved = camera.saveView()
const completed = await camera.flyToPosition(
  { longitude: 116.39, latitude: 39.9, height: 12000 },
  { heading: 0, pitch: -Math.PI / 2, duration: 2 }
)
if (completed) {
  viewer.clock.shouldAnimate = true
  const stop = camera.startOrbit({ longitude: 116.39, latitude: 39.9 }, { range: 10000 })
  stop() // 实际应用在停止按钮或卸载时调用
}
camera.restoreView(saved)
camera.dispose()
```

## 飞行结果与视角数据

飞行正常完成为 true，取消或 dispose 为 false；调用异常仍拒绝 Promise。开始本实例新定位/飞行/环绕会结束已有环绕并取消已登记飞行。CameraView 包含 Cartesian3 position、heading/pitch/roll 和 Matrix4 transform，返回值与镜头内部对象隔离。


## 生命周期与错误处理

先清理本 Kit，再销毁 Viewer。dispose 可重复调用，不销毁 Viewer；清理后创建或更新会抛 Error。Kit 只拥有自身创建/登记的对象。可保留返回的原生 Entity、HTMLElement 或 Primitive 与 Cesium API 混用，但不应把 Kit 对象转移到其他 Viewer。

参数的非法类型或非有限数值通常抛 TypeError，范围或几何限制抛 RangeError；重复 ID、失效会话或已清理实例抛 Error。异步原生错误保持原始原因，详见本页的方法说明。


## 相关模块

[API 总览](../API说明.md) · [安装与使用](../安装与使用.md) · [CoordinateKit](./CoordinateKit.md)
