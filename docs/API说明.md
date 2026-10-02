# API 总览

TerraMapKit 按功能划分模块。通过根入口或模块子路径导入，各 Kit 保留原生 Cesium 对象，详细参数与示例分别列于对应页面。当前工具库为私有开发包，尚未发布到 npm。

## 模块目录

| 模块 | 职责 | 导入路径 |
| --- | --- | --- |
| [MapKit](./kits/MapKit.md) | 地图创建 | `terra-map-kit/core` |
| [CoordinateKit](./kits/CoordinateKit.md) | 坐标转换 | `terra-map-kit/coordinate` |
| [LayerKit](./kits/LayerKit.md) | 影像图层 | `terra-map-kit/layer` |
| [MaskKit](./kits/MaskKit.md) | 区域掩膜（实验性） | `terra-map-kit/mask` |
| [EffectKit](./kits/EffectKit.md) | Entity 特效 | `terra-map-kit/effect` |
| [PickKit](./kits/PickKit.md) | 屏幕拾取 | `terra-map-kit/pick` |
| [DrawKit](./kits/DrawKit.md) | 交互绘制 | `terra-map-kit/draw` |
| [CameraKit](./kits/CameraKit.md) | 镜头控制 | `terra-map-kit/camera` |
| [PopupKit](./kits/PopupKit.md) | 地理弹窗 | `terra-map-kit/popup` |
| [MeasureKit](./kits/MeasureKit.md) | 空间测量 | `terra-map-kit/measure` |
| [TilesetKit](./kits/TilesetKit.md) | 三维模型 | `terra-map-kit/tileset` |
| [TrackKit](./kits/TrackKit.md) | 轨迹回放 | `terra-map-kit/track` |

## 使用约定

- MapKit 提供 createMap / MapKit.createMap，返回原生 Viewer，应用负责销毁。
- CoordinateKit 与 MeasureKit 的静态计算方法无需 Viewer；其他管理对象的 Kit 接收原生 Viewer。
- 经纬度使用 WGS84 角度，高度和距离使用米，面积使用平方米；CameraKit 的角度使用弧度。
- Kit 只清理本实例对象，卸载时先 dispose，再 viewer.destroy；不向 Viewer 注入工具属性。
- 动画跟随模拟时间，应用决定 shouldAnimate、multiplier 和 currentTime；不同交互工具切换时先取消前一会话。
- 应用负责 Cesium 静态资源、Widgets 样式及容器布局，详见 [安装与使用](./安装与使用.md)。

## 生命周期示例

```ts
import { createMap, DrawKit, PickKit, CameraKit } from 'terra-map-kit'
const viewer = createMap('map', { baseLayer: false, baseLayerPicker: false })
const draw = new DrawKit(viewer)
const pick = new PickKit(viewer)
const camera = new CameraKit(viewer)
// 页面卸载或组件销毁时执行
draw.dispose()
pick.dispose()
camera.dispose()
viewer.destroy()
```
