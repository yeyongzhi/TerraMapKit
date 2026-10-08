# TerraMapKit

面向 CesiumJS 的模块化 TypeScript 地图工具包。定位于基础地图能力与通用方法封装，提供地图创建、坐标转换、图层与地图标记、特效、拾取、绘制、镜头、弹窗、测量、模型及轨迹回放；MaskKit 提供实验性局部贴地掩膜。当前包保持私有，尚未发布到 npm。

## 分模块示例中心

运行 `pnpm example:dev`，访问 `http://127.0.0.1:5173`。每个 Kit 提供独立场景、参数调整、操作按钮和代码复制。MarkerKit 支持点、图片、文字、组合标记与点击事件。文档构建自动包含示例中心，详见 [示例中心](./docs/示例中心.md) 与 [MarkerKit API](./docs/kits/MarkerKit.md)。

## 功能与使用

**EffectKit** 提供十种 Entity 特效：波纹、扩散、波形、呼吸点、发光线、几何雷达、流动亮段、局部飞行弧线、围墙和区域呼吸。支持局部更新、显隐、倍速、跳转、一次播放与批量管理。详见 [EffectKit 文档](./docs/kits/EffectKit.md)。示例中心提供独立 API 演示和 10/100/500 个特效性能观察。

```ts
import { CoordinateKit } from 'terra-map-kit/coordinate'

const position = CoordinateKit.fromDegrees(116.39, 39.9, 100)
const coordinate = CoordinateKit.toDegrees(position)
const positions = CoordinateKit.fromDegreesArray([
  { longitude: 116.39, latitude: 39.9 },
  { longitude: 121.47, latitude: 31.23, height: 50 }
])
```

当前示例用于构建后的本地包或仓库自引用，不能通过 npm 安装本项目。经纬度为 WGS84 角度，高度为米；完整范围、错误和浮点限制见 [CoordinateKit 文档](./docs/kits/CoordinateKit.md)。

## 设计方向

Kit 模块 的方法表、示例和限制见 [Kit API](./docs/API说明.md)。浏览器示例支持拾取、点线面绘制、测量、镜头保存与环绕、地理弹窗、离线 3D Tiles 及轨迹回放。

DrawKit 支持顶点增删与拖动、整体平移、撤销重做、确认/取消及 GeoJSON 批量导入导出。示例中心提供通用几何绘制、编辑和 GeoJSON 文本导入导出，详见 [DrawKit API](./docs/kits/DrawKit.md)。

MarkerKit 支持位置拖动与确认/取消、样式局部更新、点击与悬停事件，以及通用 JSON 导入导出，详见 [MarkerKit API](./docs/kits/MarkerKit.md)。

MarkerKit 的 addMarkers / patchMarkers / removeMarkers 支持批次校验、通知及渲染请求合并；示例中心提供逐个与批量性能对比。按需渲染验证覆盖标记、绘制和异步影像，特效暂停后可恢复静止，见[标记性能基准](./docs/标记性能.md)。

- `createMap` / `MapKit.createMap` 返回原生 `Cesium.Viewer`。
- `LayerKit`、`MaskKit` 等模块接收原生 `Viewer`，不修改其属性。
- `LayerKit` 统一支持影像、Canvas 热力图与原生点聚合，提供数据更新、显隐和资源清理，详见 [LayerKit API](./docs/kits/LayerKit.md)。
- `CoordinateKit` 提供不依赖 `Viewer` 的经纬度与 `Cartesian3` 转换。
- CesiumJS 由使用者安装；应用自行配置 Cesium 静态资源和 Widgets 样式。

## 本地开发

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
pnpm test:docs
pnpm package:consumer
pnpm docs:dev
```

`pnpm test` 先构建工具库，再用 Node.js 内置测试运行器验证各模块；`pnpm check` 执行类型检查、测试、文档和示例构建，以及真实 npm 包清单校验。`pnpm docs:build` 构建 VitePress 文档。当前 `package.json` 设为 `private: true`，避免发布条件未确认时提前发布。

## 文档

- [项目说明书](./docs/项目说明书.md)：当前功能、能力边界、后续建议和验收标准。
- [开发说明书](./docs/开发说明书.md)：架构、API 约定、实现路径与发布流程。
- [API 说明](./docs/API说明.md)：已实现的公开 API、参数约定与模块入口。
- [开发与验证](./CONTRIBUTING.md)、[变更记录](./CHANGELOG.md)：浏览器测试、独立消费验证和版本策略。

`pnpm package:check` 检查 npm 包的实际文件清单与所有导出目标，并生成 `artifacts/release/terra-map-kit-0.0.0.tgz` 供本地安装验证。该命令不会发布。包验证与公开发布约定见 [安装与使用](./docs/安装与使用.md#包验证与发布约定)。

LayerKit 提供高德、天地图及 XYZ/WMTS/WMS 统一来源工厂；setBaseLayer 验证首张瓦片后切换底图与注记，失败保留旧图，并处理连续切换、超时与清理。另有影像管理、热力图和点聚合。服务地址或 key 由调用方配置，见 [LayerKit API](./docs/kits/LayerKit.md)。

通用坐标与几何：CoordinateKit 提供 ENU 转换、米制偏移与局部顶点中心；GeometryKit 提供包围盒、线段最近点、折线长度与距离插值、共享局部多边形校验。[API 与边界说明](docs/kits/CoordinateKit.md)。

大量简单点位与图标可使用 marker 入口的 PrimitiveMarkerKit，封装 PointPrimitiveCollection / BillboardCollection，支持批量操作、拾取、显隐及销毁。Entity 标记和 Primitive 共用距离显示控制，见 [MarkerKit API](docs/kits/MarkerKit.md) 与 [点位集合性能](docs/点位集合性能.md)。
