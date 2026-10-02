# MapKit · 地图创建

基于容器创建原生 Cesium Viewer，保留构造选项及原生地图 API。

## 模块入口

```ts
import { createMap, MapKit } from 'terra-map-kit/core'
```

静态入口，无需构造实例。 根入口 `terra-map-kit` 同样导出本模块。公开类与类型：`MapKit, createMap`。

## 功能与方法

| API | 目标输入 | 目标输出 | 状态 |
| --- | --- | --- | --- |
| `createMap(container, options?)` | DOM 元素或 ID；`Cesium.Viewer.ConstructorOptions` | 原生 `Cesium.Viewer` | 已实现 |
| `MapKit.createMap(container, options?)` | 同上 | 原生 `Cesium.Viewer` | 已实现 |

`createMap` 是 `MapKit.createMap` 的快捷导出。不会对 `Viewer` 注入 `.layers` 等额外属性；销毁仍由调用方执行 `viewer.destroy()`。

### 可运行的最小用法

```ts
import { createMap, MapKit } from 'terra-map-kit/core'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// 调用前由应用配置 CESIUM_BASE_URL 并托管 Cesium 静态资源。
// 页面须有一个带尺寸的 <div id="map"></div>。
const viewer = createMap('map', {
  baseLayerPicker: false,
  baseLayer: false,
  geocoder: false,
  animation: false,
  timeline: false
})
// 原生对象：可直接访问 scene、camera、imageryLayers。
// 页面或组件卸载时：
viewer.destroy()
```

两个入口为同一函数（`MapKit.createMap === createMap`），根入口与 `/core` 均可导入。选项原样交给 Cesium，不合并工具包默认值、不注入 Token、不自动配置资源、不提供额外销毁包装。容器或选项错误沿用 Cesium 原生异常；调用需要浏览器 DOM 和 WebGL，模块导入不创建 Viewer，在 Node.js 中导入已配套测试。

省略选项时保留 Cesium 默认行为，可能请求在线影像或地形；需要离线使用时应明确配置 Provider 或禁用默认底图。完整资源复制、容器布局、离线网格、销毁与重建示例见仓库 `examples/basic/README.md`，根目录运行 `pnpm example:dev` 后访问 `http://127.0.0.1:5173`。当前包未发布，示例使用构建后的仓库自引用。


## 容器与构造参数

| 参数 | 类型 / 默认值 | 说明 |
| --- | --- | --- |
| container | string 或 HTMLElement，必填 | 已存在的容器 ID 或 DOM 元素，须具备实际尺寸 |
| options | Viewer.ConstructorOptions，可选 | 原样传入原生 Viewer，不合并工具库默认选项 |

MapKit 仅提供静态创建入口，无实例状态和 dispose 方法。返回的 Viewer 由应用拥有。构造错误沿用 Cesium 原生错误。参见 [安装与使用](../安装与使用.md) 配置静态资源和样式。


## 相关模块

[API 总览](../API说明.md) · [安装与使用](../安装与使用.md) · [CoordinateKit](./CoordinateKit.md)
