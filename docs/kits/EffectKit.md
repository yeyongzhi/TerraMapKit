# EffectKit · 地图特效

十种原生 Entity 特效，支持局部参数更新、显隐、独立播放游标和批量管理。不修改 Viewer 原型、共享时钟或全局材质缓存，不注册自定义 Shader。

## 模块入口

```ts
import { EffectKit } from 'terra-map-kit/effect'
```

根入口同样导出 EffectKit 与全部选项/句柄类型。`new EffectKit(viewer)` 接收存活的原生 Viewer。应用配置 Cesium 静态资源和 Widgets 样式。

## 创建方法

| 方法 | 选项类型 | 效果 |
| --- | --- | --- |
| addRipple | RippleEffectOptions | 多个错相扩大的空心波纹圈 |
| addDiffusionCircle | CircleEffectOptions | 扩大并渐隐的填充圆盘 |
| addWave | WaveEffectOptions | ENU 切平面中的移动正弦线 |
| addPulsePoint | PulsePointOptions | 像素尺寸和透明度呼吸的点 |
| addGlowLine | LineEffectOptions | 使用原生 PolylineGlowMaterialProperty 的发光路线 |
| addRadarScan | RadarScanOptions | ENU 切平面中旋转的填充扇形 |
| addFlowLine | FlowLineOptions | 沿路线累计长度移动的亮段，保留途经折点 |
| addFlightArc | FlightArcOptions | 两点间抬升的静态发光弧线，支持局部跨度 |
| addWall | WallEffectOptions | 自动闭合的区域围墙，透明度呼吸 |
| addPolygonPulse | PolygonPulseOptions | 多边形填充透明度呼吸 |

每个方法返回 `EffectHandle<对应选项类型>`。发光线和飞行弧线本身不移动；移动亮段使用 addFlowLine。雷达扫描是几何扇形，不向地形或模型表面投射扫描纹理。

## 示例

```ts
import { Color } from 'cesium'
import { EffectKit } from 'terra-map-kit/effect'

const effects = new EffectKit(viewer)
viewer.clock.shouldAnimate = true // 应用自行决定是否推进模拟时钟
const ripple = effects.addRipple({
  id: 'alarm', position: { longitude: 116.39, latitude: 39.9, height: 100 },
  radius: 1000, duration: 3, count: 3, color: Color.RED.withAlpha(0.8)
})
ripple.patch({ radius: 1500, color: Color.ORANGE })
ripple.setVisible(false) // 隐藏仍继续计时
ripple.pause()          // 冻结播放游标
ripple.seek(1.5)
ripple.setVisible(true)
ripple.setSpeed(2)
ripple.resume()

const once = effects.addDiffusionCircle({
  position: { longitude: 116.4, latitude: 39.9, height: 100 },
  loop: false, duration: 2,
  onComplete: handle => console.log('完成', handle.id)
})
once.restart() // 从头开始播放

effects.pauseAll()
effects.resumeAll()
effects.getEffects() // 只读快照；查询时剔除外部删除的效果
effects.size
effects.clear() // 清空后可以继续创建
effects.dispose() // 页面卸载；之后不能继续使用
```

## 公共参数

`EffectBaseOptions` 包含公共参数，`EffectOptions` 额外要求 position。

| 参数 | 默认值 | 范围/语义 |
| --- | --- | --- |
| id | 自动生成 | 本实例内唯一非空字符串 |
| color | CYAN，alpha 0.8 | Cesium Color；四分量有限且在 [0,1]，复制使用 |
| duration | 3 | 一个周期的模拟秒数，0.01–86400 |
| show | true | 初始显隐；隐藏不暂停时间 |
| loop | true | false 播放一次，停留在末态并自动暂停 |
| speed | 1 | 独立倍速，0.001–1000；不修改 viewer.clock.multiplier |
| onComplete | 无 | 非循环效果播放完成时调用，参数为公共句柄，可移除或 dispose |
| position | 点/圆/波形/扫描必填 | WGS84 经纬度角度；height 米，省略为 10 |

回调不会在创建、patch 或 seek 的同步调用中执行；运行中的非循环效果在下一次 onTick 达到末态后触发一次。隐藏不妨碍回调。暂停的效果需 resume 后完成。

## 特效参数

| 类型 | 参数 | 默认值 | 范围/单位 |
| --- | --- | --- | --- |
| 圆/扫描 | radius | 1000 | 1–100000 米 |
| 圆 | minRadius | 1 | 1–radius 米；雷达固定使用 radius |
| 波纹 | count | 3 | 1–8 整数 |
| 波形 | length / amplitude / wavelength | 3000 / 300 / 1000 | 1–100000 / 0–10000 / 1–100000 米 |
| 波形 | segments / width | 64 / 3 | 8–256 整数 / 1–10 像素 |
| 呼吸点 | pixelSize / minPixelSize | 20 / 8 | 1–256 / 1–pixelSize 像素 |
| 扫描 | heading / angle | 0 / 60 | heading -360–360°，从北顺时针；扇形角 1–180° |
| 扫描 | segments | 32 | 8–256 整数 |
| 路线 | positions | 必填 | 2–512 个经纬高点，邻点距离至少 1 毫米 |
| 发光线/流动线/弧线 | width / glowPower | 3 / 0.25 | 1–32 像素 / 0–1 |
| 流动线 | trailLength | 0.2 | 占全路线长度的比例，0.001–1 |
| 弧线 | from / to | 必填 | 两端 WGS84 经纬高；直线距离 1 米–100 公里 |
| 弧线 | arcHeight / segments | 1000 / 64 | 抬升 0–100000 米 / 8–256 整数 |
| 区域/围墙 | positions | 必填 | 3–512 个简单局部多边形顶点；可重复首点闭合 |
| 围墙 | wallHeight | 500 | 每个顶点高度之上 1–100000 米 |

