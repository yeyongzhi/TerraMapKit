import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'TerraMapKit',
  description: 'CesiumJS 模块化 TypeScript 地图工具包',
  base: process.env.DOCS_BASE || '/',
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '示例中心', link: '/示例中心' },
      { text: '项目说明书', link: '/项目说明书' },
      { text: '开发说明书', link: '/开发说明书' },
      { text: 'Kit API', link: '/API说明' }
    ],
    sidebar: [
      { text: '入门指南', items: [
        { text: '项目概览', link: '/' },
        { text: '安装与使用', link: '/安装与使用' },
        { text: 'API 总览', link: '/API说明' },
        { text: '示例中心', link: '/示例中心' }
      ] },
      {
        text: 'Kit API',
        items: [
          { text: 'MapKit · 地图创建', link: '/kits/MapKit' },
          { text: 'CoordinateKit · 坐标转换', link: '/kits/CoordinateKit' },
          { text: 'LayerKit · 图层管理', link: '/kits/LayerKit' },
          { text: 'MarkerKit · 地图标记', link: '/kits/MarkerKit' },
          { text: 'MaskKit · 区域掩膜', link: '/kits/MaskKit' },
          { text: 'EffectKit · Entity 特效', link: '/kits/EffectKit' },
          { text: 'PickKit · 屏幕拾取', link: '/kits/PickKit' },
          { text: 'DrawKit · 绘制与编辑', link: '/kits/DrawKit' },
          { text: 'CameraKit · 镜头控制', link: '/kits/CameraKit' },
          { text: 'PopupKit · 地理弹窗', link: '/kits/PopupKit' },
          { text: 'MeasureKit · 空间测量', link: '/kits/MeasureKit' },
          { text: 'TilesetKit · 三维模型', link: '/kits/TilesetKit' },
          { text: 'TrackKit · 轨迹回放', link: '/kits/TrackKit' }
        ]
      },
      {
        text: '项目文档',
        items: [
          { text: '项目说明书', link: '/项目说明书' },
          { text: '开发说明书', link: '/开发说明书' },
          { text: '特效性能采样', link: '/特效性能' },
          { text: '标记性能基准', link: '/标记性能' },
          { text: '点位集合性能', link: '/点位集合性能' },
          { text: '发布准备', link: '/发布准备' }
        ]
      }
    ],
    sidebarMenuLabel: '文档目录',
    outline: { label: '本页目录' },
    search: { provider: 'local', options: { translations: {
      button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
      modal: { displayDetails: '显示详细列表', resetButtonTitle: '清除搜索', backButtonTitle: '关闭搜索', noResultsText: '没有找到结果',
        footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' } }
    } } },
    footer: { message: 'TerraMapKit · 私有开发版 0.0.0 · MaskKit 实验性' }
  }
})
