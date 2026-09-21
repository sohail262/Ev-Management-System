import { CURRENCY } from './constants.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function formatMoney(n) {
  const num = Number(n) || 0;
  return `${CURRENCY}${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function formatDate(d) {
  if (!d) return '—';
  const date = d?.toDate ? d.toDate() : (d instanceof Date ? d : new Date(d));
  if (isNaN(date)) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(d) {
  if (!d) return '—';
  const date = d?.toDate ? d.toDate() : (d instanceof Date ? d : new Date(d));
  if (isNaN(date)) return '—';
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function todayInputValue() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

export function debounce(fn, wait = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

export function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

export function invoiceNumber(seq) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `INV-${y}${m}-${String(seq).padStart(4, '0')}`;
}

// ---------- Toasts ----------
let toastHost = null;
export function toast(message, type = 'info', timeout = 3800) {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    document.body.appendChild(toastHost);
  }
  const iconMap = { success: 'checkCircle', error: 'alert', info: 'info' };
  const node = el('div', { class: `toast toast--${type}` }, []);
  import('./icons.js').then(({ icon }) => {
    node.innerHTML = `${icon(iconMap[type] || 'info')}<span>${escapeHtml(message)}</span>`;
  });
  toastHost.appendChild(node);
  requestAnimationFrame(() => node.classList.add('is-visible'));
  setTimeout(() => {
    node.classList.remove('is-visible');
    setTimeout(() => node.remove(), 250);
  }, timeout);
}

// ---------- Modal ----------
let modalRoot = null;
export function openModal({ title, bodyHtml, footerHtml = '', size = 'md', onMount }) {
  closeModal();
  modalRoot = el('div', { class: 'modal-overlay' }, []);
  modalRoot.innerHTML = `
    <div class="modal modal--${size}" role="dialog" aria-modal="true">
      <div class="modal__header">
        <h3>${escapeHtml(title)}</h3>
        <button type="button" class="icon-btn" data-close-modal aria-label="Close"></button>
      </div>
      <div class="modal__body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal__footer">${footerHtml}</div>` : ''}
    </div>`;
  document.body.appendChild(modalRoot);
  document.body.classList.add('no-scroll');
  import('./icons.js').then(({ ICONS }) => {
    const btn = $('[data-close-modal]', modalRoot);
    if (btn) btn.innerHTML = ICONS.close;
  });
  requestAnimationFrame(() => modalRoot.classList.add('is-visible'));
  modalRoot.addEventListener('click', (e) => {
    if (e.target === modalRoot || e.target.closest('[data-close-modal]')) closeModal();
  });
  document.addEventListener('keydown', escHandler);
  if (onMount) onMount(modalRoot);
  return modalRoot;
}

function escHandler(e) {
  if (e.key === 'Escape') closeModal();
}

export function closeModal() {
  if (!modalRoot) return;
  modalRoot.classList.remove('is-visible');
  document.body.classList.remove('no-scroll');
  document.removeEventListener('keydown', escHandler);
  const node = modalRoot;
  modalRoot = null;
  setTimeout(() => node.remove(), 200);
}

export function confirmDialog(message, { confirmLabel = 'Confirm', danger = true } = {}) {
  return new Promise((resolve) => {
    const modal = openModal({
      title: 'Please confirm',
      bodyHtml: `<p class="confirm-text">${escapeHtml(message)}</p>`,
      footerHtml: `
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm>${escapeHtml(confirmLabel)}</button>`
    });
    $('[data-cancel]', modal).addEventListener('click', () => { closeModal(); resolve(false); });
    $('[data-confirm]', modal).addEventListener('click', () => { closeModal(); resolve(true); });
  });
}

export function setLoading(container, isLoading, label = 'Loading…') {
  if (isLoading) {
    container.innerHTML = `<div class="loading-state"><span class="spinner"></span><span>${escapeHtml(label)}</span></div>`;
  }
}

export function emptyState(container, { icon: iconName = 'package', title, message, actionHtml = '' }) {
  import('./icons.js').then(({ icon }) => {
    container.innerHTML = `
      <div class="empty-state">
        ${icon(iconName, 'empty-state__icon')}
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(message)}</p>
        ${actionHtml}
      </div>`;
  });
}
