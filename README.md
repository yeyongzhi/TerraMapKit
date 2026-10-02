# TerraMapKit

面向 CesiumJS 的模块化 TypeScript 地图工具包。提供地图创建、坐标转换、图层与业务标记、特效、拾取、绘制、镜头、弹窗、测量、模型及轨迹回放；MaskKit 提供实验性局部贴地掩膜。当前包保持私有，尚未发布到 npm。

## 分模块示例中心

运行 `pnpm example:dev`，访问 `http://127.0.0.1:5173`。每个 Kit 提供独立场景、参数调整、操作按钮和代码复制。MarkerKit 支持点、图片、文字、组合标记与点击事件；原综合演示保留在 `/legacy.html`。文档构建自动包含示例中心，详见 [示例中心](./docs/示例中心.md) 与 [MarkerKit API](./docs/kits/MarkerKit.md)。

## 已实现：坐标转换

已新增 **EffectKit**：基于 Entity 的波纹圈、扩散圈与正弦波形线，支持独立更新、暂停、恢复和移除。详见 [EffectKit 文档](./docs/kits/EffectKit.md)，浏览器示例提供完整操作按钮。

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
pnpm docs:dev
```

`pnpm test` 先构建工具库，再用 Node.js 内置测试运行器验证各模块；`pnpm check` 执行类型检查、测试、文档和示例构建，以及真实 npm 包清单校验。`pnpm docs:build` 构建 VitePress 文档。当前 `package.json` 设为 `private: true`，避免发布条件未确认时提前发布。

## 文档

- [项目说明书](./docs/项目说明书.md)：功能范围、阶段计划和验收标准。
- [开发说明书](./docs/开发说明书.md)：架构、API 约定、实现路径与发布流程。
- [API 说明](./docs/API说明.md)：拟定的公开 API，均标有实现状态。

`pnpm package:check` 检查 npm 包的实际文件清单与所有导出目标，并生成 `artifacts/release/terra-map-kit-0.0.0.tgz` 供本地安装验证。该命令不会发布。包验证与公开发布约定见 [安装与使用](./docs/安装与使用.md#包验证与发布约定)。
