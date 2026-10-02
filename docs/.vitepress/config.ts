import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'TerraMapKit',
  description: 'CesiumJS 模块化 TypeScript 地图工具包',
  base: process.env.DOCS_BASE || '/',
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '项目说明书', link: '/项目说明书' },
      { text: '开发说明书', link: '/开发说明书' },
      { text: 'API', link: '/API说明' }
    ],
    sidebar: [
      { text: '开始', items: [{ text: '项目概览', link: '/' }] },
      {
        text: '设计文档',
        items: [
          { text: '项目说明书', link: '/项目说明书' },
          { text: '开发说明书', link: '/开发说明书' },
          { text: 'API 说明', link: '/API说明' },
          { text: 'Entity 特效', link: '/特效说明' },
          { text: '七个扩展 Kit', link: '/扩展Kit说明' },
          { text: '安装与使用', link: '/安装与使用' },
          { text: '发布准备', link: '/发布准备' }
        ]
      }
    ],
    search: { provider: 'local' },
    footer: { message: 'TerraMapKit · 首版开发验证 · MaskKit 实验性' }
  }
})
