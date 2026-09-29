# TerraMapKit

面向 CesiumJS 的模块化 TypeScript 地图工具包。当前仓库处于**项目骨架与设计阶段**，尚未提供可用的地图 API，也尚未发布到 npm。

## 设计方向

- `createMap` / `MapKit.createMap` 返回原生 `Cesium.Viewer`。
- `LayerKit`、`MaskKit` 等模块接收原生 `Viewer`，不修改其属性。
- `CoordinateKit` 提供不依赖 `Viewer` 的经纬度与 `Cartesian3` 转换。
- CesiumJS 由使用者安装；应用自行配置 Cesium 静态资源和 Widgets 样式。

## 本地开发

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm docs:dev
```

`pnpm docs:build` 构建 VitePress 文档。当前 `package.json` 设为 `private: true`，避免骨架包被误发布。

## 文档

- [项目说明书](./docs/项目说明书.md)：功能范围、阶段计划和验收标准。
- [开发说明书](./docs/开发说明书.md)：架构、API 约定、实现路径与发布流程。
- [API 说明](./docs/API说明.md)：拟定的公开 API，均标有实现状态。

GitHub 仓库和 npm 包名在绑定账号、核对名称后最终确定。当前使用的候选 npm 包名为 `terra-map-kit`。
