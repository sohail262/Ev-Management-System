import { getState, subscribe, locationName } from '../state.js';
import { icon } from '../icons.js';
import { escapeHtml, formatMoney, formatDate, openModal, closeModal, confirmDialog, toast, $ } from '../utils.js';
import { CHARGER_WATTAGES, BATTERY_TYPES, BATTERY_UNIT_WATTAGE, STATUS } from '../constants.js';
import { statusBadgeHtml, inLocation } from './helpers.js';
import { addUnits, deleteUnit, deleteUnitsBatch, transferUnit } from '../data/inventory.js';

let activeType = 'battery';
let filters = { batteryType: 'all', wattage: 'all', status: 'in-stock' };

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
  if (activeType === 'battery') {
    if (filters.batteryType !== 'all') {
      items = items.filter(u => (u.batteryType || 'Lead Battery') === filters.batteryType);
    }
  } else {
    if (filters.wattage !== 'all') {
      items = items.filter(u => String(u.wattage) === filters.wattage);
    }
  }
  if (filters.status !== 'all') items = items.filter(u => u.status === filters.status);

  const battInStock = state.batteryUnits.filter(u => inLocation(u, lf) && u.status === STATUS.IN_STOCK).length;
  const chgInStock = state.chargerUnits.filter(u => inLocation(u, lf) && u.status === STATUS.IN_STOCK).length;

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Batteries &amp; Chargers</h2>
        <p>${lf === 'all' ? 'All locations' : locationName(lf)} · grouped inventory by item &amp; showroom</p>
      </div>
      <div class="view-header__actions">
        <button class="btn btn--primary" id="add-unit-btn">${icon('plus')}<span>Add ${activeType} stock</span></button>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn ${activeType === 'battery' ? 'is-active' : ''}" data-type="battery">${icon('battery')} Batteries (${battInStock} in stock)</button>
      <button class="tab-btn ${activeType === 'charger' ? 'is-active' : ''}" data-type="charger">${icon('charger')} Chargers (${chgInStock} in stock)</button>
    </div>

    <div class="filter-bar">
      ${activeType === 'battery' ? `
      <div class="field" style="min-width:170px;">
        <div class="select-wrap">
          <select id="filter-type-select">
            <option value="all">All battery types</option>
            ${BATTERY_TYPES.map(t => `<option value="${t}" ${filters.batteryType === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
          ${icon('chevronDown')}
        </div>
      </div>` : `
      <div class="field" style="min-width:150px;">
        <div class="select-wrap">
          <select id="filter-wattage-select">
            <option value="all">All wattages</option>
            ${CHARGER_WATTAGES.map(w => `<option value="${w}" ${filters.wattage === String(w) ? 'selected' : ''}>${w}W</option>`).join('')}
          </select>
          ${icon('chevronDown')}
        </div>
      </div>`}
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

  $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    activeType = btn.dataset.type;
    render(root);
  }));
  $('#add-unit-btn').addEventListener('click', () => openAddForm(state));
  if (activeType === 'battery') {
    $('#filter-type-select')?.addEventListener('change', (e) => { filters.batteryType = e.target.value; render(root); });
  } else {
    $('#filter-wattage-select')?.addEventListener('change', (e) => { filters.wattage = e.target.value; render(root); });
  }
  $('#filter-status').addEventListener('change', (e) => { filters.status = e.target.value; render(root); });
}
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

function renderTable(items, state) {
  const host = $('#unit-table');
  const isBattery = activeType === 'battery';

  // Group items by: item identity + location
  const groupMap = new Map();

  items.forEach(u => {
    const itemKey = isBattery
      ? (u.batteryType || 'Lead Battery')
      : `${u.wattage || 48}W Charger`;
    const groupKey = `${itemKey}__${u.locationId}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        groupKey,
        itemKey,
        itemType: activeType,
        batteryType: u.batteryType || 'Lead Battery',
        wattage: Number(u.wattage) || (isBattery ? 12 : 48),
        locationId: u.locationId,
        costPrice: u.costPrice || 0,
        sellingPrice: u.sellingPrice || 0,
        inStockUnits: [],
        soldUnits: [],
        allUnits: []
      });
    }

    const g = groupMap.get(groupKey);
    g.allUnits.push(u);
    if (u.status === STATUS.IN_STOCK) {
      g.inStockUnits.push(u);
    } else {
      g.soldUnits.push(u);
    }
  });

  let groups = Array.from(groupMap.values());
  if (filters.status === 'in-stock') {
    groups = groups.filter(g => g.inStockUnits.length > 0);
  } else if (filters.status === 'sold') {
    groups = groups.filter(g => g.soldUnits.length > 0);
  }
  groups.sort((a, b) => b.inStockUnits.length - a.inStockUnits.length || a.itemKey.localeCompare(b.itemKey));

  if (!groups.length) {
    host.innerHTML = `<div class="card"><div class="empty-state">${icon(activeType, 'empty-state__icon')}<h4>No ${activeType === 'battery' ? 'batteries' : 'chargers'} found</h4><p>Try adjusting filters, or add new stock.</p></div></div>`;
    return;
  }

  host.innerHTML = `
    <div class="table-wrap table-wrap--responsive">
      <table>
        <thead>
          <tr>
            <th>${isBattery ? 'Battery Type' : 'Wattage'}</th>
            ${isBattery ? '<th>Unit Rating</th>' : ''}
            <th>Showroom Location</th>
            <th class="num">In Stock (Qty)</th>
            <th class="num">Sold</th>
            <th class="num">Cost Price</th>
            <th class="num">Selling Price</th>
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
              <td data-label="Type" class="cell-strong">${escapeHtml(g.itemKey)}</td>
              ${isBattery ? `<td data-label="Unit Rating"><span class="badge badge--info">${BATTERY_UNIT_WATTAGE}W</span> <span class="text-tiny text-muted">(${inStockQty * BATTERY_UNIT_WATTAGE}W total)</span></td>` : ''}
              <td data-label="Location">${escapeHtml(locationName(g.locationId))}</td>
              <td data-label="In Stock" class="num cell-strong" style="font-size:15px; color:var(--accent);">${inStockQty} unit${inStockQty === 1 ? '' : 's'}</td>
              <td data-label="Sold" class="num">${soldQty}</td>
              <td data-label="Cost" class="num">${formatMoney(g.costPrice)}</td>
              <td data-label="Selling" class="num">${formatMoney(g.sellingPrice)}</td>
              <td data-label="Status">${isAvailable ? `<span class="badge badge--success">${inStockQty} IN STOCK</span>` : `<span class="badge badge--neutral">OUT OF STOCK</span>`}</td>
              <td class="cell-actions" style="text-align:right;">
                ${isAvailable ? `
                  <button class="btn btn--secondary btn--sm" data-transfer-group="${g.groupKey}" title="Transfer units to another shop">${icon('transfer')}<span>Transfer</span></button>
                  <button class="icon-btn" data-add-group="${g.groupKey}" title="Add more stock of this item">${icon('plus')}</button>
                  <button class="icon-btn icon-btn--danger" data-delete-group="${g.groupKey}" title="Delete / Reduce stock">${icon('trash')}</button>
                ` : `<span class="text-tiny">—</span>`}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  // Wire Actions
  groups.forEach(g => {
    $(`[data-transfer-group="${g.groupKey}"]`, host)?.addEventListener('click', () => openGroupTransferForm(state, g));
    $(`[data-add-group="${g.groupKey}"]`, host)?.addEventListener('click', () => openQuickAddModal(state, g));
    $(`[data-delete-group="${g.groupKey}"]`, host)?.addEventListener('click', () => openDeleteModal(state, g));
  });
}

function openGroupTransferForm(state, g) {
  const others = state.locations.filter(l => l.id !== g.locationId);
  const maxQty = g.inStockUnits.length;

  const modal = openModal({
    title: `Transfer ${g.itemKey}`,
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
      await transferUnit(activeType, g.inStockUnits[0], toLocationId, note, qty);
      closeModal();
      toast(`${qty} ${g.itemKey} transferred to ${locationName(toLocationId)}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function openQuickAddModal(state, g) {
  const isBattery = activeType === 'battery';
  const modal = openModal({
    title: `Add More ${g.itemKey}`,
    size: 'sm',
    bodyHtml: `
      <form id="quick-add-form">
        <p class="confirm-text mb-3">Adding more units to <strong>${escapeHtml(locationName(g.locationId))}</strong>.</p>
        <div class="field mb-3">
          <label>Quantity to Add</label>
          <input name="qty" type="number" min="1" step="1" value="10" required>
        </div>
        <div class="field mb-3">
          <label>Cost Price <span class="hint">(per unit)</span></label>
          <input name="costPrice" type="number" min="0" step="1" value="${g.costPrice || 0}" required>
        </div>
        <div class="field">
          <label>Selling Price <span class="hint">(per unit)</span></label>
          <input name="sellingPrice" type="number" min="0" step="1" value="${g.sellingPrice || 0}" required>
        </div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="quick-add-form" class="btn btn--primary">${icon('plus')}<span>Add Stock</span></button>`
  });

  $('#quick-add-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const qty = Math.max(1, parseInt(fd.get('qty')) || 1);
    try {
      if (isBattery) {
        await addUnits('battery', {
          batteryType: g.batteryType,
          costPrice: Number(fd.get('costPrice')),
          sellingPrice: Number(fd.get('sellingPrice')),
          locationId: g.locationId,
          qty
        });
      } else {
        await addUnits('charger', {
          wattage: g.wattage,
          costPrice: Number(fd.get('costPrice')),
          sellingPrice: Number(fd.get('sellingPrice')),
          locationId: g.locationId,
          qty
        });
      }
      closeModal();
      toast(`${qty} ${g.itemKey} added to stock`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function openDeleteModal(state, g) {
  const maxQty = g.inStockUnits.length;
  const modal = openModal({
    title: `Remove ${g.itemKey} from Stock`,
    size: 'sm',
    bodyHtml: `
      <form id="delete-units-form">
        <p class="confirm-text mb-3">
          Remove units from <strong>${escapeHtml(locationName(g.locationId))}</strong> (${maxQty} available in stock).
        </p>
        <div class="field">
          <label>Quantity to remove</label>
          <input name="qty" type="number" min="1" max="${maxQty}" value="${maxQty}" required>
          <div class="hint">Enter how many units to delete from inventory.</div>
        </div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="delete-units-form" class="btn btn--danger">${icon('trash')}<span>Delete Units</span></button>`
  });

  $('#delete-units-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const qty = Math.max(1, parseInt(fd.get('qty')) || 1);
    const toDelete = g.inStockUnits.slice(0, qty).map(u => u.id);

    try {
      await deleteUnitsBatch(activeType, toDelete);
      closeModal();
      toast(`Removed ${toDelete.length} ${g.itemKey} unit${toDelete.length === 1 ? '' : 's'}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function openAddForm(state) {
  const isBattery = activeType === 'battery';
  const modal = openModal({
    title: `Add ${isBattery ? 'battery' : 'charger'} stock`,
    bodyHtml: `
      <form id="unit-form">
        <div class="form-grid">
          ${isBattery ? `
          <div class="field">
            <label>Battery Type</label>
            <div class="select-wrap">
              <select name="batteryType" required>
                ${BATTERY_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
              </select>
              ${icon('chevronDown')}
            </div>
          </div>
          <div class="field">
            <label>Quantity <span class="hint">(each battery is 12W)</span></label>
            <input name="qty" id="unit-qty" type="number" min="1" step="1" value="1" required>
          </div>
          <div class="field field--full" id="batt-watt-info">
            <div class="form-note">${icon('info')}<span>1 unit × 12W = 12W combined rating</span></div>
          </div>
          ` : `
          <div class="field">
            <label>Charger Wattage</label>
            <div class="select-wrap">
              <select name="wattage" required>
                ${CHARGER_WATTAGES.map(w => `<option value="${w}">${w}W</option>`).join('')}
              </select>
              ${icon('chevronDown')}
            </div>
          </div>
          <div class="field">
            <label>Quantity</label>
            <input name="qty" id="unit-qty" type="number" min="1" step="1" value="1" required>
          </div>
          `}
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

  if (isBattery) {
    const qtyInput = $('#unit-qty', modal);
    const infoHost = $('#batt-watt-info', modal);
    qtyInput.addEventListener('input', () => {
      const q = Math.max(1, parseInt(qtyInput.value) || 1);
      infoHost.innerHTML = `<div class="form-note">${icon('info')}<span>${q} unit${q > 1 ? 's' : ''} × 12W = <strong>${q * BATTERY_UNIT_WATTAGE}W</strong> combined rating</span></div>`;
    });
  }

  $('#unit-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const submitBtn = $('[form="unit-form"]');
    submitBtn.disabled = true;
    try {
      if (isBattery) {
        await addUnits('battery', {
          batteryType: fd.get('batteryType'),
          costPrice: Number(fd.get('costPrice')),
          sellingPrice: Number(fd.get('sellingPrice')),
          locationId: fd.get('locationId'),
          qty: Number(fd.get('qty'))
        });
      } else {
        await addUnits('charger', {
          wattage: Number(fd.get('wattage')),
          costPrice: Number(fd.get('costPrice')),
          sellingPrice: Number(fd.get('sellingPrice')),
          locationId: fd.get('locationId'),
          qty: Number(fd.get('qty'))
        });
      }
      closeModal();
      toast('Stock added', 'success');
    } catch (err) {
      toast(err.message, 'error');
      submitBtn.disabled = false;
    }
  });
}
