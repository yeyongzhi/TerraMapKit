# TrackKit · 轨迹回放

根据带时间的地理采样驱动移动点，提供独立回放游标和路线显示。

## 模块入口

```ts
import { TrackKit } from 'terra-map-kit/track'
```

使用 `new TrackKit(viewer)` 构造；viewer 必须是存活的原生 Cesium Viewer。 根入口 `terra-map-kit` 同样导出本模块。公开类与类型：`TrackKit, TrackSample, TrackOptions, TrackHandle`。

## 功能与方法

| 方法 | 返回 / 行为 |
| --- | --- |
| `addTrack(options)` | TrackHandle：移动点及可选路线 Entity |
| `getTrack(id)` | 句柄或 undefined，剔除外部移除对象 |
| `removeTrack(idOrHandle)` | 清除轨迹和路线，返回 boolean |
| `clear()` / `dispose()` | 清理对象及 onTick |

TrackOptions：至少两个 samples:[{time:JulianDate/ISO8601字符串,position:DegreesPoint}]，时间严格递增；可选 id、loop（默认 false）、autoplay（默认 true）、speed（默认 1，0.001–1000）、color（默认黄色）、showPath（默认 true）。坐标和时间复制保存，不排序、不合并重复时间。

句柄暴露 id/entity/entities/paused/currentTime/duration，提供 play()、pause()、seek(seconds)、setSpeed(speed)、remove()。seek 为距首样本的秒数 `[0,duration]`，currentTime 返回独立游标对应的新 JulianDate。SampledPositionProperty 默认 ECEF 线性插值，远距离低高度采样可能穿过地下，应增加采样或高度；路线为静态采样点连接，不是贴地轨迹。当前为移动点，不含车辆模型朝向或镜头跟随。

从添加时 Viewer.currentTime 映射到首样本，与 Viewer 日期无关；暂停只暂停自身，恢复/变速保留游标。loop 取模从尾点跳回首点；非循环终点自动暂停，再次 play 从头开始。Viewer 时间变化影响进度；不修改 shouldAnimate/currentTime/multiplier/trackedEntity。全部暂停或清除后释放时钟监听。

```ts
import { TrackKit } from 'terra-map-kit/track'
const tracks = new TrackKit(viewer)
const track = tracks.addTrack({ loop: true, samples: [
  { time: '2026-10-02T00:00:00Z', position: { longitude: 116.39, latitude: 39.9, height: 200 } },
  { time: '2026-10-02T00:00:10Z', position: { longitude: 116.4, latitude: 39.91, height: 300 } }
] })
track.pause(); track.seek(5); track.setSpeed(2); track.play()
tracks.dispose()
```


## TrackOptions

| 参数 | 类型 / 默认值 | 说明 |
| --- | --- | --- |
| id | string，自动生成 | 本实例逻辑 ID |
| samples | readonly TrackSample[]，必填 | 至少两个严格递增的时间采样 |
| loop | boolean，false | 是否从尾点跳回首点循环 |
| autoplay | boolean，true | 创建后立即播放，仍需 Viewer 时钟推进 |
| speed | number，1 | 回放速度倍率，0.001–1000 |
| color | Cesium.Color，YELLOW | 移动点与路线颜色 |
| showPath | boolean，true | 是否添加静态路线 Entity |


## TrackSample 与回放句柄

TrackSample.time 为 JulianDate 或 ISO 8601 字符串，position 为 DegreesPoint。duration 为末样本减首样本的秒数；currentTime 每次读取返回新 JulianDate。entity 为移动点，entities 为本轨迹创建的只读 Entity 列表。pause/play 幂等，seek 越界及 speed 非法抛异常；play 在非循环终点从头重播。外部删除移动点后，查询或运行时 tick 会清理剩余路线；暂停状态需主动查询/移除。


## 生命周期与错误处理

先清理本 Kit，再销毁 Viewer。dispose 可重复调用，不销毁 Viewer；清理后创建或更新会抛 Error。Kit 只拥有自身创建/登记的对象。可保留返回的原生 Entity、HTMLElement 或 Primitive 与 Cesium API 混用，但不应把 Kit 对象转移到其他 Viewer。

参数的非法类型或非有限数值通常抛 TypeError，范围或几何限制抛 RangeError；重复 ID、失效会话或已清理实例抛 Error。异步原生错误保持原始原因，详见本页的方法说明。


## 相关模块

[API 总览](../API说明.md) · [安装与使用](../安装与使用.md) · [CoordinateKit](./CoordinateKit.md)
