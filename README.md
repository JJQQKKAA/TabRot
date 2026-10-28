# TabRot

[简体中文](README.zh-CN.md)

A quiet reading reminder for Chrome. Tabs grow a small colored favicon marker as they age, helping you return to the pages you meant to read.

No accounts, notifications, analytics, AI, or cloud services. Built with plain JavaScript, HTML, and CSS using Manifest V3.

![TabRot popup](docs/popup.png)

## Install

1. Download the source or unzip `dist/TabRot-v1.1.0.zip`.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked**, then select the directory containing `manifest.json`.
4. Pin TabRot in the Chrome toolbar.

Requires Chrome 120 or later. No build step or runtime dependencies.

## Use

- Open a normal web page. TabRot starts tracking it automatically.
- A small green-to-red marker shows how long the tab has been open. Refreshing or switching tabs does not reset its timer.
- Open the popup to browse your tabs, oldest first. Search by title or website, then click a row to jump to the page.
- Mark a tab as read to restore its original favicon. Reading state is always manual.
- Use **More actions** to snooze a reminder for an hour, until tomorrow at 9 AM, or for three days. Snoozing preserves the original timer.
- Ignore an individual tab or an entire website, including its subdomains. Pinned tabs are ignored by default.
- Adjust color timing and ignore rules in **Settings**.

The interface defaults to English. Click **中文 / EN** in the popup, or choose a language in Settings. Your choice is saved locally and shared between open extension pages. Switching languages preserves unsaved settings.

The compact 420 × 580 popup fits at least seven complete rows. Menus open above or below their anchor so actions remain accessible near the bottom of the list.

## Timing and recovery

The default color stops are 30 minutes, 2 hours, 6 hours, 12 hours, 1 day, 3 days, 7 days, and 30 days. Colors interpolate continuously on a logarithmic time scale and update about once a minute. Updates can be delayed while Chrome or the device sleeps.

Navigating to a different path or query starts a new timer; fragment-only navigation does not. Tabs already open at installation start counting when first discovered.

After a browser restart, saved records are matched to restored tabs by URL and position. Multiple tabs with identical URLs are matched on a best-effort basis. Unmatched records are cleaned after a two-minute startup recovery window. Closing an individual tab removes its record.

Protected pages, PDF viewers, restrictive website policies, or unavailable original icons may prevent favicon changes. TabRot leaves the original icon intact when it cannot safely add a marker.

## Privacy and permissions

Reading state, timers, snoozes, ignore rules, and language preferences stay in Chrome's local extension storage. Session storage holds the current browser session's tab bindings. No browsing data is sent to analytics or cloud services.

| Permission | Purpose |
| --- | --- |
| `tabs` | Read open-tab titles, URLs, and positions, and switch tabs. |
| `storage` | Save local settings and reading state. |
| `alarms` | Refresh reminders at a low frequency. |
| `scripting` | Apply favicon markers to existing pages. |
| HTTP / HTTPS host access | Update page favicons and fetch the website's existing icon, without credentials or a referrer. |

## Development

```sh
npm test
npm run check
```

The unit and lifecycle tests require Node.js 22 or later and no additional packages.

Optional browser tests use an isolated profile and a local fixture server:

```sh
npm install --no-save playwright
npx playwright install chromium
node tools/browser-smoke.mjs
node tools/browser-reload.mjs
```

The smoke test covers the actual extension, reading states, favicon restoration, navigation, ignore rules, settings, bilingual persistence, unsaved drafts, compact layout, menu placement, and browser restart recovery. Screenshots are written to `docs/`. The reload test checks pending icon requests while the extension reloads.

Use `CHROME_EXECUTABLE` for an existing Chrome for Testing executable, `PLAYWRIGHT_MODULE_PATH` for an existing Playwright package, or `PLAYWRIGHT_BROWSERS_PATH` for a custom browser cache.

To regenerate icons from the editable SVG:

```sh
npm install --no-save sharp
node tools/icons.mjs
```

To package the extension:

```sh
python3 tools/package.py
```

After changing code, reload TabRot in `chrome://extensions`. Refresh existing pages if they still have a previous content script running.

## Source

| File | Purpose |
| --- | --- |
| `src/core.js` | Color interpolation, statuses, time labels, and tab matching. |
| `src/background.js` | Event handling, persistence, messaging, and scheduled updates. |
| `src/content-v1.0.2.js` | Favicon rendering and restoration, with callback-based messaging. |
| `src/i18n.js` | English / Chinese messages and language preference. |
| `src/popup.*` | Compact reading list. |
| `src/options.*` | Settings. |
| `icons/icon.svg` | Editable, transparent-background icon source. |
