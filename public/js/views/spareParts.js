import { getState, subscribe, locationName } from '../state.js';
import { icon } from '../icons.js';
import { escapeHtml, formatMoney, formatDateTime, openModal, closeModal, confirmDialog, toast, debounce, $ } from '../utils.js';
import { SPARE_PART_CATEGORIES } from '../constants.js';
import {
  addSparePart, updateSparePart, deleteSparePart, restockSparePart, transferSparePart, listenSparePartLogs
} from '../data/inventory.js';

let search = '';

export function mount(root) {
  render(root);
  const unsub = subscribe(() => render(root));
  return unsub;
}

function render(root) {
  const state = getState();
  let items = state.spareParts;
  if (search) {
    const s = search.toLowerCase();
    items = items.filter(p => p.name.toLowerCase().includes(s) || (p.category || '').toLowerCase().includes(s));
  }
  items = [...items].sort((a, b) => a.name.localeCompare(b.name));

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Spare Parts</h2>
        <p>Centrally managed · ${items.length} part${items.length === 1 ? '' : 's'}</p>
      </div>
      <div class="view-header__actions">
        <button class="btn btn--primary" id="add-part-btn">${icon('plus')}<span>Add spare part</span></button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="search-input">
        ${icon('search')}
        <input type="text" id="search-input" placeholder="Search parts or category" value="${escapeHtml(search)}">
      </div>
    </div>

    <div id="parts-table"></div>
  `;

  renderTable(items, state);
  $('#add-part-btn').addEventListener('click', () => openPartForm());
  $('#search-input').addEventListener('input', debounce((e) => { search = e.target.value; render(root); }, 200));
}

function renderTable(items, state) {
  const host = $('#parts-table');
  if (!items.length) {
    host.innerHTML = `<div class="card"><div class="empty-state">${icon('package', 'empty-state__icon')}<h4>No spare parts yet</h4><p>Add spare parts to start tracking stock.</p></div></div>`;
    return;
  }
  host.innerHTML = `
    <div class="table-wrap table-wrap--responsive">
      <table>
        <thead><tr><th>Part</th><th>Category</th><th class="num">In stock</th><th class="num">Reorder at</th><th class="num">Cost</th><th class="num">Selling</th><th></th></tr></thead>
        <tbody>
          ${items.map(p => {
            const low = (p.quantity || 0) <= (p.reorderLevel || 0);
            return `
            <tr>
              <td data-label="Part" class="cell-strong">${escapeHtml(p.name)}</td>
              <td data-label="Category">${escapeHtml(p.category || '—')}</td>
              <td data-label="In stock" class="num">${low ? `<span class="badge badge--warning">${p.quantity}</span>` : p.quantity}</td>
              <td data-label="Reorder at" class="num">${p.reorderLevel}</td>
              <td data-label="Cost" class="num">${formatMoney(p.costPrice)}</td>
              <td data-label="Selling" class="num">${formatMoney(p.sellingPrice)}</td>
              <td class="cell-actions">
                ${(p.quantity || 0) > 0 ? `<button class="icon-btn" data-transfer="${p.id}" title="Transfer to shop">${icon('transfer')}</button>` : ''}
                <button class="icon-btn" data-restock="${p.id}" title="Restock">${icon('plus')}</button>
                <button class="icon-btn" data-log="${p.id}" title="Stock history">${icon('reports')}</button>
                <button class="icon-btn" data-edit="${p.id}" title="Edit">${icon('edit')}</button>
                <button class="icon-btn icon-btn--danger" data-delete="${p.id}" title="Delete">${icon('trash')}</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  items.forEach(p => {
    $(`[data-transfer="${p.id}"]`, host)?.addEventListener('click', () => openSparePartTransferModal(state, p));
    $(`[data-restock="${p.id}"]`, host)?.addEventListener('click', () => openRestockForm(p));
    $(`[data-log="${p.id}"]`, host)?.addEventListener('click', () => openLogModal(p));
    $(`[data-edit="${p.id}"]`, host)?.addEventListener('click', () => openPartForm(p));
    $(`[data-delete="${p.id}"]`, host)?.addEventListener('click', async () => {
      if (await confirmDialog(`Delete "${p.name}" from spare parts?`)) {
        try { await deleteSparePart(p.id); toast('Spare part deleted', 'success'); }
        catch (err) { toast(err.message, 'error'); }
      }
    });
  });
}

function openSparePartTransferModal(state, part) {
  const locations = state.locations;
  const maxQty = part.quantity || 0;

  const modal = openModal({
    title: `Transfer ${part.name}`,
    size: 'sm',
    bodyHtml: `
      <form id="spare-transfer-form">
        <p class="confirm-text mb-3">
          Transfer from Central Warehouse (${maxQty} pcs available).
        </p>
        <div class="field mb-3">
          <label>Quantity to transfer (pcs)</label>
          <input name="qty" type="number" min="1" max="${maxQty}" value="1" required>
          <div class="hint">Available in stock: ${maxQty} pcs</div>
        </div>
        <div class="field">
          <label>Transfer to Showroom</label>
          <div class="select-wrap">
            <select name="toLocationId" required>
              ${locations.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('')}
            </select>
            ${icon('chevronDown')}
          </div>
        </div>
        <div class="field mt-3">
          <label>Note <span class="hint">(optional)</span></label>
          <input name="note" placeholder="Reason for transfer">
        </div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="spare-transfer-form" class="btn btn--primary">${icon('transfer')}<span>Transfer</span></button>`
  });

  $('#spare-transfer-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const qty = Math.max(1, parseInt(fd.get('qty')) || 1);
    const toLocationId = fd.get('toLocationId');
    const note = (fd.get('note') || '').trim();

    try {
      await transferSparePart(part, toLocationId, qty, note);
      closeModal();
      toast(`${qty} pcs of ${part.name} transferred to ${locationName(toLocationId)}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function openPartForm(part = null) {
  const isEdit = !!part;
  const modal = openModal({
    title: isEdit ? 'Edit spare part' : 'Add spare part',
    bodyHtml: `
      <form id="part-form">
        <div class="form-grid">
          <div class="field field--full">
            <label>Part name</label>
            <input name="name" required value="${escapeHtml(part?.name || '')}" placeholder="e.g. Front brake shoe">
          </div>
          <div class="field">
            <label>Category</label>
            <div class="select-wrap">
              <select name="category" required>
                ${SPARE_PART_CATEGORIES.map(c => `<option value="${c}" ${part?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
              ${icon('chevronDown')}
            </div>
          </div>
          <div class="field">
            <label>Reorder level</label>
            <input name="reorderLevel" type="number" min="0" step="1" required value="${part?.reorderLevel ?? 5}">
          </div>
          <div class="field">
            <label>Cost price</label>
            <input name="costPrice" type="number" min="0" step="1" required value="${part?.costPrice ?? ''}">
          </div>
          <div class="field">
            <label>Selling price</label>
            <input name="sellingPrice" type="number" min="0" step="1" required value="${part?.sellingPrice ?? ''}">
          </div>
          ${!isEdit ? `
          <div class="field field--full">
            <label>Opening stock quantity</label>
            <input name="quantity" type="number" min="0" step="1" required value="0">
          </div>` : ''}
        </div>
        ${isEdit ? `<div class="form-note mt-3">${icon('info')}<span>To change quantity, use the restock action instead — it keeps the stock ledger accurate.</span></div>` : ''}
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="part-form" class="btn btn--primary">${isEdit ? 'Save changes' : 'Add part'}</button>`
  });
  $('#part-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      if (isEdit) {
        await updateSparePart(part.id, {
          name: fd.get('name').trim(),
          category: fd.get('category'),
          reorderLevel: Number(fd.get('reorderLevel')),
          costPrice: Number(fd.get('costPrice')),
          sellingPrice: Number(fd.get('sellingPrice'))
        });
        toast('Spare part updated', 'success');
      } else {
        await addSparePart({
          name: fd.get('name').trim(),
          category: fd.get('category'),
          reorderLevel: Number(fd.get('reorderLevel')),
          costPrice: Number(fd.get('costPrice')),
          sellingPrice: Number(fd.get('sellingPrice')),
          quantity: Number(fd.get('quantity'))
        });
        toast('Spare part added', 'success');
      }
      closeModal();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function openRestockForm(part) {
  const modal = openModal({
    title: `Restock "${part.name}"`,
    size: 'sm',
    bodyHtml: `
      <form id="restock-form">
        <p class="confirm-text mb-3">Current stock: <strong>${part.quantity}</strong></p>
        <div class="field">
          <label>Quantity to add</label>
          <input name="qty" type="number" min="1" step="1" required value="1">
        </div>
        <div class="field mt-3">
          <label>Note <span class="hint">(optional)</span></label>
          <input name="note" placeholder="e.g. Purchased from supplier">
        </div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="restock-form" class="btn btn--primary">Restock</button>`
  });
  $('#restock-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await restockSparePart(part, Number(fd.get('qty')), fd.get('note').trim() || 'Restock');
      closeModal();
      toast('Stock added', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
}

function openLogModal(part) {
  const modal = openModal({
    title: `Stock history — ${part.name}`,
    bodyHtml: `<div id="log-list" class="loading-state"><span class="spinner"></span><span>Loading…</span></div>`,
    footerHtml: `<button type="button" class="btn btn--secondary" data-close-modal>Close</button>`
  });
  const unsub = listenSparePartLogs(part.id, (logs) => {
    logs = [...logs].sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
    const host = $('#log-list', modal);
    if (!host) { unsub(); return; }
    if (!logs.length) {
      host.innerHTML = `<div class="empty-state">${icon('reports', 'empty-state__icon')}<h4>No movement yet</h4></div>`;
      return;
    }
    host.innerHTML = `<ul>${logs.map(l => `
      <li class="alert-row">
        ${icon(l.type === 'in' ? 'plus' : 'sales')}
        <div>
          <div class="alert-row__title">${l.type === 'in' ? 'Stock in' : 'Stock out'} — ${l.note || ''}</div>
          <div class="alert-row__sub">${formatDateTime(l.date)}</div>
        </div>
        <div class="alert-row__count" style="color:${l.type === 'in' ? 'var(--success)' : 'var(--danger)'}">${l.type === 'in' ? '+' : '-'}${l.qty}</div>
      </li>`).join('')}</ul>`;
  });
}
