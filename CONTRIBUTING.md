# 开发与验证

使用 Node.js 22+、pnpm 10.4.1。执行 `pnpm install --frozen-lockfile`。

- `pnpm check`：类型、Node 测试、文档、示例构建及打包清单检查。
- `pnpm exec playwright install chromium`：首次安装测试浏览器；Linux CI 使用 `--with-deps`。
- `pnpm test:browser`：真实 Viewer/WebGL、特效控制、几何编辑、标记拖动、点击悬停、导入保存和清理验证。自动在 5174 启动示例服务器，与手动预览的 5173 分开。
- `pnpm test:docs`：重新构建 `/TerraMapKit/` 子路径文档，自动在 5175 预览，验证导航、搜索、内部链接/锚点和移动端；报告位于 playwright-report/docs。
- `pnpm package:consumer`：将实际 tgz 安装到独立目录，验证全部 ESM 导出与 TypeScript 声明。需要依赖下载或已有 pnpm 缓存。
- `pnpm example:dev`：手动观察特效及性能，打开 `#effect-performance`。

新增公开 API 需同步更新对应 Kit 文档、变更记录和示例。测试重点是可观察行为、失败回滚、对象所有权、资源回收和时间控制。涉及渲染的功能还需真实浏览器验证。

Kit 不修改共享 Viewer 时钟、原型或应用所有的对象。卸载时先 dispose Kit，再销毁 Viewer。

## 版本策略

当前保持 private 与 0.0.0。首次公开版本拟为 0.1.0，具体版本在发布时确定。
0.x 阶段：新增兼容能力及破坏性 API 调整增加次版本；修复增加补丁版本。破坏性改动在 CHANGELOG 明确列出迁移方法。
达到 1.0 后遵循语义化版本：破坏性调整增加主版本，兼容新增增加次版本，修复增加补丁版本。

发布前必须确定许可证、版权主体、npm 包名及账号，重新运行所有验证，填写包元信息，最后解除 private。开发、打包和推送都不自动执行 npm 发布。
