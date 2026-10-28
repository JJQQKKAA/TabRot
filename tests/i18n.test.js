import test from 'node:test';
import assert from 'node:assert/strict';
import { messages, t, getLanguage, errorText } from '../src/i18n.js';
import { formatAge, MINUTE } from '../src/core.js';

test('English is the default and both languages have every translation key', () => {
  assert.equal(getLanguage(), 'en');
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.zh).sort());
  for (const language of ['en', 'zh']) for (const [key, value] of Object.entries(messages[language])) {
    assert.equal(typeof value, 'string'); assert.ok(value.length, `${language}.${key}`);
    const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(placeholders(value), placeholders(messages.en[key]));
  }
});
test('counts, errors and age labels use the selected language', () => {
  assert.equal(t('tabCount', { count: 12 }, 'en'), '12 tabs');
  assert.equal(t('tabCount', { count: 12 }, 'zh'), '12 个标签');
  assert.equal(errorText(new Error('staleTab')), messages.en.staleTab);
  assert.equal(formatAge(0), 'Just now'); assert.equal(formatAge(15 * MINUTE), '15m');
  assert.equal(formatAge(61 * MINUTE), '1h 1m'); assert.equal(formatAge(25 * 60 * MINUTE), '1d 1h');
  assert.equal(formatAge(61 * MINUTE, 'zh'), '1 小时 1 分钟');
});
