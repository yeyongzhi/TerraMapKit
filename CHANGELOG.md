# 变更记录

## Unreleased

- 新增 PrimitiveMarkerKit 点集合与图标集合，支持批量操作、距离显示、拾取与所有权清理。
- MarkerKit 共用距离显隐、缩放、透明度和深度阈值配置；JSON 保存并恢复距离配置。
- 增加 1000/10000/50000 点的 Entity 与 Primitive 性能对比及真实 WebGL 拾取、纹理、清理验证。

- 新增 GeometryKit 三维包围盒、最近点、折线长度与插值、局部多边形校验，以及 CoordinateKit ENU 转换、米制偏移和局部顶点中心。
- 共享多边形校验固定 WGS84，统一拒绝空位和日期变更线跨越；绘制、测量、特效沿用共享逻辑，更新坐标示例和边界文档。

- MarkerKit 新增 addMarkers、patchMarkers、removeMarkers，合并集合通知、拾取同步和渲染请求；JSON 导入与清空复用批量路径。
- 修正特效暂停后的动态属性标识，按需渲染时暂停可回到静止；seek、patch 和恢复仍主动刷新。
- 新增按需渲染浏览器验证及三种数量的标记性能基准，记录同步耗时、通知、请求和残留。

- LayerKit 增加 setBaseLayer/getBaseLayer/removeBaseLayer，主图与注记一起切换；首张瓦片失败保留旧图，支持超时、连续切换和清理。
- createImageryProvider 统一 XYZ、WMTS、WMS、高德和天地图配置，保留原生 Provider 接入。
- 图层示例加入底图来源、URL/key、透明度和天地图注记操作，默认使用离线网格。

- 明确基础 Cesium 工具包定位，整理首页、项目说明书、API 和独立示例。
- LayerKit 新增高德 URL 模板和天地图 WMTS Provider 构造及图层快捷添加。
- MarkerKit 提供显式 patch、位置更新与编辑、通用 JSON、点击和悬停；保持原生 Entity 与所有权边界。
- DrawKit 提供顶点编辑、整体移动、撤销重做、确认取消与原子 GeoJSON 导入，保留 ID、属性和高度。
- EffectKit 提供十种特效、局部更新、显隐、播放控制、一次播放和批量清理；缓存常用坐标缓冲。
- 删除设备监控、围栏告警和业务组合示例，以及旧综合页面。未发布 API 中移除 MarkerStatus、setStatus、onSelect、selected 与 containsPointInFence；调用方使用显式样式更新和通用点击/悬停事件。
- 增加原生 Chromium/WebGL 交互测试、构建后文档导航/搜索/链接/移动端测试和独立消费验证。
- 构建清理自有 dist，打包校验源码对应关系，防止删除模块后残留产物。

## 0.0.0 — 私有开发基线

模块化 Cesium 工具、中文文档、离线示例、Node 测试与打包校验。尚未公开发布。
