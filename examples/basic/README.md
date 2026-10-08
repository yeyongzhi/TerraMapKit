# 基础能力示例中心

运行 `pnpm example:dev`，访问 http://127.0.0.1:5173。`pnpm example:build` 构建静态示例，`pnpm example:preview` 预览。

13 个模块 各自展示参数、通用操作和可复制代码，另有特效性能观察。默认网格、标记与模型均可离线使用。绘制页面支持点线面、顶点编辑、撤销重做和 GeoJSON 文本导入导出。切换场景清理资源。

- center.js / center.css：示例导航、表单、生命周期与代码展示。
- modules.js：基础 Kit 演示。
- basemap-example.js：网格、高德、天地图及 XYZ/WMTS/WMS 切换、透明度和注记；默认离线，在线配置由调用方填写。
- marker-performance.js：三种数量的逐个/批量创建、更新、移除基准，输出 JSON、通知与资源残留。
- render-validation：requestRenderMode 下的刷新与暂停静止验证夹具。
- draw-example.js：通用绘制与编辑。
- effect-examples.js：十种效果及性能观察。
- validation、draw-validation、marker-validation：浏览器测试夹具，验证原生交互与清理。

示例避免行业模型、状态机和告警流程。添加新示例时围绕一个可复用 API，保持数据与交互通用。

- primitive-performance.js：点/图标集合与 1000/10000/50000 点三种实现的性能对比。
- primitive-validation.html/js：真实渲染、纹理准备、拾取、距离显隐和所有权验证夹具。
