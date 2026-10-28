import { formatAge } from './core.js';
import { request, el, toast, safeIcon } from './ui.js';
import { t, errorText, initLanguage, getLanguage, getLocale, setLanguage } from './i18n.js';
let snapshot = { items: [], settings: {} }, filter = 'unread', query = '', busy = false;
const list = document.querySelector('#tab-list'), menu = document.querySelector('#row-menu');
const toastKeys = { read: 'readToast', unread: 'unreadToast', snooze: 'snoozeToast', resume: 'resumeToast', ignore: 'ignoreToast', unignore: 'unignoreToast', ignoreDomain: 'ignoreDomainToast' };
async function act(item, action, choice) {
  if (busy) return;
  busy = true; menu.hidePopover();
  try {
    snapshot = await request({ type: 'ACTION', tabId: item.tabId, recordId: item.id, action, choice });
    if (action === 'focus') { window.close(); return; }
    render(); toast(t(toastKeys[action]));
  } catch (error) { toast(errorText(error), true); await load(); }
  finally { busy = false; }
}
function button(text, title, handler, className = 'row-button') {
  const node = el('button', className, text); node.title = title; node.setAttribute('aria-label', title); node.addEventListener('click', handler); return node;
}
function showMenu(anchor, item) {
  menu.replaceChildren();
  function entry(key, action, choice) {
    const node = button(t(key), t(key), () => act(item, action, choice)); node.setAttribute('role', 'menuitem'); menu.append(node);
  }
  if (item.status !== 'ignored') {
    menu.append(el('span', 'menu-caption', t('snooze')));
    for (const choice of ['hour', 'tomorrow', 'threeDays']) entry(choice, 'snooze', choice);
    if (item.status === 'snoozed') entry('resume', 'resume');
    menu.append(el('hr')); entry('ignoreTab', 'ignore'); entry('ignoreSite', 'ignoreDomain');
  } else if (item.ignored) entry('unignore', 'unignore');
  else menu.append(button(t('manageRules'), t('settings'), () => chrome.runtime.openOptionsPage()));
  menu.showPopover();
  const rect = anchor.getBoundingClientRect(), height = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(rect.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${rect.bottom + height + 6 > innerHeight ? Math.max(8, rect.top - height - 4) : rect.bottom + 4}px`;
  menu.querySelector('button')?.focus();
}
function row(item) {
  const node = el('article', 'tab-card'); node.style.setProperty('--age-color', item.color);
  const open = button('', t('openTab', { title: item.title }), () => act(item, 'focus'), 'tab-open');
  const wrap = el('span', 'favicon-wrap'), image = el('img', 'favicon'); image.alt = ''; image.src = safeIcon(item.favicon);
  image.addEventListener('error', () => { image.src = '../icons/icon-32.png'; }, { once: true });
  wrap.append(image, el('span', `age-dot ${item.status === 'unread' ? '' : 'muted'}`));
  const content = el('span', 'tab-copy'); content.append(el('span', 'tab-title', item.title));
  let detail = new URL(item.url).hostname.replace(/^www\./, '');
  if (item.status === 'snoozed') detail += ` · ${t('until', { date: new Date(item.snoozedUntil).toLocaleString(getLocale(), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) })}`;
  if (item.status === 'ignored') detail += ` · ${t(item.ignored ? 'ignoredTab' : item.pinned && snapshot.settings.ignorePinned ? 'ignoredPinned' : 'ignoredSite')}`;
  content.append(el('span', 'tab-domain', detail)); open.append(wrap, content);
  const meta = el('div', 'tab-meta'), age = el('span', 'tab-age', formatAge(Date.now() - item.openedAt, getLanguage()));
  age.title = t('openedAt', { date: new Date(item.openedAt).toLocaleString(getLocale()) });
  const actions = el('div', 'row-actions');
  if (item.status !== 'ignored') actions.append(button(item.read ? '↶' : '✓', t(item.read ? 'markUnread' : 'markRead'), () => act(item, item.read ? 'unread' : 'read')));
  const more = button('•••', t('more'), () => showMenu(more, item)); more.setAttribute('aria-haspopup', 'menu');
  actions.append(more); meta.append(age, actions); node.append(open, meta); return node;
}
function render() {
  menu.hidePopover();
  document.querySelector('#count').textContent = t(snapshot.items.length === 1 ? 'tabCountOne' : 'tabCount', { count: snapshot.items.length });
  document.querySelector('#unread-count').textContent = snapshot.items.filter(i => i.status === 'unread').length;
  const items = snapshot.items.filter(i => (filter === 'all' || i.status === filter) && `${i.title} ${i.url}`.toLowerCase().includes(query));
  list.replaceChildren(...items.map(row));
  if (!items.length) {
    const empty = el('div', 'empty'); empty.append(el('span', 'empty-symbol', query ? '⌕' : '✓'), el('strong', '', t(query ? 'emptySearch' : filter === 'unread' ? 'emptyUnread' : 'emptyOther')), el('p', '', t(query ? 'emptySearchHint' : 'emptyHint'))); list.append(empty);
  }
}
async function load() { try { snapshot = await request({ type: 'SNAPSHOT' }); render(); } catch (error) { list.replaceChildren(el('div', 'empty', errorText(error))); } }
document.querySelector('#settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.querySelector('#language-toggle').addEventListener('click', () => setLanguage(getLanguage() === 'en' ? 'zh' : 'en').catch(error => toast(errorText(error), true)));
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); document.querySelector('[data-filter="unread"]').click(); });
document.querySelectorAll('.filter').forEach(node => node.addEventListener('click', () => { filter = node.dataset.filter; document.querySelectorAll('.filter').forEach(other => (other.classList.toggle('active', other === node), other.setAttribute('aria-pressed', String(other === node)))); render(); }));
document.querySelector('#search').addEventListener('input', event => { query = event.target.value.trim().toLowerCase(); render(); });
window.addEventListener('languagechange', render);
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.tabrot && !busy && !menu.matches(':popover-open')) load(); });
setInterval(() => { if (!busy && !menu.matches(':popover-open')) load(); }, 60000);
await initLanguage(); await load();
