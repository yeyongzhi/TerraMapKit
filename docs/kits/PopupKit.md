# PopupKit · 地理弹窗

将文本或 DOM 内容锚定到地理位置，随地图渲染更新屏幕位置。

## 模块入口

```ts
import { PopupKit } from 'terra-map-kit/popup'
```

使用 `new PopupKit(viewer)` 构造；viewer 必须是存活的原生 Cesium Viewer。 根入口 `terra-map-kit` 同样导出本模块。公开类与类型：`PopupKit, PopupOptions, PopupHandle`。

## 功能与方法

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


## PopupOptions

| 参数 | 类型 / 默认值 | 说明 |
| --- | --- | --- |
| id | string，自动生成 | 本实例逻辑 ID |
| position | DegreesPoint，必填 | WGS84 经纬度，高度默认 0 米 |
| content | string 或 HTMLElement，必填 | 文本或同 document 元素深克隆 |
| offset | {x:number,y:number}，{x:0,y:-12} | 屏幕偏移 CSS 像素，须有限 |


## 句柄与更新

PopupHandle 的 element 是 Kit 创建的容器，可添加类名或监听。update 使用完整 PopupOptions（无 id），省略 offset 时恢复默认偏移。setVisible(false) 持续隐藏，即使锚点重新进入视野也保持隐藏；true 重新参与投影判断。移除后更新/显隐抛 Error，旧句柄不会删除复用同 ID 的新弹窗。全部移除后解除 postRender 订阅。


## 生命周期与错误处理

先清理本 Kit，再销毁 Viewer。dispose 可重复调用，不销毁 Viewer；清理后创建或更新会抛 Error。Kit 只拥有自身创建/登记的对象。可保留返回的原生 Entity、HTMLElement 或 Primitive 与 Cesium API 混用，但不应把 Kit 对象转移到其他 Viewer。

参数的非法类型或非有限数值通常抛 TypeError，范围或几何限制抛 RangeError；重复 ID、失效会话或已清理实例抛 Error。异步原生错误保持原始原因，详见本页的方法说明。


## 相关模块

[API 总览](../API说明.md) · [安装与使用](../安装与使用.md) · [CoordinateKit](./CoordinateKit.md)
