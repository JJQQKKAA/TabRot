import { DEFAULT_THRESHOLDS, COLORS, validateSettings } from './core.js';
import { request, el, toast } from './ui.js';
import { t, errorText, initLanguage, setLanguage } from './i18n.js';
const grid = document.querySelector('#thresholds'), form = document.querySelector('#settings-form');
function status(key) { const node = document.querySelector('#save-state'); node.dataset.i18n = key; node.textContent = t(key); }
function fill(settings) {
  grid.replaceChildren(...settings.thresholds.map((value, index) => {
    const label = el('label', 'threshold-field'), caption = el('span', '', `${String(index + 1).padStart(2, '0')} · ${t('minutes')}`), dot = el('i'); dot.style.background = COLORS[index]; caption.prepend(dot);
    const input = el('input'); input.type = 'number'; input.min = '1'; input.max = '5256000'; input.step = 'any'; input.required = true; input.value = value; input.setAttribute('aria-label', t('timeNode', { index: index + 1 }));
    label.append(caption, input); return label;
  }));
  document.querySelector('#ignore-pinned').checked = settings.ignorePinned;
  document.querySelector('#domains').value = settings.ignoredDomains.join('\n');
}
function draft() { return { thresholds: [...grid.querySelectorAll('input')].map(input => Number(input.value)), ignorePinned: document.querySelector('#ignore-pinned').checked, ignoredDomains: document.querySelector('#domains').value.split('\n').map(domain => domain.trim()).filter(Boolean) }; }
form.addEventListener('input', () => status('unsaved'));
document.querySelector('#language').addEventListener('change', event => setLanguage(event.target.value).catch(error => toast(errorText(error), true)));
window.addEventListener('languagechange', () => {
  // Relabel controls in place: switching language must preserve an unsaved draft.
  grid.querySelectorAll('label').forEach((label, index) => {
    const caption = label.querySelector('span'), dot = caption.querySelector('i'); caption.replaceChildren(dot, document.createTextNode(`${String(index + 1).padStart(2, '0')} · ${t('minutes')}`));
    label.querySelector('input').setAttribute('aria-label', t('timeNode', { index: index + 1 }));
  });
});
document.querySelector('#restore-defaults').addEventListener('click', () => { grid.querySelectorAll('input').forEach((input, index) => { input.value = DEFAULT_THRESHOLDS[index]; }); status('unsaved'); });
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
