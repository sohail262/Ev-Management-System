import { getState, subscribe, locationName, providerName } from '../state.js';
import { icon } from '../icons.js';
import { escapeHtml, formatMoney, formatDate, openModal, closeModal, confirmDialog, toast, debounce, $ } from '../utils.js';
import { WATTAGES, STATUS } from '../constants.js';
import { statusBadgeHtml, inLocation } from './helpers.js';
import { addEvUnitWithBundle, updateEvUnit, deleteEvUnit, transferEvUnit } from '../data/inventory.js';

let filters = { search: '', providerId: 'all', status: 'all' };

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
    items = items.filter(e => (e.chassisNo || '').toLowerCase().includes(s) || (e.model || '').toLowerCase().includes(s) || providerName(e.providerId).toLowerCase().includes(s));
  }
  items.sort((a, b) => (b.dateAdded?.seconds || 0) - (a.dateAdded?.seconds || 0));

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>EV Inventory</h2>
        <p>${lf === 'all' ? 'All locations' : locationName(lf)} · ${items.length} vehicle${items.length === 1 ? '' : 's'}</p>
      </div>
      <div class="view-header__actions">
        <button class="btn btn--primary" id="add-ev-btn">${icon('plus')}<span class="btn-label-long">Add EV stock</span><span class="hide-lg" style="display:none">Add</span></button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="search-input">
        ${icon('search')}
        <input type="text" id="search-input" placeholder="Search chassis no, model or brand" value="${escapeHtml(filters.search)}">
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
      <div class="field" style="min-width:150px;">
        <div class="select-wrap">
          <select id="filter-status">
            <option value="all">All statuses</option>
            <option value="in-stock" ${filters.status === 'in-stock' ? 'selected' : ''}>In stock</option>
            <option value="sold" ${filters.status === 'sold' ? 'selected' : ''}>Sold</option>
          </select>
          ${icon('chevronDown')}
        </div>
      </div>
    </div>

    <div id="ev-table"></div>
  `;

  renderTable(items, state);

  $('#add-ev-btn').addEventListener('click', () => openEvForm(state));
  $('#search-input').addEventListener('input', debounce((e) => { filters.search = e.target.value; render(root); }, 200));
  $('#filter-provider').addEventListener('change', (e) => { filters.providerId = e.target.value; render(root); });
  $('#filter-status').addEventListener('change', (e) => { filters.status = e.target.value; render(root); });
}

function renderTable(items, state) {
  const host = $('#ev-table');
  if (!items.length) {
    host.innerHTML = `<div class="card"><div class="empty-state">${icon('ev', 'empty-state__icon')}<h4>No EVs found</h4><p>Try adjusting filters, or add new EV stock.</p></div></div>`;
    return;
  }
  host.innerHTML = `
    <div class="table-wrap table-wrap--responsive">
      <table>
        <thead>
          <tr><th>Brand / Model</th><th>Chassis No.</th><th>Location</th><th>Bundle</th><th class="num">Cost</th><th class="num">Selling</th><th>Status</th><th>Added</th><th></th></tr>
        </thead>
        <tbody>
          ${items.map(e => `
            <tr>
              <td data-label="Brand" class="cell-strong">${escapeHtml(providerName(e.providerId))}${e.model ? `<div class="cell-muted">${escapeHtml(e.model)}</div>` : ''}</td>
              <td data-label="Chassis">${escapeHtml(e.chassisNo || '—')}</td>
              <td data-label="Location">${escapeHtml(locationName(e.locationId))}</td>
              <td data-label="Bundle"><span class="badge badge--info">${e.bundleWattage}W battery + charger</span></td>
              <td data-label="Cost" class="num">${formatMoney(e.costPrice)}</td>
              <td data-label="Selling" class="num">${formatMoney(e.sellingPrice)}</td>
              <td data-label="Status">${statusBadgeHtml(e.status)}</td>
              <td data-label="Added">${formatDate(e.dateAdded)}</td>
              <td class="cell-actions">
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
      if (await confirmDialog(`Delete this ${providerName(e.providerId)} unit and its bundled battery/charger? This cannot be undone.`)) {
        try { await deleteEvUnit(e); toast('EV removed', 'success'); }
        catch (err) { toast(err.message, 'error'); }
      }
    });
    $(`[data-transfer="${e.id}"]`, host)?.addEventListener('click', () => openTransferForm(state, e));
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
          <div class="field">
            <label>Chassis / Serial No. <span class="hint">(optional)</span></label>
            <input name="chassisNo" value="${escapeHtml(ev?.chassisNo || '')}" placeholder="e.g. MD2A1234567">
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
            <label>Cost price</label>
            <input name="costPrice" type="number" min="0" step="1" required value="${ev?.costPrice ?? ''}" placeholder="0">
          </div>
          <div class="field">
            <label>Selling price</label>
            <input name="sellingPrice" type="number" min="0" step="1" required value="${ev?.sellingPrice ?? ''}" placeholder="0">
          </div>
        </div>

        ${!isEdit ? `
        <div class="mt-4" style="border-top:1px solid var(--border);padding-top:16px;">
          <div class="field mb-3"><label>Bundled battery &amp; charger <span class="hint">(comes with this EV as received from the manufacturer)</span></label></div>
          <div class="form-grid">
            <div class="field">
              <label>Wattage</label>
              <div class="select-wrap">
                <select name="bundleWattage" required>
                  ${WATTAGES.map(w => `<option value="${w}">${w}W</option>`).join('')}
                </select>
                ${icon('chevronDown')}
              </div>
            </div>
            <div></div>
            <div class="field">
              <label>Battery cost price</label>
              <input name="bundleBatteryCost" type="number" min="0" step="1" value="0">
            </div>
            <div class="field">
              <label>Battery selling price</label>
              <input name="bundleBatteryPrice" type="number" min="0" step="1" value="0">
            </div>
            <div class="field">
              <label>Charger cost price</label>
              <input name="bundleChargerCost" type="number" min="0" step="1" value="0">
            </div>
            <div class="field">
              <label>Charger selling price</label>
              <input name="bundleChargerPrice" type="number" min="0" step="1" value="0">
            </div>
          </div>
        </div>` : `<div class="form-note mt-3">${icon('info')}<span>The bundled battery &amp; charger wattage can't be changed here — manage them from the Batteries &amp; Chargers section.</span></div>`}
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="ev-form" class="btn btn--primary">${isEdit ? 'Save changes' : 'Add EV'}</button>`
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
        await addEvUnitWithBundle({
          providerId: fd.get('providerId'),
          model: fd.get('model').trim(),
          chassisNo: fd.get('chassisNo').trim(),
          locationId: fd.get('locationId'),
          costPrice: Number(fd.get('costPrice')),
          sellingPrice: Number(fd.get('sellingPrice')),
          bundleWattage: Number(fd.get('bundleWattage')),
          bundleBatteryCost: Number(fd.get('bundleBatteryCost') || 0),
          bundleBatteryPrice: Number(fd.get('bundleBatteryPrice') || 0),
          bundleChargerCost: Number(fd.get('bundleChargerCost') || 0),
          bundleChargerPrice: Number(fd.get('bundleChargerPrice') || 0)
        });
        toast('EV added to stock', 'success');
      }
      closeModal();
    } catch (err) {
      toast(err.message, 'error');
      submitBtn.disabled = false;
    }
  });
}

function openTransferForm(state, ev) {
  const others = state.locations.filter(l => l.id !== ev.locationId);
  const modal = openModal({
    title: 'Transfer EV',
    size: 'sm',
    bodyHtml: `
      <form id="transfer-form">
        <p class="confirm-text mb-3">Move this ${escapeHtml(providerName(ev.providerId))} unit (with its bundled battery &amp; charger) to another shop.</p>
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
      await transferEvUnit(ev, fd.get('toLocationId'), fd.get('note').trim());
      closeModal();
      toast('EV transferred', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
}
