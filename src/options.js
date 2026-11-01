import { DEFAULT_THRESHOLDS, COLORS, EMOJI_THEMES, presetStages, validateSettings, validateStages, ageEmoji, ageColor, formatAge, MINUTE } from './core.js';
import { request, el, toast } from './ui.js';
import { t, errorText, initLanguage, getLanguage, setLanguage } from './i18n.js';
const grid = document.querySelector('#thresholds'), form = document.querySelector('#settings-form');
const stages = document.querySelector('#emoji-stages'), scrubber = document.querySelector('#preview-age');
function status(key) { const node = document.querySelector('#save-state'); node.dataset.i18n = key; node.textContent = t(key); }
function dirty() { status('unsaved'); }
function fill(settings) {
  grid.replaceChildren(...settings.thresholds.map((value, index) => {
    const label = el('label', 'threshold-field'), caption = el('span'), dot = el('i'); dot.style.background = COLORS[index];
    caption.append(dot, document.createTextNode(`${String(index + 1).padStart(2, '0')} · ${t('minutes')}`));
    const input = el('input'); input.type = 'number'; input.min = '1'; input.max = '5256000'; input.step = 'any'; input.required = true; input.value = value; input.setAttribute('aria-label', t('timeNode', { index: index + 1 }));
    label.append(caption, input); return label;
  }));
  fillPresets(); fillStages(settings.emojiStages);
  document.querySelector('#ignore-pinned').checked = settings.ignorePinned;
  document.querySelector('#domains').value = settings.ignoredDomains.join('\n');
}
function fillPresets() {
  document.querySelector('#emoji-themes').replaceChildren(...EMOJI_THEMES.map(theme => {
    const button = el('button', 'emoji-preset'); button.type = 'button'; button.dataset.preset = theme.id;
    button.append(el('strong', '', t(`emoji_${theme.id}`)), el('span', 'emoji-sequence', theme.icons.join(' ')));
    button.addEventListener('click', () => { fillStages(presetStages(theme.id)); dirty(); });
    return button;
  }));
  document.querySelector('#emoji-library').replaceChildren(...EMOJI_THEMES.flatMap(theme => theme.icons.map(icon => {
    const option = el('option'); option.value = icon; option.label = t(`emoji_${theme.id}`); return option;
  })));
}
function stageRow(stage, index) {
  const row = el('div', 'stage-row');
  const time = el('input', 'stage-time'); time.type = 'number'; time.min = '0'; time.max = '5256000'; time.step = 'any'; time.required = true;
  const unit = el('select', 'stage-unit');
  for (const [value, key] of [[1, 'minutes'], [60, 'hours'], [1440, 'days']]) { const option = el('option', '', t(key)); option.value = value; unit.append(option); }
  const factor = stage.afterMinutes && stage.afterMinutes % 1440 === 0 ? 1440 : stage.afterMinutes && stage.afterMinutes % 60 === 0 ? 60 : 1;
  unit.value = factor; time.value = stage.afterMinutes / factor;
  time.disabled = unit.disabled = index === 0;
  const icon = el('input', 'stage-icon'); icon.type = 'text'; icon.value = stage.icon; icon.maxLength = 40; icon.required = true; icon.setAttribute('list', 'emoji-library'); icon.autocomplete = 'off'; icon.spellcheck = false;
  const preview = el('span', 'stage-title');
  const remove = el('button', 'stage-remove', '×'); remove.type = 'button'; remove.disabled = index === 0;
  remove.addEventListener('click', () => { if (stages.children.length <= 2) return; row.remove(); relabelStages(); updatePreview(); dirty(); });
  row.append(time, unit, icon, preview, remove); return row;
}
function fillStages(value) {
  stages.replaceChildren(...value.map(stageRow));
  relabelStages(); updatePreview();
}
function relabelStages() {
  [...stages.children].forEach((row, index) => {
    row.querySelector('.stage-time').setAttribute('aria-label', t('stageTime', { index: index + 1 }));
    row.querySelector('.stage-unit').setAttribute('aria-label', t('stageUnit', { index: index + 1 }));
    row.querySelector('.stage-icon').setAttribute('aria-label', t('stageIcon', { index: index + 1 }));
    const remove = row.querySelector('.stage-remove'); remove.setAttribute('aria-label', t('removeStage', { index: index + 1 })); remove.disabled = index === 0 || stages.children.length <= 2;
    // Unit labels are updated without changing the user's current choice.
    [...row.querySelector('.stage-unit').options].forEach((option, i) => { option.textContent = t(['minutes', 'hours', 'days'][i]); });
  });
  document.querySelector('#add-stage').disabled = stages.children.length >= 16;
  document.querySelector('#stage-count').textContent = t('stageCount', { count: stages.children.length });
}
function readStages() {
  return [...stages.children].map(row => ({ afterMinutes: Number(row.querySelector('.stage-time').value) * Number(row.querySelector('.stage-unit').value), icon: row.querySelector('.stage-icon').value.trim() }));
}
function draft() { return { emojiStages: readStages(), thresholds: [...grid.querySelectorAll('input')].map(input => Number(input.value)), ignorePinned: document.querySelector('#ignore-pinned').checked, ignoredDomains: document.querySelector('#domains').value.split('\n').map(domain => domain.trim()).filter(Boolean) }; }
function updatePreview() {
  const value = readStages();
  [...stages.children].forEach((row, index) => { row.querySelector('.stage-title').textContent = `${value[index].icon} ${t('emojiSample')}`; });
  document.querySelectorAll('[data-preset]').forEach(button => {
    const preset = presetStages(button.dataset.preset), selected = JSON.stringify(value) === JSON.stringify(preset);
    button.setAttribute('aria-pressed', String(selected));
  });
  const error = document.querySelector('#stage-error');
  try { validateStages(value); error.hidden = true; }
  catch (problem) { error.textContent = errorText(problem); error.hidden = false; return; }
  const colorTimes = draft().thresholds.filter(Number.isFinite);
  scrubber.max = Math.max(value.at(-1).afterMinutes, ...colorTimes, 60) * 1.2; scrubber.step = 'any';
  const age = Number(scrubber.value) * MINUTE;
  document.querySelector('#preview-title').textContent = `${ageEmoji(age, { emojiStages: value })} ${t('emojiSample')}`;
  const color = ageColor(age, draft().thresholds);
  document.querySelector('#preview-dot').style.background = color;
  document.querySelector('#preview-time').textContent = formatAge(age, getLanguage());
}
document.querySelector('#add-stage').addEventListener('click', () => {
  if (stages.children.length >= 16) return;
  const last = readStages().at(-1);
  const afterMinutes = Math.min(5256000, last.afterMinutes + (last.afterMinutes >= 1440 ? 1440 : 60));
  if (afterMinutes <= last.afterMinutes) { toast(t('stageLimit'), true); return; }
  stages.append(stageRow({ afterMinutes, icon: last.icon }, stages.children.length));
  relabelStages(); updatePreview(); dirty(); stages.lastElementChild.querySelector('.stage-time').focus();
});
scrubber.addEventListener('input', event => { event.stopPropagation(); updatePreview(); });
form.addEventListener('input', () => { dirty(); updatePreview(); });
form.addEventListener('change', event => { if (event.target.matches('.stage-unit')) { dirty(); updatePreview(); } });
document.querySelector('#language').addEventListener('change', event => setLanguage(event.target.value).catch(error => toast(errorText(error), true)));
window.addEventListener('languagechange', () => {
  fillPresets(); relabelStages(); updatePreview();
  grid.querySelectorAll('label').forEach((label, index) => {
    const caption = label.querySelector('span'), dot = caption.querySelector('i'); caption.replaceChildren(dot, document.createTextNode(`${String(index + 1).padStart(2, '0')} · ${t('minutes')}`));
    label.querySelector('input').setAttribute('aria-label', t('timeNode', { index: index + 1 }));
  });
});
document.querySelector('#restore-defaults').addEventListener('click', () => { grid.querySelectorAll('input').forEach((input, index) => { input.value = DEFAULT_THRESHOLDS[index]; }); updatePreview(); dirty(); });
form.addEventListener('submit', async event => {
  event.preventDefault(); const button = document.querySelector('#save'); button.disabled = true;
  try { const saved = await request({ type: 'SETTINGS', settings: validateSettings(draft()) }); fill(saved.settings); status('saved'); toast(t('saved')); }
  catch (error) { toast(errorText(error), true); }
  finally { button.disabled = false; }
});
document.querySelector('#reset').addEventListener('click', () => { document.querySelector('#reset-confirm').hidden = false; document.querySelector('#reset').hidden = true; });
document.querySelector('#cancel-reset').addEventListener('click', () => { document.querySelector('#reset-confirm').hidden = true; document.querySelector('#reset').hidden = false; });
document.querySelector('#confirm-reset').addEventListener('click', async event => {
  event.target.disabled = true;
  try { fill((await request({ type: 'RESET' })).settings); document.querySelector('#cancel-reset').click(); status('unchanged'); toast(t('resetDone')); }
  catch (error) { toast(errorText(error), true); }
  finally { event.target.disabled = false; }
});
await initLanguage();
try { fill((await request({ type: 'SNAPSHOT' })).settings); } catch (error) { toast(errorText(error), true); }
