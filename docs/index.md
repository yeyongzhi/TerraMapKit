---
layout: home

hero:
  name: TerraMapKit
  text: CesiumJS 地图工具包
  tagline: 面向底层基础能力，模块化封装地图、图层、标记、特效与绘制编辑，保留原生 Cesium 对象和清晰的资源所有权。
  actions:
    - theme: brand
      text: 打开示例中心
      link: /示例中心
    - theme: alt
      text: 查看 Kit API
      link: /API说明
    - theme: alt
      text: 安装与使用
      link: /安装与使用

features:
  - title: 底图、热力图与点聚合
    details: 原生影像管理，高德 URL 模板与天地图 WMTS 快捷方法；固定范围热力图、点聚合、数据更新和独立清理。
    link: /kits/LayerKit
  - title: 原生对象与模块入口
    details: 13 个模块按职责组织，支持根入口与子路径导入；保留 Viewer、Entity 和 ImageryLayer 等原生对象。
    link: /API说明
  - title: 十种特效与播放控制
    details: 波纹、波形、扫描、发光线、流动线、弧线、围墙等特效，支持局部更新、暂停、跳转、倍速和一次播放。
    link: /kits/EffectKit
  - title: 绘制、编辑与 GeoJSON
    details: 点线面绘制，顶点增删与拖动、整体移动、撤销重做及确认取消；批量导入导出保留 ID、属性和高度。
    link: /kits/DrawKit
  - title: 标记、交互与位置编辑
    details: Entity 点图片文字组合、位置编辑与 JSON；Primitive 点和图标集合、批量操作、距离显示与拾取。
    link: /kits/MarkerKit
  - title: 独立的基础能力示例
    details: 独立 Kit 场景、几何编辑、标记交互与性能观察，提供参数操作和可复制代码。
    link: /示例中心
  - title: 生命周期与能力边界
    details: Kit 只清理自身资源，先 dispose 再销毁 Viewer；各 API 页面说明参数校验、错误与使用限制。
    link: /安装与使用
---

## 从这里开始

1. 阅读[安装与使用](./安装与使用.md)，配置 Cesium 静态资源和 Widgets 样式。
2. 打开[示例中心](./示例中心.md)，体验特效控制、几何编辑和地图标记交互。
3. 在 [Kit API 总览](./API说明.md)选择模块，查看签名、参数、示例与生命周期。

## 当前状态与边界

工具库与示例已实现并通过本地自动验证，当前版本为私有开发版 `0.0.0`，尚未发布到 npm。使用本仓库或本地 tgz 接入，安装方式见[使用指南](./安装与使用.md)。

MaskKit 保持实验性；DrawKit 多边形面向局部单外环区域，不支持孔洞或跨日期变更线。性能采样基于软件 WebGL，不代表真实设备性能。详细限制见各 Kit 页面及[特效性能采样](./特效性能.md)。

GitHub Pages 工作流已配置，线上部署结果尚未核验；发布条件见[发布准备](./发布准备.md)。

各 Kit 模块的完整方法、示例和能力边界见 [Kit API](./API说明.md)。
