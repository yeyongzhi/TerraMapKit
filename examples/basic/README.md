# 基础地图示例

在仓库根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm example:dev
```

访问 `http://127.0.0.1:5173`。首次启动先构建库，Vite 通过包根入口读取 `dist`；修改库源码后需重新构建库。端口占用时服务明确报错。

`pnpm example:build` 构建库和示例，`pnpm example:preview` 预览示例构建结果。静态部署使用 `examples/basic/dist`。当前配置仅用于网站根路径；部署到子路径时同时调整 Vite `base` 和 `CESIUM_BASE_URL`，不能直接沿用 `/cesium/`。

## 资源与调用

- `vite.config.mjs` 从使用方安装的 Cesium 复制 Workers、ThirdParty、Assets、Widgets 到示例 `public/cesium`，构建时进入示例产物；这些目录不进入 TerraMapKit 的 npm 包。
- Vite 定义 `CESIUM_BASE_URL` 为 `/cesium/`；`main.js` 导入 Widgets CSS，页面通过 flex 布局保证地图容器有尺寸。
- 使用本地生成的网格影像与椭球地形，不需要在线底图、Cesium ion Token 或远程地图服务；天空盒纹理由本地 Assets 提供。
- 初次通过 ID 调用 `createMap`，重建时通过 HTMLElement 调用 `MapKit.createMap`，交替验证两种入口。状态栏检查原生 Viewer、UI 选项透传和图层数。
- 销毁按钮先清理两个 Kit，再调用原生 `viewer.destroy()`；重建前与页面离开时也执行同样清理。初始化或渲染错误显示在状态栏。

## 交互验收

特效按钮分别创建波纹圈、扩散圈和波形线；切换效果时移除上一组 Entity。支持更新颜色/周期/参数、暂停恢复及清除。示例将 shouldAnimate 设为 true；Kit 不修改时钟。清除后仅留下原生标记和已单独添加的其他对象，地图销毁前会 dispose EffectKit。

1. 添加异步网格图层，图层总数由 1 变 2；切换显隐并拖动透明度滑条；移除后总数回到 1，原生底图保留。
2. 添加掩膜，Entity 总数由 1 变 2；中心孔洞保持原色，外侧矩形内遮暗，矩形以外不改变。
3. 更新掩膜，孔洞东移 1 度，颜色变为蓝色；移除后 Entity 总数回到 1，原生标记保留。
4. 切换合成地形后检查倾斜视角；合成山地由本地高度图生成，不模拟真实地形服务的所有特性。
5. 重复添加/更新/移除，再销毁地图，容器残留应为 0；重建后回到 1 个底图、1 个标记。

MaskKit 当前为实验性地表能力，不遮罩天空、3D Tiles 或独立 Entity；输入和覆盖范围限制见 `docs/API说明.md`。

浏览器必须支持 WebGL；不同 GPU、浏览器与移动端兼容性仍需分别验证。完整在线地图配置请由使用方选择 Provider 并提供自己的 Token。

Kit 模块 的操作在可折叠面板中：选择工具后开始交互，左键加点、右键完成，按钮支持撤销和取消。演示几何、弹窗、轨迹及离线模型均无需 Token。离线模型由 scripts/generate-demo-tileset.mjs 生成，静态素材位于 public/tiles。完整方法和限制见 docs/API说明.md。
