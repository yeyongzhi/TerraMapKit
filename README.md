# TerraMapKit

面向 CesiumJS 的模块化 TypeScript 地图工具包。Core / MapKit、CoordinateKit、LayerKit、EffectKit 及 PickKit、DrawKit、CameraKit、PopupKit、MeasureKit、TilesetKit、TrackKit 已实现；MaskKit 提供实验性局部贴地掩膜。当前包保持私有，尚未发布到 npm。

## 基础地图示例

运行 `pnpm example:dev`，访问 `http://127.0.0.1:5173`。示例支持地图销毁/重建、图层显隐/透明度/移除、掩膜创建/更新/移除，以及倾斜视角和离线合成地形。静态资源、样式与容器配置见 [示例说明](./examples/basic/README.md)。

## 已实现：坐标转换

已新增 **EffectKit**：基于 Entity 的波纹圈、扩散圈与正弦波形线，支持独立更新、暂停、恢复和移除。详见 [特效说明](./docs/特效说明.md)，浏览器示例提供完整操作按钮。

```ts
import { CoordinateKit } from 'terra-map-kit/coordinate'

const position = CoordinateKit.fromDegrees(116.39, 39.9, 100)
const coordinate = CoordinateKit.toDegrees(position)
const positions = CoordinateKit.fromDegreesArray([
  { longitude: 116.39, latitude: 39.9 },
  { longitude: 121.47, latitude: 31.23, height: 50 }
])
```

当前示例用于构建后的本地包或仓库自引用，不能通过 npm 安装本项目。经纬度为 WGS84 角度，高度为米；完整范围、错误和浮点限制见 [API 说明](./docs/API说明.md#coordinatekit)。

## 设计方向

七个扩展 Kit 的方法表、示例和限制见 [扩展 Kit 说明](./docs/扩展Kit说明.md)。浏览器示例支持拾取、点线面绘制、测量、镜头保存与环绕、地理弹窗、离线 3D Tiles 及轨迹回放。

- `createMap` / `MapKit.createMap` 返回原生 `Cesium.Viewer`。
- `LayerKit`、`MaskKit` 等模块接收原生 `Viewer`，不修改其属性。
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

`pnpm package:check` 检查 npm 包的实际文件清单与所有导出目标，并生成 `artifacts/release/terra-map-kit-0.0.0.tgz` 供本地安装验证。该命令不会发布。首次发布仍需确认 npm 账号、正式包名、版本和许可证，见 [发布准备](./docs/发布准备.md)。
