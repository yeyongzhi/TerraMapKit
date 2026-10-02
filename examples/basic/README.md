# 分模块示例中心

运行 pnpm example:dev，访问 http://127.0.0.1:5173。13 个 Kit 分别提供独立场景、参数设置、操作按钮和可复制代码；通过 URL hash 直接定位模块，例如 /#marker、/#layer。每次切换、重建或清理都先释放当前 Kit 和事件，再销毁 Viewer。

pnpm example:build 构建库及示例，pnpm example:preview 预览静态结果。修改库源码后需要重新构建库；示例源码开发支持 Vite 热更新。原综合验收页面保留在 /legacy.html。

## 目录

- center.js：模块导航、参数状态、代码展示与场景生命周期。
- modules.js：各 Kit 示例注册、参数、演示逻辑及代码片段。
- center.css：桌面三栏与移动端布局。
- main.js / legacy.html：原综合验证演示。
- public/pin.svg、public/tiles：本地图片标记与离线模型。
- vite.config.mjs：复制 Cesium Workers、ThirdParty、Assets、Widgets，配置基础路径。

## 文档站点接入

pnpm docs:build 会先按 DOCS_BASE 打包示例，复制至 docs/public/examples，再由 VitePress 一起构建。文档站内 /examples/index.html 可独立打开各 Kit；静态资源、SVG、模型都使用同一基础路径。pnpm docs:dev 也先打包示例，修改示例后需重新运行。

单独部署到子路径时设置 EXAMPLES_BASE（例如 /demo/），构建脚本会同时调整 Vite base 和 CESIUM_BASE_URL。根路径开发默认为 /。综合演示与示例中心均包含在构建中。

## 验证重点

MarkerKit 的点、图片、文字与组合类型，参数应用、样式更新、点击、隐藏与移除；LayerKit 的影像、热力和聚合；DrawKit/MeasureKit 的交互与预设数据；镜头、弹窗、离线模型及轨迹操作。切换后资源只属于当前示例，清理后容器残留应为 0。需要 WebGL，性能与兼容性仍需在目标浏览器和 GPU 上验证。
