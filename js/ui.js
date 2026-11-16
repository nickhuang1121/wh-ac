// Modal dialogs and printing.
import { html } from './util.js';

// Opens a native <dialog>. Returns the element; listen for 'close' to react.
export function openDialog({ title, body, wide }) {
  const d = document.createElement('dialog');
  d.className = 'dlg' + (wide ? ' wide' : '');
  d.innerHTML = String(html`
    <header class="dlg-head">
      <h3>${title}</h3>
      <button type="button" class="btn icon" data-close aria-label="關閉">✕</button>
    </header>
    <div class="dlg-body">${body}</div>`);
  d.addEventListener('click', (ev) => {
    if (ev.target === d || (ev.target instanceof Element && ev.target.closest('[data-close]'))) d.close();
  });
  d.addEventListener('close', () => d.remove());
  document.body.appendChild(d);
  d.showModal();
  return d;
}

export function closeDialogs() {
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
}

// Prints only the given fragment (the rest of the page is hidden by the print stylesheet).
export function printFragment(fragment) {
  const root = document.getElementById('print-root');
  root.innerHTML = String(fragment);
  document.body.classList.add('printing');
  const done = () => {
    document.body.classList.remove('printing');
    root.innerHTML = '';
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  // let images in the fragment start loading before the print dialog opens
  setTimeout(() => window.print(), 150);
}
