# 验证记录

2026-10-28 完成：

- `npm test`：12 项逻辑与后台生命周期测试全部通过。
- `npm run check`：所有生产 JavaScript 文件语法检查通过。
- `tools/browser-smoke.mjs`：使用 Chrome for Testing 151 和独立临时配置真实加载 MV3 扩展，在本地网页验证自动追踪、刷新保留计时、已读/未读、暂停/恢复、动态 favicon 还原、固定标签排除、SPA 导航重置、域名忽略、图标请求失败降级、设置保存、搜索和 432×600 Popup 布局。
- 实际关闭并重新启动测试浏览器，恢复原标签，验证已保存的记录 ID、打开时间和已读状态保持不变。
- 检查 Popup 与设置页的真实截图：`popup.png`、`settings.png`。截图中的网页来自本地测试服务器。
- 验证 manifest 引用的资源均存在，发行 ZIP 可以正常解压并包含所有必需文件。

受保护页面、网站特定 CSP、持续重写 favicon 的网页，以及多个完全相同网址标签的跨重启身份匹配，仍受 Chrome 与页面行为限制，无法保证所有网站完全一致。常见失败路径会保留原图标，不修改页面正文。

## 内容脚本异常修复

修复 `content.js` 消息调用仅通过 Promise `.catch()` 处理异常，遗漏扩展上下文失效时同步抛错的问题。所有内容脚本消息均通过 `try / await / catch` 保护，失效后停止观察和后续绘制、清理扩展图标，并保留网站自己新设置的 favicon。异步绘制入口也捕获未预期的异常。

新增四项回归测试：动态 favicon 更新中的同步/异步上下文失效、初次 HELLO 同步抛错、runtime ID 消失。当前总计 16 项测试与语法检查全部通过；发行 ZIP 已重新生成。

## 1.0.1

进一步覆盖 `ICON` 请求的同步抛错、异步拒绝、等待响应期间 runtime 失效，以及原图标未发生变化时通过页面 DOM 事件清理旧标记。消息返回后再次验证 runtime，失效后的异步响应不会继续绘制。新增四项回归测试，累计 20 项测试全部通过，语法检查通过。此轮使用 Node VM 回归测试，没有重新运行上方的真实浏览器端到端测试。

## 1.1.0 — English / Chinese and compact popup

- Default interface and extension metadata are English. Popup toggle and Settings selector persist a local English / Chinese preference, synchronize between open extension pages, and preserve unsaved settings drafts.
- Replaced the promotional header and two-level cards with a 420×580 compact list. Browser assertions confirm at least 400 px of list height and seven complete visible rows. Native popover menus stay inside the popup near the bottom of the list.
- Replaced the dark raster icon with an editable transparent SVG and regenerated all PNG sizes.
- 23 unit/lifecycle/localization tests pass; JavaScript syntax checks pass.
- Chrome for Testing 156 smoke test passes, including actual favicon changes, reading states, settings persistence, language switching, unsaved draft preservation, menu geometry, and browser restart recovery.
- English and Chinese popup screenshots and the English settings screenshot are saved in this directory. Main project documentation is now English, with a separate Chinese README.
