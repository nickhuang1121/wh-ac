// Small rendering helpers. `html` escapes every interpolated value unless it is
// already a Raw fragment, so user-entered text (list names, notes) is safe by default.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));

function render(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function html(strings, ...vals) {
  let out = '';
  strings.forEach((str, i) => {
    out += str;
    if (i < vals.length) out += render(vals[i]);
  });
  return new Raw(out);
}

// Rule text: 【關鍵字】 is emphasised; leading markers from the data set the indent level.
const mark = (s) => esc(s).replace(/【[^】]+】/g, '<b class="kwd">$&</b>');
export function textBlock(lines) {
  return raw((lines || []).map((l) => {
    if (l.startsWith('● ')) return `<p class="tb b1">${mark(l.slice(2))}</p>`;
    if (l.startsWith('■ ')) return `<p class="tb b2">${mark(l.slice(2))}</p>`;
    if (l.startsWith('　')) return `<p class="tb ind">${mark(l.slice(1))}</p>`;
    return `<p class="tb">${mark(l)}</p>`;
  }).join(''));
}
export const inline = (s) => raw(mark(s));

// Event delegation: on(root, 'click', '[data-act]', (event, matchedElement) => ...)
export function on(root, type, selector, handler) {
  root.addEventListener(type, (ev) => {
    const el = ev.target instanceof Element ? ev.target.closest(selector) : null;
    if (el && root.contains(el)) handler(ev, el);
  });
}

export const fmtPts = (n) => Number(n || 0).toLocaleString('en-US');

let toastTimer = 0;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  // As a popover the toast sits in the top layer, so it stays visible above an open dialog.
  const pop = typeof el.showPopover === 'function' && el.hasAttribute('popover');
  if (pop) {
    try {
      if (el.matches(':popover-open')) el.hidePopover();
      el.showPopover();
    } catch (e) { /* fall back to plain positioning */ }
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    if (pop) { try { el.hidePopover(); } catch (e) { /* already hidden */ } }
  }, 2600);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
    return ok;
  }
}

export function download(filename, text, type) {
  const blob = new Blob([text], { type: type || 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// base64url <-> UTF-8 string, for share links
export function encodeShare(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeShare(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
