# 七个扩展 Kit

PickKit、DrawKit、CameraKit、PopupKit、MeasureKit、TilesetKit、TrackKit 已实现。根入口与 `/pick`、`/draw`、`/camera`、`/popup`、`/measure`、`/tileset`、`/track` 子路径提供相同类和对应类型。当前包为私有开发包，未发布到 npm。

各实例接收原生 Viewer，只清理自己创建的对象。卸载时先 `kit.dispose()`，最后由应用 `viewer.destroy()`。dispose 可重复调用，清理后不可重新使用实例。经纬度为 WGS84 **度**，椭球高度和距离为**米**，镜头角度为**弧度**。动画跟随模拟时钟，不修改全局时钟参数；应用需设置 `viewer.clock.shouldAnimate = true`。

## PickKit

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

## DrawKit

| 方法 | 返回 / 行为 |
| --- | --- |
| `start(options)` | DrawSession；新会话取消旧会话 |
| `cancel()` | 取消当前会话并移除预览 |
| `remove(idOrResult)` | 移除完成结果，返回实际移除状态 |
| `toGeoJSON(result)` | Point / LineString / Polygon Feature |
| `clear()` / `dispose()` | 清理会话、结果 / 释放交互 handler |

DrawOptions：type 为 point/polyline/polygon，可选 id、color、width、interactive、positionMode、maxPoints、onFinish、onCancel、onError。颜色默认青色，width 默认 3，范围 1–10。默认 terrain 拾取，左键添加点、移动预览、右键完成（不足点数时取消）。interactive:false 可在程序中添加点而不创建 handler。

DrawSession 暴露 entity、addPoint(Cartesian3)、undo():boolean、finish():DrawResult、cancel()。点只允许 1 点且自动完成；线至少 2 点；面至少 3 点。线/面默认最多 512 点，上限自动尝试完成；若几何无效，需撤销或取消。结果含只读 id/type/entity/positions，坐标为冻结快照。onFinish 抛错不会撤回已完成对象，仍可 clear/remove。

多边形使用第一点 ENU 切平面校验，拒绝自交、退化、重复点；任一点距第一点空间距离不得超过 100 km，无孔洞和编辑手柄。面使用 perPositionHeight:true；线/面保留输入高度，不进行贴地采样。GeoJSON 坐标为经纬度、高度，面自动补闭合点，高度是椭球高度。

```ts
import { DrawKit, CoordinateKit } from 'terra-map-kit'
const draw = new DrawKit(viewer)
const session = draw.start({ type: 'polyline', interactive: false })
session.addPoint(CoordinateKit.fromDegrees(116.39, 39.9, 100))
session.addPoint(CoordinateKit.fromDegrees(116.4, 39.91, 100))
const result = session.finish()
console.log(draw.toGeoJSON(result))
draw.remove(result)
```

## CameraKit

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

## PopupKit

| 方法 | 返回 / 行为 |
| --- | --- |
| `addPopup(options)` | PopupHandle，含 id、原生 HTMLElement |
| `getPopup(id)` | 本实例句柄或 undefined |
| `removePopup(idOrHandle)` | 移除 DOM，返回 boolean |
| `clear()` / `dispose()` | 清理弹窗，解绑 postRender |

PopupOptions：position、content: string/HTMLElement，可选 id、offset `{x,y}`（CSS 像素，默认 `{x:0,y:-12}`）。句柄提供 update(options) 完整替换参数、setVisible(boolean)、remove()。字符串为纯文本；HTMLElement 必须属于容器 document，会深克隆，原节点不移走，原事件监听不复制，可通过 handle.element 自行挂交互。

容器应设 position:relative（示例已配置）。随 postRender 更新，移出屏幕、投影无效或在 3D 椭球背面隐藏；未实现地形/建筑深度遮挡。构造需要浏览器 DOM，模块在 Node 导入不创建 DOM。

```ts
import { PopupKit } from 'terra-map-kit/popup'
const popups = new PopupKit(viewer)
const popup = popups.addPopup({ position: { longitude: 116.39, latitude: 39.9, height: 500 }, content: '北京\n地理锚点弹窗' })
popup.setVisible(false)
popups.dispose()
```

## MeasureKit

| 静态方法 | 语义 |
| --- | --- |
| `distance(Cartesian3[])` | 相邻采集点 ECEF 直线长度之和，米 |
| `surfaceDistance(DegreesPoint[])` | WGS84 椭球测地线长度之和，忽略高度，米 |
| `area(Cartesian3[])` | 第一顶点 ENU 切平面投影面积，平方米 |
| `heightDifference(from,to)` | to 椭球高度 − from 椭球高度，带符号米 |

