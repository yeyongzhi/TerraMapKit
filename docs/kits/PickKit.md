# PickKit · 屏幕拾取

获取屏幕位置对应的场景对象和地理坐标，并提供独立输入事件订阅。

## 模块入口

```ts
import { PickKit } from 'terra-map-kit/pick'
```

使用 `new PickKit(viewer)` 构造；viewer 必须是存活的原生 Cesium Viewer。 根入口 `terra-map-kit` 同样导出本模块。公开类与类型：`PickKit, PickPositionMode, PickEventType, PickEvent`。

## 功能与方法

| 方法 | 返回 / 行为 |
| --- | --- |
| `pick(screenPosition)` | 原生 scene.pick 结果或 undefined |
| `toWorld(screenPosition, mode?)` | 克隆后的 Cartesian3 或 undefined |
| `on(type, callback)` | 返回独立、幂等的取消订阅函数 |
| `onClick(callback)` / `onMove(callback)` | click / move 的快捷入口 |
| `dispose()` | 释放自建输入处理器 |

screenPosition 为相对于 canvas 的 CSS 像素 Cartesian2。mode 默认 auto，依次尝试深度、地形、椭球；depth/terrain/ellipsoid 只走指定途径。深度依赖浏览器支持与已渲染内容，透明对象遵循原生规则。地形使用当前已加载的数据，不主动请求高精度采样。天空可能返回 undefined。

事件类型 `click | move | rightClick`，回调收到 `{screenPosition, position, picked}`，position 用 auto 模式。按需创建 handler，最后一个订阅解绑后销毁，不覆盖 Viewer 自有 handler；事件注册需要浏览器。

```ts
import { PickKit, CoordinateKit } from 'terra-map-kit'
const pick = new PickKit(viewer)
const off = pick.onClick(event => {
  if (event.position) console.log(CoordinateKit.toDegrees(event.position), event.picked)
})
off()
pick.dispose()
```


## 拾取参数与事件数据

| 参数 | 类型 / 默认值 | 说明 |
| --- | --- | --- |
| screenPosition | Cartesian2，必填 | canvas 内 CSS 像素，不是窗口绝对坐标或设备像素 |
| mode | PickPositionMode，auto | auto / depth / terrain / ellipsoid |
| type | PickEventType，必填 | click / move / rightClick |
| callback | (event: PickEvent) => void | 收到屏幕点、自动拾取坐标和原生拾取对象 |


## 坐标拾取示例

```ts
import { Cartesian2 } from "cesium"
import { PickKit } from "terra-map-kit/pick"
const pick = new PickKit(viewer)
const position = pick.toWorld(new Cartesian2(100, 200), "terrain")
if (position) console.log(position)
pick.dispose()
```

回调中的 picked 不固定为 Entity；具体对象结构遵循 scene.pick，可先检查 picked.id 再使用。取消订阅和 dispose 都不会移除 Viewer 自有输入动作。


## 生命周期与错误处理

先清理本 Kit，再销毁 Viewer。dispose 可重复调用，不销毁 Viewer；清理后创建或更新会抛 Error。Kit 只拥有自身创建/登记的对象。可保留返回的原生 Entity、HTMLElement 或 Primitive 与 Cesium API 混用，但不应把 Kit 对象转移到其他 Viewer。

参数的非法类型或非有限数值通常抛 TypeError，范围或几何限制抛 RangeError；重复 ID、失效会话或已清理实例抛 Error。异步原生错误保持原始原因，详见本页的方法说明。


## 相关模块

[API 总览](../API说明.md) · [安装与使用](../安装与使用.md) · [CoordinateKit](./CoordinateKit.md)
