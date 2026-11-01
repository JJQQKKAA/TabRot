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

## 1.1.1 — bookmark favicon protection (2026-10-30)

- Reproduced the original bug in an isolated Chrome for Testing 156 profile: the shared bookmark favicon's sampled pixel changed from the original blue `[51, 102, 170, 255]` to TabRot green `[94, 174, 137, 255]`. Restoring the page icon changed the shared cache back to the original blue.
- Added a read-only bookmark website index before any marker delivery. Protects same-host pages across paths, schemes and ports, the `www` alias, and subdomains. Bookmark titles/tree are not persisted. The production extension never creates, updates, or removes bookmarks.
- Existing/new bookmarks, duplicate removal, bookmark URL changes, and imports update protection. Failed reads suspend page favicon modification while preserving popup reminders. Protected tabs retain their original IDs, opened times, unread/read state, and popup colors.
- `npm test`: 29 tests pass. `npm run check`: all production JavaScript syntax checks pass.
- `tools/browser-bookmarks.mjs` passes in Chrome 156: existing/new bookmarks, same-site tabs, actual shared favicon cache pixel checks, last-bookmark removal, URL changes, read/unread actions, unchanged timers, and actual browser restart protection. The extra `favicon` read permission is used only in a disposable test fixture; it is absent from the production manifest.

## 1.1.2 — legacy bookmark icon recovery (2026-10-31)

- Found a migration gap: a newly injected content controller has an empty original-icon map. Suppressing a bookmark's next marker did not restore data favicons left in its existing document by a previous controller/version.
- The background now supplies the original and current favicon with protected-tab render messages. The new versioned controller records DOM ownership and original hrefs, adopts/restores its predecessor's markers, and prevents a stopped predecessor from removing a new controller's marker.
- For pre-metadata versions, recover only data icons matching TabRot's exact 32px opaque-dot/white-ring geometry. Restore the saved original; if the saved original is also marked, use the site's conventional favicon. Preserve unrelated site-provided data icons and any icon the site has changed itself.
- Regression fixture with the old content script **fails**: the marked DOM remains after upgrade. The same fixture with the new script **passes**: shared bookmark cache pixels return from green to original blue without page navigation; document state, unread status and opened time are retained. An already-marked saved original and legitimate unrelated data favicon are also covered.
- 32 unit/lifecycle tests and syntax checks pass. Chrome 156 full smoke test, five reloads with no runtime errors, and bookmark event/restart tests pass.
- Closed pages have no content context to repair. Their old icon may remain cached until the exact bookmark is revisited; the extension does not claim to clear closed-page favicon caches or open bookmarks automatically.
- Packaging excludes archived versioned content scripts; only the manifest's active content entry is distributed.

## 1.2.0 — grouped title emoji presets (2026-11-01)

- Bookmarked websites use title prefixes while their favicons remain unchanged. Unbookmarked websites retain continuous favicon color interpolation.
- Six four-stage presets in Color / Nature / Expression groups. Settings supports bilingual labels, timing previews, draft preservation and saved theme persistence. Stages switch at timing points 2, 4 and 6.
- Title ownership metadata supports reinjection without duplicate prefixes. Dynamic site titles are preserved; read/snooze/ignore states and bookmark removal restore the title. Stored list titles exclude extension-owned prefixes.
- 36 unit/lifecycle/localization tests and production syntax checks pass.
- Chrome for Testing 156: full smoke test, grouped emoji settings and all four stages, dynamic title updates, read/unread cleanup, bookmark removal, actual bookmark favicon cache pixel checks, and restart protection pass using isolated profiles.
- Settings screenshot: `docs/emoji-settings.png`. Package: `dist/TabRot-v1.2.0.zip`.

## 1.3.0 — title icons for all tabs and independent custom stages (2026-11-01)

- All unread web tabs now use title emoji. Popup keeps the original continuous gradient and clean original titles; no new favicon markers are generated.
- Weather, Plants and Faces provide eight-stage presets. Removed circle/square presets. Supports 2–16 custom stages, start times in minutes/hours/days, a per-stage emoji suggestion list and pasted emoji, add/remove actions, and validation for ordered times and single graphemes.
- Interactive preview compares a stepped title icon with the independent Popup gradient. Preview spans both timelines, does not alter actual tabs and does not dirty settings. Language changes preserve stage drafts.
- Removed production bookmark access and its permission. Bookmark cache checks use test-only permissions on a disposable copied extension.
- Old fixed presets migrate while retaining Popup timing, ignore rules, reading states and timers. Open legacy favicon markers are repaired; already-closed bookmarks retain Chrome's stale cache until that exact URL is revisited.
- 32 unit/lifecycle/localization tests and production syntax checks pass. Chrome for Testing 156 full smoke, custom-stage editor (including minimum/maximum counts, invalid drafts, eight live stages, narrow viewport), actual bookmark cache pixels/restart, five extension reloads without runtime errors, legacy upgrade, poisoned-original recovery and closed-bookmark recovery pass.
- Screenshots: `docs/emoji-settings.png`, `docs/settings.png`, `docs/popup.png`, `docs/popup-zh.png`. Package: `dist/TabRot-v1.3.0.zip`.
