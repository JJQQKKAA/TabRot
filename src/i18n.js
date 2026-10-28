export const messages = {
  en: {
    appTitle: 'TabRot', popupLabel: 'Reading list', settings: 'Settings', switchLanguage: '切换到中文',
    unread: 'Unread', snoozed: 'Later', read: 'Read', ignored: 'Ignored', all: 'All',
    search: 'Search tabs…', loading: 'Loading tabs…', oldestFirst: 'Oldest first', localOnly: 'Local only',
    tabCount: '{count} tabs', tabCountOne: '1 tab', openTab: 'Open: {title}', openedAt: 'Opened {date}',
    markRead: 'Mark as read', markUnread: 'Mark as unread', more: 'More actions', resume: 'Resume',
    resumeTitle: 'Resume reminders now', snooze: 'Snooze', hour: 'In 1 hour', tomorrow: 'Tomorrow, 9 AM', threeDays: 'In 3 days',
    ignoreTab: 'Ignore tab', ignoreSite: 'Ignore website', unignore: 'Unignore tab', manageRules: 'Manage ignore rules',
    ignoredTab: 'Ignored tab', ignoredPinned: 'Pinned tab', ignoredSite: 'Ignored website', until: 'Until {date}',
    emptySearch: 'No matching tabs', emptyUnread: 'All caught up', emptyOther: 'No tabs here',
    emptySearchHint: 'Try a different title or website.', emptyHint: 'New web pages appear here automatically.',
    readToast: 'Marked as read', unreadToast: 'Marked as unread', snoozeToast: 'Reminder snoozed',
    resumeToast: 'Reminder resumed', ignoreToast: 'Tab ignored', unignoreToast: 'Tab ignore removed', ignoreDomainToast: 'Website ignored',
    settingsTitle: 'TabRot settings', settingsIntro: 'Quiet reminders, at your pace.', language: 'Language',
    timing: 'Color timing', timingHint: 'Eight increasing time points, with a smooth gradient between them.',
    minutes: 'Minutes', timeNode: 'Time point {index}, in minutes', timeHelp: '60 min = 1 hour · 1,440 min = 1 day',
    defaults: 'Restore default timing', exclusions: 'Ignore rules', exclusionsHint: 'Keep everyday tabs free of reminders.',
    ignorePinned: 'Ignore pinned tabs', ignorePinnedHint: 'Useful for inboxes, dashboards, and other permanent tabs.',
    domains: 'Ignored websites', domainsHint: 'One domain per line. Includes subdomains. Remove a domain to stop ignoring it.',
    save: 'Save changes', unchanged: 'Changes are saved locally.', unsaved: 'Unsaved changes', saved: 'Changes saved',
    resetTitle: 'Reset data', resetHint: 'Clear reading states, snoozes, and rules. Open tabs will start a new timer.',
    reset: 'Reset all data', resetConfirm: 'Clear all local settings and reading records? This cannot be undone.',
    confirmReset: 'Yes, reset data', cancel: 'Cancel', resetDone: 'Data reset',
    about: 'How it works', aboutText: 'Reminders update about once a minute. “Tomorrow” means 9 AM in your local time. Protected pages and some websites may keep their original favicon.',
    privacyText: 'Your data stays on this device. No accounts, analytics, or cloud services. The extension only requests a website’s existing icons to add the color marker.',
    invalidDomain: 'Enter a valid domain, such as example.com.', domainOnly: 'Enter a domain without a path, query, or port.',
    invalidThresholds: 'Enter eight increasing positive time points (up to 10 years).', invalidSettings: 'Invalid settings.',
    invalidSnooze: 'Invalid reminder time.', invalidSource: 'This action is only available in TabRot.',
    staleTab: 'This page has changed. Refresh the list and try again.', unknownAction: 'Unknown action.', unknownRequest: 'Unknown request.',
    unavailable: 'TabRot is unavailable. Please try again.'
  },
  zh: {
    appTitle: 'TabRot', popupLabel: '待读列表', settings: '设置', switchLanguage: 'Switch to English',
    unread: '待读', snoozed: '稍后', read: '已读', ignored: '已忽略', all: '全部',
    search: '搜索标签…', loading: '正在加载…', oldestFirst: '搁置最久优先', localOnly: '仅存本地',
    tabCount: '{count} 个标签', tabCountOne: '1 个标签', openTab: '打开：{title}', openedAt: '打开于 {date}',
    markRead: '标记已读', markUnread: '标记未读', more: '更多操作', resume: '恢复', resumeTitle: '立即恢复提醒',
    snooze: '稍后提醒', hour: '1 小时后', tomorrow: '明天 09:00', threeDays: '3 天后',
    ignoreTab: '忽略此标签', ignoreSite: '忽略整个网站', unignore: '取消标签忽略', manageRules: '管理忽略规则',
    ignoredTab: '已忽略此标签', ignoredPinned: '固定标签', ignoredSite: '已忽略此网站', until: '{date} 恢复',
    emptySearch: '没有匹配的标签', emptyUnread: '没有积压了', emptyOther: '这里还没有标签',
    emptySearchHint: '换个标题或网站关键词试试。', emptyHint: '新打开的普通网页会自动出现在这里。',
    readToast: '已标记已读', unreadToast: '已标记未读', snoozeToast: '已暂停提醒', resumeToast: '已恢复提醒',
    ignoreToast: '已忽略标签', unignoreToast: '已取消标签忽略', ignoreDomainToast: '已忽略网站',
    settingsTitle: 'TabRot 设置', settingsIntro: '按你的节奏，安静提醒。', language: '语言',
    timing: '颜色与时间', timingHint: '设置八个递增的时间节点，节点间平滑渐变。', minutes: '分钟',
    timeNode: '时间节点 {index}，单位为分钟', timeHelp: '60 分钟 = 1 小时 · 1440 分钟 = 1 天',
    defaults: '恢复默认时间', exclusions: '忽略规则', exclusionsHint: '让常驻网页保持原样。',
    ignorePinned: '忽略固定标签', ignorePinnedHint: '适合邮箱、工作台等常驻标签。',
    domains: '忽略网站', domainsHint: '每行一个域名，包含其子域名。移除域名即可取消忽略。',
    save: '保存修改', unchanged: '设置仅保存在本地。', unsaved: '有未保存的修改', saved: '修改已保存',
    resetTitle: '重置数据', resetHint: '清除阅读状态、暂停提醒和忽略规则，当前标签将重新计时。',
    reset: '重置全部数据', resetConfirm: '确定清除本地设置和阅读记录？此操作无法撤销。',
    confirmReset: '确定重置', cancel: '取消', resetDone: '数据已重置',
    about: '使用说明', aboutText: '提醒约每分钟更新一次。“明天”指本地时间次日 09:00。受保护页面及部分网站可能保留原 favicon。',
    privacyText: '数据仅存本机，无账号、统计或云服务。插件只请求网站原有图标来叠加颜色标记。',
    invalidDomain: '请输入有效域名，例如 example.com。', domainOnly: '只需填写域名，不包含路径、查询参数或端口。',
    invalidThresholds: '八个时间节点必须为递增的正数（最多 10 年）。', invalidSettings: '设置格式无效。',
    invalidSnooze: '提醒时间无效。', invalidSource: '请在 TabRot 中执行此操作。',
    staleTab: '网页已改变，请刷新列表后重试。', unknownAction: '未知操作。', unknownRequest: '未知请求。', unavailable: '插件暂时不可用，请重试。'
  }
};
let language = 'en';
export const getLanguage = () => language;
export const getLocale = () => language === 'zh' ? 'zh-CN' : 'en-US';
export function t(key, values = {}, lang = language) {
  return (messages[lang]?.[key] ?? messages.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}
export const errorText = error => t(error?.message || 'unavailable');
export function applyLanguage() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  // A transient notice from the previous language should not linger after a switch.
  document.querySelector('#toast')?.setAttribute('hidden', '');
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(node => { node.placeholder = t(node.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-label]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nLabel)); });
  document.querySelectorAll('[data-i18n-title]').forEach(node => { node.title = t(node.dataset.i18nTitle); });
  const select = document.querySelector('#language'); if (select) select.value = language;
  const toggle = document.querySelector('#language-toggle'); if (toggle) toggle.textContent = language === 'en' ? '中文' : 'EN';
}
export async function initLanguage() {
  const saved = await chrome.storage.local.get('tabrotLanguage');
  language = saved.tabrotLanguage === 'zh' ? 'zh' : 'en';
  applyLanguage();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.tabrotLanguage) return;
    language = changes.tabrotLanguage.newValue === 'zh' ? 'zh' : 'en';
    applyLanguage(); window.dispatchEvent(new Event('languagechange'));
  });
}
export async function setLanguage(value) {
  await chrome.storage.local.set({ tabrotLanguage: value === 'zh' ? 'zh' : 'en' });
}
