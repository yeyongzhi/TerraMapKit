# TilesetKit · 三维模型

加载和管理原生 Cesium3DTileset，统一模型查询、样式、显隐和销毁。

## 模块入口

```ts
import { TilesetKit } from 'terra-map-kit/tileset'
```

使用 `new TilesetKit(viewer)` 构造；viewer 必须是存活的原生 Cesium Viewer。 根入口 `terra-map-kit` 同样导出本模块。公开类与类型：`TilesetKit, TilesetOptions`。

## 功能与方法

| 方法 | 返回 / 行为 |
| --- | --- |
| `addTileset({url,id?,options?,show?,style?})` | `Promise<Cesium3DTileset>` |
| `getTileset(id)` | 原生对象或 undefined |
| `setVisible(id,show)` / `setStyle(id,style)` | 显隐 / 原生样式或样式参数 |
| `flyTo(id,options?)` | Viewer.flyTo 的 `Promise<boolean>` |
| `removeTileset(idOrTileset)` / `dispose()` | 移除并销毁本实例模型 |

url 和 options 采用 Cesium3DTileset.fromUrl 参数类型。异步 ID 预占，失败释放 ID 并保留异常。等待期间清理 Kit/Viewer，迟到模型销毁并拒绝 Promise，不取消底层请求。查询剔除外部移除/销毁对象；本 Kit 仍负责销毁已 detach 的自有模型，不能转移到其他 Viewer。不会移除外部 Primitive。示例含离线 3D Tiles 1.1 + glTF 立方体，无需 Token。

```ts
import { TilesetKit } from 'terra-map-kit/tileset'
const tiles = new TilesetKit(viewer)
const native = await tiles.addTileset({ id: 'city', url: '/tiles/tileset.json', options: { maximumScreenSpaceError: 16 } })
tiles.setStyle('city', { color: "color('orange')" })
await tiles.flyTo('city')
tiles.removeTileset(native)
```


## TilesetOptions

| 参数 | 类型 / 默认值 | 说明 |
| --- | --- | --- |
| id | string，自动生成 | 加载中和已登记 ID 均需唯一 |
| url | Cesium3DTileset.fromUrl 的首参数，必填 | tileset JSON 地址或原生资源对象 |
| options | fromUrl 的第二参数，可选 | 原生模型构造选项，浅复制后传入 |
| show | boolean，true | 初始显隐状态 |
| style | Cesium3DTileStyle 或原生样式参数，可选 | 加载成功后设置的样式 |


## 加载与移除语义

addTileset 的 Promise 在 tileset 元数据加载并加入 PrimitiveCollection 后完成，不代表全部瓦片内容已下载。内容按 Cesium 的可见性与细节级别流式加载，可从返回对象监听 tileLoad/tileFailed。Kit 不包装这些内容事件。样式颜色与材质的混合遵循原生 colorBlendMode。removeTileset 返回是否实际从当前集合移除；已 detach 的自有对象仍销毁，但返回 false。未知 ID 的样式、显隐和飞行操作抛 Error。


## 生命周期与错误处理

先清理本 Kit，再销毁 Viewer。dispose 可重复调用，不销毁 Viewer；清理后创建或更新会抛 Error。Kit 只拥有自身创建/登记的对象。可保留返回的原生 Entity、HTMLElement 或 Primitive 与 Cesium API 混用，但不应把 Kit 对象转移到其他 Viewer。

参数的非法类型或非有限数值通常抛 TypeError，范围或几何限制抛 RangeError；重复 ID、失效会话或已清理实例抛 Error。异步原生错误保持原始原因，详见本页的方法说明。


## 相关模块

[API 总览](../API说明.md) · [安装与使用](../安装与使用.md) · [CoordinateKit](./CoordinateKit.md)