静态方法不需 Viewer。area 同 DrawKit 局部限制，最多 512 点、100 km 范围，无孔洞，不是球面或地形表面积。surfaceDistance 不做地形积分，近对跖点失败需拆分线段。可视线使用 Cesium 默认弧线，distance 数值按点间 ECEF 直线计算。

实例 start({type:'distance'|'area'|'height',interactive?,onFinish?,onError?}) 返回 DrawSession；cancel()、remove(id)、clear()、dispose() 管理结果。独立 DrawKit 生成几何和结果标签，高差两点自动完成，其余右键完成。回调 MeasureResult 含 id/type/value/unit/drawing/label，unit 为 m 或 m²。默认地形拾取，高差也可程序传入不同高度点。切换交互工具时应用应取消旧工具，避免不同实例同时响应。

## TilesetKit

| 方法 | 返回 / 行为 |
| --- | --- |
| `addTileset({url,id?,options?,show?,style?})` | `Promise<Cesium3DTileset>` |
| `getTileset(id)` | 原生对象或 undefined |
| `setVisible(id,show)` / `setStyle(id,style)` | 显隐 / 原生样式或样式参数 |
| `flyTo(id,options?)` | Viewer.flyTo 的 `Promise<boolean>` |
| `removeTileset(idOrTileset)` / `dispose()` | 移除并销毁本实例模型 |

url 和 options 采用 Cesium3DTileset.fromUrl 参数类型。异步 ID 预占，失败释放 ID 并保留异常。等待期间清理 Kit/Viewer，迟到模型销毁并拒绝 Promise，不取消底层请求。查询剔除外部移除/销毁对象；本 Kit 仍负责销毁已 detach 的自有模型，不能转移到其他 Viewer。不会移除外部 Primitive。示例含离线 3D Tiles 1.1 + glTF 立方体，无需 Token。

```ts
import { TilesetKit } from 'terra-map-kit/tileset'
const tiles = new TilesetKit(viewer)
const native = await tiles.addTileset({ id: 'city', url: '/tiles/tileset.json', options: { maximumScreenSpaceError: 16 } })
tiles.setStyle('city', { color: "color('orange')" })
await tiles.flyTo('city')
tiles.removeTileset(native)
```

## TrackKit

| 方法 | 返回 / 行为 |
| --- | --- |
| `addTrack(options)` | TrackHandle：移动点及可选路线 Entity |
| `getTrack(id)` | 句柄或 undefined，剔除外部移除对象 |
| `removeTrack(idOrHandle)` | 清除轨迹和路线，返回 boolean |
| `clear()` / `dispose()` | 清理对象及 onTick |

TrackOptions：至少两个 samples:[{time:JulianDate/ISO8601字符串,position:DegreesPoint}]，时间严格递增；可选 id、loop（默认 false）、autoplay（默认 true）、speed（默认 1，0.001–1000）、color（默认黄色）、showPath（默认 true）。坐标和时间复制保存，不排序、不合并重复时间。

句柄暴露 id/entity/entities/paused/currentTime/duration，提供 play()、pause()、seek(seconds)、setSpeed(speed)、remove()。seek 为距首样本的秒数 `[0,duration]`，currentTime 返回独立游标对应的新 JulianDate。SampledPositionProperty 默认 ECEF 线性插值，远距离低高度采样可能穿过地下，应增加采样或高度；路线为静态采样点连接，不是贴地轨迹。当前为移动点，不含车辆模型朝向或镜头跟随。

从添加时 Viewer.currentTime 映射到首样本，与 Viewer 日期无关；暂停只暂停自身，恢复/变速保留游标。loop 取模从尾点跳回首点；非循环终点自动暂停，再次 play 从头开始。Viewer 时间变化影响进度；不修改 shouldAnimate/currentTime/multiplier/trackedEntity。全部暂停或清除后释放时钟监听。

```ts
import { TrackKit } from 'terra-map-kit/track'
const tracks = new TrackKit(viewer)
const track = tracks.addTrack({ loop: true, samples: [
  { time: '2026-10-02T00:00:00Z', position: { longitude: 116.39, latitude: 39.9, height: 200 } },
  { time: '2026-10-02T00:00:10Z', position: { longitude: 116.4, latitude: 39.91, height: 300 } }
] })
track.pause(); track.seek(5); track.setSpeed(2); track.play()
tracks.dispose()
```