弧线由两端的弦线采样确定经纬度，插值端点高度再增加 `4 * arcHeight * t * (1-t)`。它是展示曲线，不作为飞行导航、真实航迹或全球大圆曲线。

流动亮段从起点进入，在终点退出，再按 loop 决定是否重播；采用 Cartesian3 线段累计长度插值，不贴地。它表达流向，若与 TrackKit 联动，应由应用同步暂停、seek 和 speed；不保证亮段端点与按时间采样的轨迹点重合。

## 句柄与管理

| 句柄属性/方法 | 行为 |
| --- | --- |
| id / kind | 唯一 ID、特效类型，只读 |
| entities | 当前原生 Entity 只读快照；几何重建后需重新获取 |
| paused / visible / completed | 暂停、显隐、一次播放完成状态 |
| currentTime / duration / speed | 周期内模拟秒数、周期、独立倍速 |
| update(options) | 完整替换选项，省略项采用默认值；重建 Entity、从头计时、保留暂停状态 |
| patch(partial) | 顶层浅合并参数，保留游标秒数和暂停状态；position 等嵌套对象需完整提供 |
| setVisible(show) | 同步实体显隐，继续计时 |
| pause / resume | 冻结/继续；重复调用安全；已完成效果 resume 不重播 |
| restart() | 清除完成状态，从 0 开始并恢复播放 |
| seek(seconds) | 0–duration 范围跳转，保留暂停状态；清除完成状态 |
| setSpeed(speed) | 先保存游标再改变倍速，时间连续 |
| remove() | 移除本句柄资源，重复调用返回 false |

patch 不改变 ID。颜色、宽度、半径、振幅、方向等支持保留 Entity；位置、采样数、波纹数量、路线顶点、弧线高度和围墙高度等需要重建。参数校验或新增实体失败时回滚配置、游标与自有新增资源。

修改 duration 保留的是秒数，视觉相位可能改变；非循环时间限制到新周期范围。已完成的效果改为循环或加长周期后仍暂停，可 resume。seek 到 duration：循环效果相位回到 0；非循环运行效果在下一次 tick 完成。完成后 seek 到较早时间再 resume，可再次触发回调。

| 管理器方法 | 返回值/行为 |
| --- | --- |
| getEffect(id) | 公共句柄或 undefined，剔除失效资源 |
| getEffects() | 公共句柄只读快照，包含暂停和隐藏的效果 |
| size | 当前有效特效数量 |
| removeEffect(idOrHandle) | boolean，只移除本实例对象，拒绝其他实例句柄 |
| pauseAll / resumeAll | 批量控制，已完成效果不重播 |
| clear() | 清空本实例效果和监听，实例仍可使用 |
| dispose() | 永久清理，重复调用安全，不销毁 Viewer |

查询得到的是公共句柄；需类型特定的 patch 时保留创建方法返回的带类型句柄。

## 时间、清理与错误

- 动画只依赖 viewer.clock.currentTime，支持共享时钟停止、倍速和倒放；非循环进度下限为 0。播放完成后自动冻结，倒放共享时钟不会自动恢复已完成效果。
- 每个 Kit 最多一个 onTick 监听；所有效果暂停、完成、移除或 dispose 后解除监听。运行时 requestRender，暂停时 patch/seek/显隐也主动请求渲染。
- 外部删除某个特效的部分 Entity 后，下一次 tick 或查询会移除其余自有 Entity。全部暂停时主动查询或 clear。
- Kit 不移除应用或其他实例对象。先清理 Kit，再销毁 Viewer。
- 非法类型或非有限数值抛 TypeError，越界/几何限制抛 RangeError，重复 ID、失效句柄、已清理 Kit 或已销毁 Viewer 抛 Error。

## 渲染与性能边界

按指定椭球高度渲染，不自动贴地，不绕过地形/模型遮挡。雷达和波形使用局部 ENU 切平面；区域要求简单多边形，所有顶点距首点不超过 100 公里，不支持孔洞。高度贴近地表时应考虑地形和深度冲突。

波纹轮廓宽度受平台能力限制；发光路线使用原生材质，不是全场景 Bloom。弧线和路线不会自动跟随车辆或标记位置。

动态几何仍需 Cesium 每帧更新；缓存矩阵与坐标缓冲降低 JS 分配，但不代表几何更新零成本。波纹 Entity 数为 count，其余每个特效一个 Entity。参数上限不代表高并发承诺。

示例中心的 **特效性能观察** 提供 10/100/500 个呼吸点、波纹和波形场景，测量创建耗时、预热后 5 秒渲染帧率、实体和监听数量。显示的监听数为 Viewer 总数，包含原生及应用监听；本 Kit 清理后恢复基线，不要求总监听数为 0。不同设备、窗口、GPU 和浏览器的结果不直接比较；隐藏标签页不适合采样。测试采用 Chromium 软件 WebGL，性能数字不能代表真实显卡。[本次采样记录](../特效性能.md)。

## 验证与示例

`pnpm test` 验证几何、相位、局部更新、时间控制、一次完成、失败回滚与所有权。`pnpm test:browser` 验证真实 Viewer 中十种效果、场景切换、组合演示、requestRenderMode 和资源清理，并保存性能采样附件。`pnpm package:consumer` 验证打包后的独立导入和类型声明。

运行 `pnpm example:dev`，访问 `#effect` 和 `#effect-performance`。独立演示每种效果及通用播放、更新和清理方法。

[API 总览](../API说明.md) · [示例中心](../示例中心.md) · [安装与使用](../安装与使用.md)
