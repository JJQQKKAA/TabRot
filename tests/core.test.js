import test from 'node:test';
import assert from 'node:assert/strict';
import { MINUTE, COLORS, DEFAULT_THRESHOLDS, DEFAULT_SETTINGS, ageColor, pageKey, isTrackable, normalizeDomain, validateSettings, statusOf, snoozeTime, restoreMatch, formatAge } from '../src/core.js';

test('color stops are exact, continuous and clamp at the ends', () => {
  assert.equal(ageColor(-100), COLORS[0]);
  DEFAULT_THRESHOLDS.forEach((t, i) => assert.equal(ageColor(t * MINUTE), COLORS[i]));
  assert.equal(ageColor(100000 * MINUTE), COLORS.at(-1));
  for (const t of DEFAULT_THRESHOLDS.slice(1)) {
    const a = ageColor(t * MINUTE - 1), b = ageColor(t * MINUTE + 1);
    for (const p of [1, 3, 5]) assert.ok(Math.abs(parseInt(a.slice(p, p + 2), 16) - parseInt(b.slice(p, p + 2), 16)) <= 1);
  }
  assert.notEqual(ageColor(60 * MINUTE), COLORS[0]);
  assert.notEqual(ageColor(60 * MINUTE), COLORS[1]);
});
test('page identity retains query but ignores fragments', () => {
  assert.equal(pageKey('https://example.com/article#chapter'), 'https://example.com/article');
  assert.notEqual(pageKey('https://example.com/?id=1'), pageKey('https://example.com/?id=2'));
  for (const url of ['chrome://settings', 'file:///tmp/a', 'about:blank', 'https://chromewebstore.google.com/detail/a', 'https://chrome.google.com/webstore/detail/a']) assert.equal(isTrackable(url), false);
  assert.ok(isTrackable('https://example.com'));
});
test('ignore domains respect hostname boundaries and read state takes precedence over snooze', () => {
  const record = { url: 'https://docs.example.com/a', read: false, snoozedUntil: 2000 };
  assert.equal(statusOf(record, {}, DEFAULT_SETTINGS, 1000), 'snoozed');
  assert.equal(statusOf(record, {}, DEFAULT_SETTINGS, 3000), 'unread');
  assert.equal(statusOf({ ...record, read: true }, {}, DEFAULT_SETTINGS, 1000), 'read');
  assert.equal(statusOf(record, { pinned: true }, DEFAULT_SETTINGS, 1000), 'ignored');
  assert.equal(statusOf(record, {}, { ...DEFAULT_SETTINGS, ignoredDomains: ['example.com'] }, 3000), 'ignored');
  assert.equal(statusOf({ ...record, url: 'https://notexample.com' }, {}, { ...DEFAULT_SETTINGS, ignoredDomains: ['example.com'] }, 3000), 'unread');
});
test('settings reject unordered, missing, infinite and invalid inputs', () => {
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, thresholds: [1, 2] }));
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, thresholds: [1, 1, 3, 4, 5, 6, 7, 8] }));
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, thresholds: [1, 2, 3, 4, 5, 6, 7, Infinity] }));
  assert.equal(normalizeDomain('https://EXAMPLE.com/'), 'example.com');
  assert.throws(() => normalizeDomain('example.com/path'));
  assert.throws(() => normalizeDomain('*.example.com'));
  assert.deepEqual(validateSettings({ ...DEFAULT_SETTINGS, ignoredDomains: ['example.com', 'EXAMPLE.com'] }).ignoredDomains, ['example.com']);
});
test('snooze uses local tomorrow 9am and duration for other choices', () => {
  const now = new Date(2026, 9, 28, 23, 15).getTime();
  assert.equal(snoozeTime('hour', now) - now, 60 * MINUTE);
  assert.equal(snoozeTime('threeDays', now) - now, 3 * 24 * 60 * MINUTE);
  const tomorrow = new Date(snoozeTime('tomorrow', now));
  assert.equal(tomorrow.getDate(), 29); assert.equal(tomorrow.getHours(), 9); assert.equal(tomorrow.getMinutes(), 0);
});
test('restart matching consumes duplicate URL records one at a time', () => {
  const records = { a: { id: 'a', url: 'https://example.com', index: 1, openedAt: 100 }, b: { id: 'b', url: 'https://example.com', index: 4, openedAt: 200 } };
  const used = new Set();
  const first = restoreMatch({ url: 'https://example.com/#fragment', index: 4 }, records, used);
  assert.equal(first.id, 'b'); used.add(first.id);
  assert.equal(restoreMatch({ url: 'https://example.com', index: 4 }, records, used).id, 'a'); used.add('a');
  assert.equal(restoreMatch({ url: 'https://example.com', index: 4 }, records, used), undefined);
});
test('elapsed labels never show negative or misleading zero days', () => {
  assert.equal(formatAge(-100, 'zh'), '刚刚打开'); assert.equal(formatAge(61 * MINUTE, 'zh'), '1 小时 1 分钟'); assert.equal(formatAge(25 * 60 * MINUTE, 'zh'), '1 天 1 小时');
});

test('title stages migrate old presets without changing Popup thresholds or ignore settings', async () => {
  const { presetStages } = await import('../src/core.js');
  for (const emojiTheme of [undefined, 'circles', 'squares', 'fruit', 'plants', 'faces']) {
    const old = { thresholds: DEFAULT_THRESHOLDS, ignoredDomains: ['mail.example.com'], ignorePinned: false, emojiTheme };
    const migrated = validateSettings(old);
    assert.deepEqual(migrated.emojiStages, presetStages(['plants', 'faces'].includes(emojiTheme) ? emojiTheme : 'weather'));
    assert.deepEqual(migrated.thresholds, old.thresholds); assert.equal(migrated.ignorePinned, false);
  }
});
test('custom stages switch exactly at independent boundaries and clamp age', async () => {
  const { ageEmoji } = await import('../src/core.js');
  const settings = { ...DEFAULT_SETTINGS, emojiStages: [{ afterMinutes: 0, icon: '🌱' }, { afterMinutes: 0.5, icon: '🌿' }, { afterMinutes: 100, icon: '🥀' }] };
  assert.equal(ageEmoji(-100, settings), '🌱'); assert.equal(ageEmoji(29999, settings), '🌱');
  assert.equal(ageEmoji(30000, settings), '🌿'); assert.equal(ageEmoji(100 * MINUTE, settings), '🥀'); assert.equal(ageEmoji(1e15, settings), '🥀');
});
test('stage validation rejects ambiguous time boundaries and validates full emoji graphemes', async () => {
  const { validateStages, validEmoji, presetStages } = await import('../src/core.js');
  const good = presetStages('weather'); assert.deepEqual(validateStages(good), good);
  for (const bad of [[], good.slice(0, 1), Array(17).fill(good[0]), [{ afterMinutes: 1, icon: '🌱' }, good[1]], [good[0], good[0]], [good[0], { afterMinutes: Infinity, icon: '🌿' }], [good[0], { afterMinutes: -1, icon: '🌿' }], [good[0], { afterMinutes: 5256001, icon: '🌿' }]]) assert.throws(() => validateStages(bad), /invalidStages/);
  for (const icon of ['🌱', '☀️', '👩🏽‍💻', '🇨🇳', '1️⃣']) assert.equal(validEmoji(icon), true, icon);
  for (const icon of ['', 'hello', '🌱🌿', '<script>', '🌱 text']) assert.equal(validEmoji(icon), false, icon);
  assert.throws(() => validateStages([good[0], { afterMinutes: 1, icon: 'text' }]), /invalidEmoji/);
});
