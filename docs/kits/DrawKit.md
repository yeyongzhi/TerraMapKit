# DrawKit · 交互绘制

管理点、折线和多边形的绘制会话，支持撤销、结果快照和 GeoJSON 导出。

## 模块入口

```ts
import { DrawKit } from 'terra-map-kit/draw'
```

使用 `new DrawKit(viewer)` 构造；viewer 必须是存活的原生 Cesium Viewer。 根入口 `terra-map-kit` 同样导出本模块。公开类与类型：`DrawKit, DrawType, DrawOptions, DrawSession, DrawResult, DrawGeoJSON`。

## 功能与方法

| 方法 | 返回 / 行为 |
| --- | --- |
| `start(options)` | DrawSession；新会话取消旧会话 |
| `cancel()` | 取消当前会话并移除预览 |
| `remove(idOrResult)` | 移除完成结果，返回实际移除状态 |
| `toGeoJSON(result)` | Point / LineString / Polygon Feature |
| `clear()` / `dispose()` | 清理会话、结果 / 释放交互 handler |

DrawOptions：type 为 point/polyline/polygon，可选 id、color、width、interactive、positionMode、maxPoints、onFinish、onCancel、onError。颜色默认青色，width 默认 3，范围 1–10。默认 terrain 拾取，左键添加点、移动预览、右键完成（不足点数时取消）。interactive:false 可在程序中添加点而不创建 handler。

DrawSession 暴露 entity、addPoint(Cartesian3)、undo():boolean、finish():DrawResult、cancel()。点只允许 1 点且自动完成；线至少 2 点；面至少 3 点。线/面默认最多 512 点，上限自动尝试完成；若几何无效，需撤销或取消。结果含只读 id/type/entity/positions，坐标为冻结快照。onFinish 抛错不会撤回已完成对象，仍可 clear/remove。

多边形使用第一点 ENU 切平面校验，拒绝自交、退化、重复点；任一点距第一点空间距离不得超过 100 km，无孔洞和编辑手柄。面使用 perPositionHeight:true；线/面保留输入高度，不进行贴地采样。GeoJSON 坐标为经纬度、高度，面自动补闭合点，高度是椭球高度。

```ts
import { DrawKit, CoordinateKit } from 'terra-map-kit'
const draw = new DrawKit(viewer)
const session = draw.start({ type: 'polyline', interactive: false })
session.addPoint(CoordinateKit.fromDegrees(116.39, 39.9, 100))
session.addPoint(CoordinateKit.fromDegrees(116.4, 39.91, 100))
const result = session.finish()
console.log(draw.toGeoJSON(result))
draw.remove(result)
```


## DrawOptions

| 参数 | 类型 / 默认值 | 说明 |
| --- | --- | --- |
| type | DrawType，必填 | point / polyline / polygon |
| id | string，自动生成 | 已完成结果的逻辑 ID，需唯一 |
| color | Cesium.Color，CYAN | 四个颜色分量须在 0–1 |
| width | number，3 | 线宽，1–10 CSS 像素 |
| interactive | boolean，true | false 时仅使用会话的程序接口 |
| positionMode | PickPositionMode，terrain | 交互坐标的拾取途径 |
| maxPoints | number，点为 1，线/面为 512 | 整数，达到上限尝试自动完成 |
| onFinish | (result: DrawResult) => void | 完成后收到 Entity 和冻结坐标快照 |
| onCancel | () => void，可选 | 取消会话时通知 |
| onError | (error: unknown) => void，可选 | 交互执行异常回调，省略时 console.error |


## DrawSession 与 DrawResult

| 成员 | 说明 |
| --- | --- |
| session.entity | 当前原生 Entity，包括未完成的预览对象 |
| session.addPoint(position) | 复制 Cartesian3 添加顶点，相距小于 1 mm 的重复点拒绝 |
| session.undo() | 移除最后一点；返回是否有点被撤销 |
| session.finish() | 校验、登记并返回结果；不足点数抛 RangeError |
| session.cancel() | 结束会话并移除预览，可重复调用 |
| result.positions | 与输入隔离的只读坐标快照 |

会话完成/取消后继续 addPoint、undo 或 finish 抛 Error。toGeoJSON 返回 Feature，不直接保存文件。


## 生命周期与错误处理

先清理本 Kit，再销毁 Viewer。dispose 可重复调用，不销毁 Viewer；清理后创建或更新会抛 Error。Kit 只拥有自身创建/登记的对象。可保留返回的原生 Entity、HTMLElement 或 Primitive 与 Cesium API 混用，但不应把 Kit 对象转移到其他 Viewer。

参数的非法类型或非有限数值通常抛 TypeError，范围或几何限制抛 RangeError；重复 ID、失效会话或已清理实例抛 Error。异步原生错误保持原始原因，详见本页的方法说明。


## 相关模块

[API 总览](../API说明.md) · [安装与使用](../安装与使用.md) · [CoordinateKit](./CoordinateKit.md)
