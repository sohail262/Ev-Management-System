import { getState, subscribe, locationName, providerName } from '../state.js';
import { icon } from '../icons.js';
import { escapeHtml, formatMoney, formatDate, openModal, closeModal, confirmDialog, toast, debounce, $ } from '../utils.js';
import { STATUS } from '../constants.js';
import { statusBadgeHtml, inLocation } from './helpers.js';
import { addEvUnits, updateEvUnit, deleteEvUnit, deleteEvUnitsBatch, transferEvUnit } from '../data/inventory.js';

let filters = { search: '', providerId: 'all', status: 'in-stock' };
let viewMode = 'grouped'; // 'grouped' (single row with quantity) or 'individual'

export function mount(root) {
  render(root);
  const unsub = subscribe(() => render(root));
  return unsub;
}

function render(root) {
  const state = getState();
  const lf = state.locationFilter;

  let items = state.evUnits.filter(e => inLocation(e, lf));
  if (filters.providerId !== 'all') items = items.filter(e => e.providerId === filters.providerId);
  if (filters.status !== 'all') items = items.filter(e => e.status === filters.status);
  if (filters.search) {
    const s = filters.search.toLowerCase();
    items = items.filter(e =>
      (e.chassisNo || '').toLowerCase().includes(s) ||
      (e.model || '').toLowerCase().includes(s) ||
      providerName(e.providerId).toLowerCase().includes(s)
    );
  }
  items.sort((a, b) => (b.dateAdded?.seconds || 0) - (a.dateAdded?.seconds || 0));

  const totalInStock = state.evUnits.filter(e => inLocation(e, lf) && e.status === STATUS.IN_STOCK).length;

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>EV Inventory</h2>
        <p>${lf === 'all' ? 'All locations' : locationName(lf)} · ${totalInStock} vehicle${totalInStock === 1 ? '' : 's'} in stock</p>
      </div>
      <div class="view-header__actions">
        <button class="btn btn--primary" id="add-ev-btn">${icon('plus')}<span class="btn-label-long">Add EV stock</span><span class="hide-lg" style="display:none">Add</span></button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="search-input" style="flex:1;">
        ${icon('search')}
        <input type="text" id="search-input" placeholder="Search brand, model or chassis no" value="${escapeHtml(filters.search)}">
      </div>
      <div class="field" style="min-width:160px;">
        <div class="select-wrap">
          <select id="filter-provider">
            <option value="all">All brands</option>
            ${state.providers.map(p => `<option value="${p.id}" ${filters.providerId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
          ${icon('chevronDown')}
        </div>
      </div>
      <div class="field" style="min-width:140px;">
        <div class="select-wrap">
          <select id="filter-status">
            <option value="in-stock" ${filters.status === 'in-stock' ? 'selected' : ''}>In stock</option>
            <option value="sold" ${filters.status === 'sold' ? 'selected' : ''}>Sold</option>
            <option value="all" ${filters.status === 'all' ? 'selected' : ''}>All statuses</option>
          </select>
          ${icon('chevronDown')}
        </div>
      </div>
      <div class="field" style="min-width:150px;">
        <div class="select-wrap">
          <select id="filter-view-mode">
            <option value="grouped" ${viewMode === 'grouped' ? 'selected' : ''}>Group by model (Qty)</option>
            <option value="individual" ${viewMode === 'individual' ? 'selected' : ''}>Individual units</option>
          </select>
          ${icon('chevronDown')}
        </div>
      </div>
    </div>

    <div id="ev-table"></div>
  `;

  if (viewMode === 'grouped') {
    renderGroupedTable(items, state);
  } else {
    renderIndividualTable(items, state);
  }

  $('#add-ev-btn').addEventListener('click', () => openEvForm(state));
  $('#search-input').addEventListener('input', debounce((e) => { filters.search = e.target.value; render(root); }, 200));
  $('#filter-provider').addEventListener('change', (e) => { filters.providerId = e.target.value; render(root); });
  $('#filter-status').addEventListener('change', (e) => { filters.status = e.target.value; render(root); });
  $('#filter-view-mode').addEventListener('change', (e) => { viewMode = e.target.value; render(root); });
}

function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

// ---------------- 1. Grouped View (By Model & Showroom) ----------------
function renderGroupedTable(items, state) {
  const host = $('#ev-table');
  const groupMap = new Map();

  items.forEach(e => {
    const cleanModel = (e.model || 'Standard').trim();
    const groupKey = `${e.providerId}__${cleanModel.toLowerCase()}__${e.locationId}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        groupKey,
        providerId: e.providerId,
        model: cleanModel,
        locationId: e.locationId,
        costPrice: e.costPrice || 0,
        sellingPrice: e.sellingPrice || 0,
        inStockUnits: [],
        soldUnits: [],
        allUnits: []
      });
    }

    const g = groupMap.get(groupKey);
    g.allUnits.push(e);
    if (e.status === STATUS.IN_STOCK) {
      g.inStockUnits.push(e);
    } else {
      g.soldUnits.push(e);
    }
  });

  let groups = Array.from(groupMap.values());
  if (filters.status === 'in-stock') {
    groups = groups.filter(g => g.inStockUnits.length > 0);
  } else if (filters.status === 'sold') {
    groups = groups.filter(g => g.soldUnits.length > 0);
  }
  groups.sort((a, b) => b.inStockUnits.length - a.inStockUnits.length || a.model.localeCompare(b.model));

  if (!groups.length) {
    host.innerHTML = `<div class="card"><div class="empty-state">${icon('ev', 'empty-state__icon')}<h4>No EVs found</h4><p>Try adjusting filters, or add new EV stock.</p></div></div>`;
    return;
  }

  host.innerHTML = `
    <div class="table-wrap table-wrap--responsive">
      <table>
        <thead>
          <tr>
            <th>Brand &amp; Model</th>
            <th>Showroom Location</th>
            <th class="num">In Stock (Qty)</th>
            <th class="num">Sold</th>
            <th class="num">Cost Price</th>
            <th class="num">Selling Price</th>
            <th>Chassis Numbers</th>
            <th>Status</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${groups.map(g => {
            const inStockQty = g.inStockUnits.length;
            const soldQty = g.soldUnits.length;
            const isAvailable = inStockQty > 0;
            return `
            <tr>
              <td data-label="Model" class="cell-strong">
                ${escapeHtml(providerName(g.providerId))}
                <div class="cell-muted">${escapeHtml(g.model)}</div>
              </td>
              <td data-label="Location">${escapeHtml(locationName(g.locationId))}</td>
              <td data-label="In Stock" class="num cell-strong" style="font-size:15px; color:var(--accent);">${inStockQty} unit${inStockQty === 1 ? '' : 's'}</td>
              <td data-label="Sold" class="num">${soldQty}</td>
              <td data-label="Cost" class="num">${formatMoney(g.costPrice)}</td>
              <td data-label="Selling" class="num">${formatMoney(g.sellingPrice)}</td>
              <td data-label="Chassis">
                ${inStockQty === 1 ? `
                  <span style="font-family:monospace; font-size:12px;">${escapeHtml(g.inStockUnits[0].chassisNo || '—')}</span>
                ` : inStockQty > 1 ? `
                  <button class="btn btn--secondary btn--sm view-chassis-btn" data-key="${g.groupKey}">
                    ${inStockQty} registered serials
                  </button>
                ` : '<span class="text-tiny text-muted">—</span>'}
              </td>
              <td data-label="Status">${isAvailable ? `<span class="badge badge--success">${inStockQty} IN STOCK</span>` : `<span class="badge badge--neutral">OUT OF STOCK</span>`}</td>
              <td class="cell-actions" style="text-align:right;">
                ${isAvailable ? `
                  <button class="btn btn--secondary btn--sm" data-transfer-group="${g.groupKey}" title="Transfer units to another shop">${icon('transfer')}<span>Transfer</span></button>
                  <button class="icon-btn" data-add-group="${g.groupKey}" title="Add more stock of this model">${icon('plus')}</button>
                  <button class="icon-btn icon-btn--danger" data-delete-group="${g.groupKey}" title="Delete / Remove stock">${icon('trash')}</button>
                ` : `<span class="text-tiny">—</span>`}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  // Wire Actions for Grouped View
  groups.forEach(g => {
    $(`[data-transfer-group="${g.groupKey}"]`, host)?.addEventListener('click', () => openGroupTransferModal(state, g));
    $(`[data-add-group="${g.groupKey}"]`, host)?.addEventListener('click', () => openQuickAddEvModal(state, g));
    $(`[data-delete-group="${g.groupKey}"]`, host)?.addEventListener('click', () => openGroupDeleteModal(state, g));
    $(`.view-chassis-btn[data-key="${g.groupKey}"]`, host)?.addEventListener('click', () => openChassisListModal(state, g));
  });
}

// ---------------- 2. Individual Units Table (Detailed View) ----------------
function renderIndividualTable(items, state) {
  const host = $('#ev-table');
  if (!items.length) {
    host.innerHTML = `<div class="card"><div class="empty-state">${icon('ev', 'empty-state__icon')}<h4>No EVs found</h4><p>Try adjusting filters, or add new EV stock.</p></div></div>`;
    return;
  }

  host.innerHTML = `
    <div class="table-wrap table-wrap--responsive">
      <table>
        <thead>
          <tr>
            <th>Brand &amp; Model</th>
            <th>Chassis No.</th>
            <th>Location</th>
            <th class="num">Cost</th>
            <th class="num">Selling</th>
            <th>Status</th>
            <th>Added</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(e => `
            <tr>
              <td data-label="Brand" class="cell-strong">
                ${escapeHtml(providerName(e.providerId))}
                <div class="cell-muted">${escapeHtml(e.model || 'Standard')}</div>
              </td>
              <td data-label="Chassis" style="font-family:monospace; font-size:12px;">${escapeHtml(e.chassisNo || '—')}</td>
              <td data-label="Location">${escapeHtml(locationName(e.locationId))}</td>
              <td data-label="Cost" class="num">${formatMoney(e.costPrice)}</td>
              <td data-label="Selling" class="num">${formatMoney(e.sellingPrice)}</td>
              <td data-label="Status">${statusBadgeHtml(e.status)}</td>
              <td data-label="Added">${formatDate(e.dateAdded)}</td>
              <td class="cell-actions" style="text-align:right;">
                ${e.status === STATUS.IN_STOCK ? `
                  <button class="icon-btn" data-transfer="${e.id}" title="Transfer">${icon('transfer')}</button>
                  <button class="icon-btn" data-edit="${e.id}" title="Edit">${icon('edit')}</button>
                  <button class="icon-btn icon-btn--danger" data-delete="${e.id}" title="Delete">${icon('trash')}</button>
                ` : `<span class="text-tiny">—</span>`}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  items.forEach(e => {
    $(`[data-edit="${e.id}"]`, host)?.addEventListener('click', () => openEvForm(state, e));
    $(`[data-delete="${e.id}"]`, host)?.addEventListener('click', async () => {
      if (await confirmDialog(`Delete this ${providerName(e.providerId)} unit? This cannot be undone.`)) {
        try {
          await deleteEvUnit(e);
          toast('EV removed', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    });
    $(`[data-transfer="${e.id}"]`, host)?.addEventListener('click', () => openIndividualTransferModal(state, e));
  });
}

// ---------------- Modals for Grouped EV View ----------------
function openGroupTransferModal(state, g) {
  const others = state.locations.filter(l => l.id !== g.locationId);
  const maxQty = g.inStockUnits.length;

  const modal = openModal({
    title: `Transfer EV: ${providerName(g.providerId)} ${g.model}`,
    size: 'sm',
    bodyHtml: `
      <form id="group-transfer-form">
        <p class="confirm-text mb-3">
          Transfer from <strong>${escapeHtml(locationName(g.locationId))}</strong> (${maxQty} available in stock).
        </p>
        <div class="field mb-3">
          <label>Quantity to transfer</label>
          <input name="qty" type="number" min="1" max="${maxQty}" value="${Math.min(maxQty, 1)}" required>
          <div class="hint">Available in stock: ${maxQty} unit${maxQty === 1 ? '' : 's'}</div>
        </div>
        <div class="field">
          <label>Transfer to Showroom</label>
          <div class="select-wrap">
            <select name="toLocationId" required>
              ${others.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('')}
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
      <button type="submit" form="group-transfer-form" class="btn btn--primary">${icon('transfer')}<span>Transfer</span></button>`
  });

  $('#group-transfer-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const qty = Math.max(1, parseInt(fd.get('qty')) || 1);
    const toLocationId = fd.get('toLocationId');
    const note = (fd.get('note') || '').trim();

    try {
      await transferEvUnit(g.inStockUnits[0], toLocationId, note, qty);
      closeModal();
      toast(`${qty} EV${qty > 1 ? 's' : ''} transferred to ${locationName(toLocationId)}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function openQuickAddEvModal(state, g) {
  const modal = openModal({
    title: `Add More ${providerName(g.providerId)} ${g.model}`,
    size: 'sm',
    bodyHtml: `
      <form id="quick-add-ev-form">
        <p class="confirm-text mb-3">Adding stock to <strong>${escapeHtml(locationName(g.locationId))}</strong>.</p>
        <div class="field mb-3">
          <label>Quantity to add</label>
          <input name="qty" type="number" min="1" step="1" value="5" required>
        </div>
        <div class="field mb-3">
          <label>Cost Price <span class="hint">(per unit)</span></label>
          <input name="costPrice" type="number" min="0" step="1" value="${g.costPrice || 0}" required>
        </div>
        <div class="field mb-3">
          <label>Selling Price <span class="hint">(per unit)</span></label>
          <input name="sellingPrice" type="number" min="0" step="1" value="${g.sellingPrice || 0}" required>
        </div>
        <div class="field">
          <label>Chassis Numbers <span class="hint">(optional, comma-separated)</span></label>
          <input name="chassisNo" placeholder="e.g. MD01, MD02, MD03...">
        </div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="quick-add-ev-form" class="btn btn--primary">${icon('plus')}<span>Add EV Stock</span></button>`
  });

  $('#quick-add-ev-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const qty = Math.max(1, parseInt(fd.get('qty')) || 1);
    const rawChassis = fd.get('chassisNo') || '';
    const chassisNos = rawChassis.includes(',') || rawChassis.includes('\n')
      ? rawChassis.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
      : (rawChassis.trim() ? [rawChassis.trim()] : []);

    try {
      await addEvUnits({
        providerId: g.providerId,
        model: g.model,
        chassisNos,
        locationId: g.locationId,
        costPrice: Number(fd.get('costPrice')),
        sellingPrice: Number(fd.get('sellingPrice')),
        qty
      });
      closeModal();
      toast(`${qty} EV${qty > 1 ? 's' : ''} added to stock`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function openGroupDeleteModal(state, g) {
  const maxQty = g.inStockUnits.length;
  const modal = openModal({
    title: `Remove ${providerName(g.providerId)} ${g.model} from Stock`,
    size: 'sm',
    bodyHtml: `
      <form id="delete-ev-group-form">
        <p class="confirm-text mb-3">
          Remove vehicles from <strong>${escapeHtml(locationName(g.locationId))}</strong> (${maxQty} available in stock).
        </p>
        <div class="field">
          <label>Quantity to remove</label>
          <input name="qty" type="number" min="1" max="${maxQty}" value="${maxQty}" required>
          <div class="hint">Enter how many units to delete from inventory.</div>
        </div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="delete-ev-group-form" class="btn btn--danger">${icon('trash')}<span>Delete Units</span></button>`
  });

  $('#delete-ev-group-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const qty = Math.max(1, parseInt(fd.get('qty')) || 1);
    const toDelete = g.inStockUnits.slice(0, qty).map(u => u.id);

    try {
      await deleteEvUnitsBatch(toDelete);
      closeModal();
      toast(`Removed ${toDelete.length} EV unit${toDelete.length === 1 ? '' : 's'}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function openChassisListModal(state, g) {
  const bodyHtml = `
    <p class="text-tiny mb-3">Registered chassis numbers for <strong>${escapeHtml(providerName(g.providerId))} ${escapeHtml(g.model)}</strong> at <strong>${escapeHtml(locationName(g.locationId))}</strong>:</p>
    <div class="table-wrap" style="max-height:260px; overflow-y:auto;">
      <table>
        <thead>
          <tr>
            <th>Chassis No.</th>
            <th>Status</th>
            <th class="num">Cost</th>
            <th class="num">Selling</th>
          </tr>
        </thead>
        <tbody>
          ${g.inStockUnits.map(u => `
            <tr>
              <td class="cell-strong" style="font-family:monospace; font-size:12px;">${escapeHtml(u.chassisNo || '—')}</td>
              <td><span class="badge badge--success">IN STOCK</span></td>
              <td class="num">${formatMoney(u.costPrice)}</td>
              <td class="num cell-strong">${formatMoney(u.sellingPrice)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  openModal({
    title: `${g.model} — Chassis Registry (${g.inStockUnits.length} in stock)`,
    bodyHtml,
    footerHtml: `<button type="button" class="btn btn--secondary" data-close-modal>Close</button>`,
    size: 'md'
  });
}

function openIndividualTransferModal(state, ev) {
  const others = state.locations.filter(l => l.id !== ev.locationId);
  const modal = openModal({
    title: `Transfer EV: ${providerName(ev.providerId)} ${ev.model || ''}`,
    size: 'sm',
    bodyHtml: `
      <form id="indiv-transfer-form">
        <p class="confirm-text mb-3">Transfer from <strong>${escapeHtml(locationName(ev.locationId))}</strong>.</p>
        <div class="field">
          <label>Transfer to</label>
          <div class="select-wrap">
            <select name="toLocationId" required>
              ${others.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('')}
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
      <button type="submit" form="indiv-transfer-form" class="btn btn--primary">${icon('transfer')}<span>Transfer</span></button>`
  });

  $('#indiv-transfer-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await transferEvUnit(ev, fd.get('toLocationId'), fd.get('note').trim(), 1);
      closeModal();
      toast('EV transferred', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function openEvForm(state, ev = null) {
  const isEdit = !!ev;
  const modal = openModal({
    title: isEdit ? 'Edit EV' : 'Add EV stock',
    size: 'lg',
    bodyHtml: `
      <form id="ev-form">
        <div class="form-grid">
          <div class="field">
            <label>Brand</label>
            <div class="select-wrap">
              <select name="providerId" required>
                ${state.providers.map(p => `<option value="${p.id}" ${ev?.providerId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
              </select>
              ${icon('chevronDown')}
            </div>
          </div>
          <div class="field">
            <label>Model <span class="hint">(optional)</span></label>
            <input name="model" value="${escapeHtml(ev?.model || '')}" placeholder="e.g. Zelio i-Praise+">
          </div>
          ${!isEdit ? `
          <div class="field">
            <label>Quantity</label>
            <input name="qty" type="number" min="1" step="1" value="1" required>
          </div>
          ` : ''}
          <div class="field">
            <label>Chassis / Serial No. <span class="hint">${isEdit ? '(optional)' : '(optional, comma-separated if multiple)'}</span></label>
            <input name="chassisNo" value="${escapeHtml(ev?.chassisNo || '')}" placeholder="${isEdit ? 'e.g. MD2A1234567' : 'e.g. MD2A01, MD2A02...'}">
          </div>
          <div class="field">
            <label>Shop location</label>
            <div class="select-wrap">
              <select name="locationId" required>
                ${state.locations.map(l => `<option value="${l.id}" ${(ev?.locationId || state.locationFilter) === l.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
              </select>
              ${icon('chevronDown')}
            </div>
          </div>
          <div class="field">
            <label>Cost price <span class="hint">(per unit)</span></label>
            <input name="costPrice" type="number" min="0" step="1" required value="${ev?.costPrice ?? ''}" placeholder="0">
          </div>
          <div class="field">
            <label>Selling price <span class="hint">(per unit)</span></label>
            <input name="sellingPrice" type="number" min="0" step="1" required value="${ev?.sellingPrice ?? ''}" placeholder="0">
          </div>
        </div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="ev-form" class="btn btn--primary">${isEdit ? 'Save changes' : 'Add EV stock'}</button>`
  });

  $('#ev-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const submitBtn = $('[form="ev-form"]');
    submitBtn.disabled = true;
    try {
      if (isEdit) {
        await updateEvUnit(ev.id, {
          providerId: fd.get('providerId'),
          model: fd.get('model').trim(),
          chassisNo: fd.get('chassisNo').trim(),
          locationId: fd.get('locationId'),
          costPrice: Number(fd.get('costPrice')),
          sellingPrice: Number(fd.get('sellingPrice'))
        });
        toast('EV updated', 'success');
      } else {
        const qty = Math.max(1, parseInt(fd.get('qty')) || 1);
        const rawChassis = fd.get('chassisNo') || '';
        const chassisNos = rawChassis.includes(',') || rawChassis.includes('\n')
          ? rawChassis.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
          : (rawChassis.trim() ? [rawChassis.trim()] : []);

        await addEvUnits({
          providerId: fd.get('providerId'),
          model: fd.get('model').trim(),
          chassisNos,
          locationId: fd.get('locationId'),
          costPrice: Number(fd.get('costPrice')),
          sellingPrice: Number(fd.get('sellingPrice')),
          qty
        });
        toast(`${qty} EV${qty > 1 ? 's' : ''} added to stock`, 'success');
      }
      closeModal();
    } catch (err) {
      toast(err.message, 'error');
      submitBtn.disabled = false;
    }
  });
}
