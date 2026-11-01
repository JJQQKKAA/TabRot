# TabRot · 待读时光

[English](README.md)

一个安静的 Chrome 阅读提醒插件。标签标题用图标表示积压阶段，Popup 用连续渐变显示打开时长；网站与收藏夹的原图标保持不变。

原生 JavaScript / HTML / CSS，Manifest V3，无构建步骤，无服务器、账号、分析服务或云同步。

## 安装

1. 打开 `chrome://extensions`，启用「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择包含 `manifest.json` 的项目目录。
3. 也可解压 `dist/TabRot-v1.3.0.zip`，加载解压后的目录。
4. 在 Chrome 工具栏固定 TabRot，点击即可打开列表。

需要 Chrome 120 或以上版本。安装或升级后会接管已打开的普通网页；浏览器保护的页面及部分内置阅读器无法添加标题图标。

## 使用

- 普通 HTTP/HTTPS 网页自动追踪，刷新和切换标签不会重置计时。
- 无论是否已收藏，所有待读网页统一使用标题图标；不再向 favicon 叠加颜色点。
- Popup 保留原始标题、网站图标和连续渐变颜色，支持按状态筛选、搜索、打开时长排序，点击条目切换标签。
- 手动标记已读会移除标题图标；停留、滚动和切换不会自动标记已读。
- 「•••」支持 1 小时后、明天本地时间 09:00、3 天后恢复提醒，保留原始计时，不发送通知。
- 支持忽略单个标签、域名及其子域名。默认忽略固定标签；即使关闭此规则，固定标签因隐藏标题也无法展示标题图标。
- 默认英文，Popup 和设置中均可切换中英文；语言切换保留尚未保存的设置。

Popup 尺寸 420×580，至少可完整显示七条；底部条目的菜单也能完整显示。

## 自定义标题档位

预设提供**天气、植物、表情**，不包含彩色圆点和方块。

- 默认八档：立即、30 分钟、2 小时、6 小时、12 小时、1 天、3 天、7 天。
- 支持 2–16 档，可添加或删除，逐档设置分钟／小时／天，以及选择或粘贴一个 emoji。
- 首档固定从零开始，之后的时间必须递增。达到最后一档后保持图标，直到标记已读、暂停或忽略。
- 应用预设会替换当前草稿，点击「保存修改」才会更新实际标签。
- 拖动时间轴可对比 Tab 图标分档变化与 Popup 的连续渐变，预览不会改动实际网页。

![自定义标题图标](docs/emoji-settings.png)

## Popup 渐变与数据恢复

Popup 渐变独立设置，保留原八个颜色节点：30 分钟、2 小时、6 小时、12 小时、1 天、3 天、7 天、30 天。节点间按对数时间连续插值，约每分钟更新一次；休眠或浏览器调度可能推迟更新。

路径或查询参数变化视为新页面，重新计时；仅 `#fragment` 变化不会。安装前已打开的页面从首次发现开始计时。浏览器重启后按网址和位置匹配恢复；相同网址的多个标签只能尽力匹配。启动后保留两分钟恢复窗口，再清理无对应标签的记录。单独关闭标签会删除记录。

升级保留计时、阅读状态、忽略规则和 Popup 颜色设置。旧版固定图标组迁移至八档，已移除的颜色组改用天气。升级时尽可能自动还原已打开页面中的旧 favicon 标记，不刷新页面。已关闭网页的收藏仍可能保留 Chrome 的旧缓存，需打开那条收藏本身一次更新。

## 权限与隐私

不读取或修改收藏夹，已移除 `bookmarks` 权限。阅读记录、设置和语言仅存本地，会话存储保存当前 Tab ID 映射。不上传浏览记录，不分析正文。

- `tabs`：读取已打开网页的标题、网址、位置，并切换标签。
- `storage`：保存本地设置和阅读状态。
- `alarms`：低频更新提醒。
- `scripting` 与 HTTP/HTTPS 访问：在已有网页添加标题图标，以及升级时还原旧图标标记。旧图标请求不携带登录凭证或 referrer。

## 开发和验证

```sh
npm test
npm run check
python3 tools/package.py
```

单元测试使用 Node.js 22 或以上版本，无额外依赖。可选真实浏览器测试：

```sh
npm install --no-save playwright
npx playwright install chromium
node tools/browser-smoke.mjs
node tools/browser-emoji.mjs
node tools/browser-reload.mjs
node tools/browser-bookmarks.mjs
node tools/browser-bookmark-upgrade.mjs
POISON_ORIGINAL=1 node tools/browser-bookmark-upgrade.mjs
CLOSE_LEGACY_PAGE=1 node tools/browser-bookmark-upgrade.mjs
```

测试使用独立临时配置和本地网页，不接触日常浏览资料。收藏夹与升级测试只对临时副本授予收藏夹／favicon 权限，以设置测试数据、检查缓存像素；正式扩展无这些权限。截图输出至 `docs/`。

指定现有运行时可设置 `PLAYWRIGHT_MODULE_PATH`、`CHROME_EXECUTABLE` 或 `PLAYWRIGHT_BROWSERS_PATH`。

## 目录

- `src/core.js`：渐变、图标档位、校验、状态和恢复匹配。
- `src/background.js`：后台事件、持久化、消息和低频更新。
- `src/content-v1.3.0.js`：标题图标、动态更新、清理与旧版 favicon 还原。
- `src/popup.*`：待读列表。
- `src/options.*`：设置与时间轴预览。
- `src/i18n.js`：中英文。
- `icons/icon.svg`：透明图标源文件。

更新代码后，在 `chrome://extensions` 重新加载 TabRot。
