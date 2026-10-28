export async function request(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || 'unavailable');
  return result;
}
export function el(tag, className, text) {
  const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node;
}
export function toast(message, error = false) {
  const node = document.querySelector('#toast'); node.textContent = message; node.classList.toggle('error', error); node.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { node.hidden = true; }, 3500);
}
export function safeIcon(url) { return typeof url === 'string' && /^(https?:|data:image\/)/i.test(url) ? url : '../icons/icon-32.png'; }
