export const MINUTE = 60_000;
export const DEFAULT_THRESHOLDS = [30, 120, 360, 720, 1440, 4320, 10080, 43200];
export const COLORS = ['#5eae89', '#a4b951', '#dfbf45', '#ec9947', '#e77448', '#cf514b', '#a73d47', '#743b43'];
export const EMOJI_THEMES = [
  { id: 'weather', icons: ['☀️', '🌤️', '⛅', '☁️', '🌦️', '🌧️', '🌩️', '⛈️'] },
  { id: 'plants', icons: ['🌱', '🌿', '🌳', '🌼', '🌻', '🍁', '🍂', '🥀'] },
  { id: 'faces', icons: ['😌', '🙂', '🤔', '😐', '😟', '😰', '😫', '😱'] }
];
export const DEFAULT_STAGE_TIMES = [0, 30, 120, 360, 720, 1440, 4320, 10080];
export const presetStages = id => (EMOJI_THEMES.find(theme => theme.id === id) || EMOJI_THEMES[0]).icons.map((icon, index) => ({ afterMinutes: DEFAULT_STAGE_TIMES[index], icon }));
export function validEmoji(icon) {
  if (typeof icon !== 'string' || icon.length > 40 || !/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(icon)) return false;
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(icon)].length === 1;
}
export function validateStages(stages) {
  if (!Array.isArray(stages) || stages.length < 2 || stages.length > 16 || stages.some((stage, i) =>
    !stage || !Number.isFinite(stage.afterMinutes) || stage.afterMinutes < 0 || stage.afterMinutes > 5256000 ||
    (i === 0 ? stage.afterMinutes !== 0 : stage.afterMinutes <= stages[i - 1].afterMinutes))) throw new Error('invalidStages');
  if (stages.some(stage => !validEmoji(stage.icon))) throw new Error('invalidEmoji');
  return stages.map(({ afterMinutes, icon }) => ({ afterMinutes, icon }));
}
export function ageEmoji(ageMs, settings) {
  const minutes = Math.max(0, ageMs / MINUTE), stages = settings.emojiStages || presetStages('weather');
  return stages.findLast(stage => stage.afterMinutes <= minutes)?.icon || stages[0].icon;
}
export function unmarkedTitle(title, marker) {
  return marker && title?.startsWith(`${marker} `) ? title.slice(marker.length + 1) : title;
}
export const DEFAULT_SETTINGS = { thresholds: DEFAULT_THRESHOLDS, ignoredDomains: [], ignorePinned: true, emojiStages: presetStages('weather') };

export function pageKey(url) {
  try { const u = new URL(url); u.hash = ''; return u.href; } catch { return ''; }
}
export function isTrackable(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol) &&
      !(u.hostname === 'chromewebstore.google.com' || (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore')));
  } catch { return false; }
}
export function normalizeDomain(input) {
  const value = input.trim().toLowerCase();
  if (!value || /[\s*]/.test(value)) throw new Error('invalidDomain');
  let u;
  try { u = new URL(value.includes('://') ? value : `https://${value}`); } catch { throw new Error('invalidDomain'); }
  if (!['http:', 'https:'].includes(u.protocol) || !u.hostname || u.username || u.password || u.port || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) throw new Error('domainOnly');
  return u.hostname.replace(/\.$/, '');
}
export function validateSettings(value) {
  if (!value || !Array.isArray(value.thresholds) || value.thresholds.length !== 8 || value.thresholds.some((t, i, a) => !Number.isFinite(t) || t <= 0 || t > 5256000 || (i > 0 && t <= a[i - 1]))) throw new Error('invalidThresholds');
  if (!Array.isArray(value.ignoredDomains) || typeof value.ignorePinned !== 'boolean') throw new Error('invalidSettings');
  // Old versions had fixed presets. Keep other user settings and migrate supported
  // presets to eight independent title stages; removed color presets use weather.
  const emojiStages = value.emojiStages === undefined ? presetStages(value.emojiTheme) : validateStages(value.emojiStages);
  return { emojiStages, thresholds: [...value.thresholds], ignoredDomains: [...new Set(value.ignoredDomains.map(normalizeDomain))], ignorePinned: value.ignorePinned };
}
export function ignoredReason(record, tab, settings) {
  if (record.ignored) return 'tab';
  if (settings.ignorePinned && tab.pinned) return 'pinned';
  const hostname = new URL(record.url).hostname;
  if (settings.ignoredDomains.some(d => hostname === d || hostname.endsWith(`.${d}`))) return 'domain';
  return null;
}
export function statusOf(record, tab, settings, now = Date.now()) {
  if (ignoredReason(record, tab, settings)) return 'ignored';
  if (record.read) return 'read';
  if (record.snoozedUntil > now) return 'snoozed';
  return 'unread';
}
export function ageColor(ageMs, thresholds = DEFAULT_THRESHOLDS) {
  const minutes = Math.max(0, ageMs / MINUTE);
  if (minutes <= thresholds[0]) return COLORS[0];
  for (let i = 1; i < thresholds.length; i++) {
    if (minutes <= thresholds[i]) {
      const t = (Math.log(minutes) - Math.log(thresholds[i - 1])) / (Math.log(thresholds[i]) - Math.log(thresholds[i - 1]));
      const rgb = [1, 3, 5].map(p => Math.round(parseInt(COLORS[i - 1].slice(p, p + 2), 16) * (1 - t) + parseInt(COLORS[i].slice(p, p + 2), 16) * t));
      return `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}`;
    }
  }
  return COLORS.at(-1);
}
export function formatAge(ms, language = 'en') {
  const minutes = Math.max(0, Math.floor(ms / MINUTE));
  if (minutes < 1) return language === 'zh' ? '刚刚打开' : 'Just now';
  if (language !== 'zh') {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;
    return `${Math.floor(hours / 24)}d${hours % 24 ? ` ${hours % 24}h` : ''}`;
  }
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ''}`;
  const days = Math.floor(hours / 24);
  return `${days} 天${hours % 24 ? ` ${hours % 24} 小时` : ''}`;
}
export function snoozeTime(choice, now = Date.now()) {
  if (choice === 'hour') return now + 60 * MINUTE;
  if (choice === 'threeDays') return now + 3 * 24 * 60 * MINUTE;
  if (choice === 'tomorrow') { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); }
  throw new Error('invalidSnooze');
}
// Consume each saved record at most once, including duplicate URLs in separate tabs.
export function restoreMatch(tab, records, used) {
  return Object.values(records).filter(r => !used.has(r.id) && pageKey(r.url) === pageKey(tab.url)).sort((a, b) => {
    const score = r => (r.windowId === tab.windowId ? 10000 : 0) - Math.abs((r.index ?? 0) - tab.index);
    return score(b) - score(a) || a.openedAt - b.openedAt;
  })[0];
}
