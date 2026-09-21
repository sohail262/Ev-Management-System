import { getState, subscribe, locationName } from '../state.js';
import { icon } from '../icons.js';
import { escapeHtml, formatMoney, formatDate, openModal, closeModal, confirmDialog, toast, $ } from '../utils.js';
import { WATTAGES, STATUS } from '../constants.js';
import { statusBadgeHtml, inLocation } from './helpers.js';
import { addUnits, deleteUnit, transferUnit } from '../data/inventory.js';

let activeType = 'battery';
let filters = { wattage: 'all', status: 'in-stock' };

export function mount(root) {
  render(root);
  const unsub = subscribe(() => render(root));
  return unsub;
}

function render(root) {
  const state = getState();
  const lf = state.locationFilter;
  const allUnits = activeType === 'battery' ? state.batteryUnits : state.chargerUnits;

  let items = allUnits.filter(u => inLocation(u, lf));
  if (filters.wattage !== 'all') items = items.filter(u => String(u.wattage) === filters.wattage);
  if (filters.status !== 'all') items = items.filter(u => u.status === filters.status);
  items.sort((a, b) => (b.dateAdded?.seconds || 0) - (a.dateAdded?.seconds || 0));

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Batteries &amp; Chargers</h2>
        <p>${lf === 'all' ? 'All locations' : locationName(lf)} · individually tracked units</p>
      </div>
      <div class="view-header__actions">
        <button class="btn btn--primary" id="add-unit-btn">${icon('plus')}<span>Add stock</span></button>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn ${activeType === 'battery' ? 'is-active' : ''}" data-type="battery">${icon('battery')} Batteries (${state.batteryUnits.filter(u => inLocation(u, lf) && u.status === STATUS.IN_STOCK).length} in stock)</button>
      <button class="tab-btn ${activeType === 'charger' ? 'is-active' : ''}" data-type="charger">${icon('charger')} Chargers (${state.chargerUnits.filter(u => inLocation(u, lf) && u.status === STATUS.IN_STOCK).length} in stock)</button>
    </div>

    <div class="filter-bar">
      <div class="field" style="min-width:140px;">
        <div class="select-wrap">
          <select id="filter-wattage">
            <option value="all">All wattages</option>
            ${WATTAGES.map(w => `<option value="${w}" ${filters.wattage === String(w) ? 'selected' : ''}>${w}W</option>`).join('')}
          </select>
          ${icon('chevronDown')}
        </div>
      </div>
      <div class="field" style="min-width:150px;">
        <div class="select-wrap">
          <select id="filter-status">
            <option value="in-stock" ${filters.status === 'in-stock' ? 'selected' : ''}>In stock</option>
            <option value="sold" ${filters.status === 'sold' ? 'selected' : ''}>Sold</option>
            <option value="all" ${filters.status === 'all' ? 'selected' : ''}>All statuses</option>
          </select>
          ${icon('chevronDown')}
        </div>
      </div>
    </div>

    <div id="unit-table"></div>
  `;

  renderTable(items, state);

  $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => { activeType = btn.dataset.type; render(root); }));
  $('#add-unit-btn').addEventListener('click', () => openAddForm(state));
  $('#filter-wattage').addEventListener('change', (e) => { filters.wattage = e.target.value; render(root); });
  $('#filter-status').addEventListener('change', (e) => { filters.status = e.target.value; render(root); });
}
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

function renderTable(items, state) {
  const host = $('#unit-table');
  if (!items.length) {
    host.innerHTML = `<div class="card"><div class="empty-state">${icon(activeType, 'empty-state__icon')}<h4>No ${activeType === 'battery' ? 'batteries' : 'chargers'} found</h4><p>Try adjusting filters, or add new stock.</p></div></div>`;
    return;
  }
  host.innerHTML = `
    <div class="table-wrap table-wrap--responsive">
      <table>
        <thead><tr><th>Wattage</th><th>Source</th><th>Location</th><th class="num">Cost</th><th class="num">Selling</th><th>Status</th><th>Added</th><th></th></tr></thead>
        <tbody>
          ${items.map(u => `
            <tr>
              <td data-label="Wattage" class="cell-strong">${u.wattage}W</td>
              <td data-label="Source">${u.source === 'bundle' ? '<span class="badge badge--muted">EV bundle</span>' : '<span class="badge badge--muted">Stock purchase</span>'}</td>
              <td data-label="Location">${escapeHtml(locationName(u.locationId))}</td>
              <td data-label="Cost" class="num">${formatMoney(u.costPrice)}</td>
              <td data-label="Selling" class="num">${formatMoney(u.sellingPrice)}</td>
              <td data-label="Status">${statusBadgeHtml(u.status)}</td>
              <td data-label="Added">${formatDate(u.dateAdded)}</td>
              <td class="cell-actions">
                ${u.status === STATUS.IN_STOCK ? `
                  <button class="icon-btn" data-transfer="${u.id}" title="Transfer">${icon('transfer')}</button>
                  ${u.source !== 'bundle' ? `<button class="icon-btn icon-btn--danger" data-delete="${u.id}" title="Delete">${icon('trash')}</button>` : ''}
                ` : `<span class="text-tiny">—</span>`}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  items.forEach(u => {
    $(`[data-transfer="${u.id}"]`, host)?.addEventListener('click', () => openTransferForm(state, u));
    $(`[data-delete="${u.id}"]`, host)?.addEventListener('click', async () => {
      if (await confirmDialog(`Delete this ${u.wattage}W ${activeType}?`)) {
        try { await deleteUnit(activeType, u.id); toast('Deleted', 'success'); }
        catch (err) { toast(err.message, 'error'); }
      }
    });
  });
}

function openAddForm(state) {
  const modal = openModal({
    title: `Add ${activeType === 'battery' ? 'battery' : 'charger'} stock`,
    bodyHtml: `
      <form id="unit-form">
        <div class="form-grid">
          <div class="field">
            <label>Wattage</label>
            <div class="select-wrap">
              <select name="wattage" required>
                ${WATTAGES.map(w => `<option value="${w}">${w}W</option>`).join('')}
              </select>
              ${icon('chevronDown')}
            </div>
          </div>
          <div class="field">
            <label>Quantity</label>
            <input name="qty" type="number" min="1" step="1" value="1" required>
          </div>
          <div class="field">
            <label>Shop location</label>
            <div class="select-wrap">
              <select name="locationId" required>
                ${state.locations.map(l => `<option value="${l.id}" ${state.locationFilter === l.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
              </select>
              ${icon('chevronDown')}
            </div>
          </div>
          <div></div>
          <div class="field">
            <label>Cost price <span class="hint">(per unit)</span></label>
            <input name="costPrice" type="number" min="0" step="1" required value="0">
          </div>
          <div class="field">
            <label>Selling price <span class="hint">(per unit)</span></label>
            <input name="sellingPrice" type="number" min="0" step="1" required value="0">
          </div>
        </div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="unit-form" class="btn btn--primary">Add stock</button>`
  });
  $('#unit-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await addUnits(activeType, {
        wattage: Number(fd.get('wattage')),
        costPrice: Number(fd.get('costPrice')),
        sellingPrice: Number(fd.get('sellingPrice')),
        locationId: fd.get('locationId'),
        qty: Number(fd.get('qty'))
      });
      closeModal();
      toast('Stock added', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
}

function openTransferForm(state, unit) {
  const others = state.locations.filter(l => l.id !== unit.locationId);
  const modal = openModal({
    title: `Transfer ${unit.wattage}W ${activeType}`,
    size: 'sm',
    bodyHtml: `
      <form id="transfer-form">
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
      <button type="submit" form="transfer-form" class="btn btn--primary">${icon('transfer')}<span>Transfer</span></button>`
  });
  $('#transfer-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await transferUnit(activeType, unit, fd.get('toLocationId'), fd.get('note').trim());
      closeModal();
      toast('Transferred', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
}
