---
layout: home

hero:
  name: TerraMapKit
  text: CesiumJS 地图工具包
  tagline: 用清晰的模块封装地图、图层、掩膜和坐标能力，同时保留原生 Viewer API。
  actions:
    - theme: brand
      text: 阅读项目说明书
      link: /项目说明书
    - theme: alt
      text: 查看 API 设计
      link: /API说明

features:
  - title: 原生 Viewer
    details: 地图创建方法返回 Cesium.Viewer，工具类通过构造参数接收 Viewer。
  - title: 按需使用
    details: Core、Layer、Mask、Coordinate 等模块分开组织，方便逐步扩展。
  - title: 清晰文档
    details: 项目说明书描述做什么，开发说明书描述怎么做，API 页面描述调用约定。
---

> Core / MapKit、CoordinateKit、LayerKit 和 EffectKit 已实现，MaskKit 为实验性局部贴地能力。完整示例支持图层、掩膜、地形和 Entity 特效操作；当前尚未发布 npm 包。

各 Kit 模块的完整方法、示例和能力边界见 [Kit API](./API说明.md)。
