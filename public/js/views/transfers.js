import { getState, subscribe, locationName, providerName } from '../state.js';
import { icon } from '../icons.js';
import { escapeHtml, formatDateTime, openModal, closeModal, toast, $ } from '../utils.js';
import { STATUS, BATTERY_TYPES, CHARGER_WATTAGES } from '../constants.js';
import { createDirectTransfer, transferSparePart } from '../data/inventory.js';

let filters = { itemType: 'all', locationId: 'all' };

export function mount(root) {
  render(root);
  return subscribe(() => render(root));
}

function render(root) {
  const state = getState();
  let items = state.transfers;
  if (filters.itemType !== 'all') items = items.filter(t => t.itemType === filters.itemType);
  if (filters.locationId !== 'all') items = items.filter(t => t.fromLocationId === filters.locationId || t.toLocationId === filters.locationId);
  items = [...items].sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Stock Transfers</h2>
        <p>${items.length} transfer${items.length === 1 ? '' : 's'} recorded between shops</p>
      </div>
      <div class="view-header__actions">
        <button class="btn btn--primary" id="btn-new-transfer">${icon('transfer')}<span>New Transfer</span></button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="field" style="min-width:150px;">
        <div class="select-wrap">
          <select id="filter-type">
            <option value="all">All item types</option>
            <option value="ev" ${filters.itemType === 'ev' ? 'selected' : ''}>EVs</option>
            <option value="battery" ${filters.itemType === 'battery' ? 'selected' : ''}>Batteries</option>
            <option value="charger" ${filters.itemType === 'charger' ? 'selected' : ''}>Chargers</option>
            <option value="sparepart" ${filters.itemType === 'sparepart' ? 'selected' : ''}>Spare Parts</option>
          </select>
          ${icon('chevronDown')}
        </div>
      </div>
      <div class="field" style="min-width:170px;">
        <div class="select-wrap">
          <select id="filter-loc">
            <option value="all">All locations</option>
            ${state.locations.map(l => `<option value="${l.id}" ${filters.locationId === l.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
          </select>
          ${icon('chevronDown')}
        </div>
      </div>
    </div>

    <div id="transfer-table"></div>
  `;

  const host = $('#transfer-table', root);
  if (!items.length) {
    host.innerHTML = `<div class="card"><div class="empty-state">${icon('transfer', 'empty-state__icon')}<h4>No transfers yet</h4><p>Transfers between shops will show up here.</p></div></div>`;
  } else {
    host.innerHTML = `
      <div class="table-wrap table-wrap--responsive">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Item</th>
              <th class="num">Quantity</th>
              <th>From</th>
              <th>To</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(t => {
              const qty = t.qty || 1;
              const label = t.itemLabel || itemLabel(t.itemType);
              return `
              <tr>
                <td data-label="Date">${formatDateTime(t.date)}</td>
                <td data-label="Item" class="cell-strong"><span class="badge badge--info">${escapeHtml(label)}</span></td>
                <td data-label="Quantity" class="num cell-strong" style="color:var(--accent);">${qty} unit${qty === 1 ? '' : 's'}</td>
                <td data-label="From">${escapeHtml(locationName(t.fromLocationId))}</td>
                <td data-label="To">${escapeHtml(locationName(t.toLocationId))}</td>
                <td data-label="Note">${escapeHtml(t.note || '—')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  $('#filter-type', root)?.addEventListener('change', (e) => { filters.itemType = e.target.value; render(root); });
  $('#filter-loc', root)?.addEventListener('change', (e) => { filters.locationId = e.target.value; render(root); });
  $('#btn-new-transfer', root)?.addEventListener('click', () => openNewTransferModal(state));
}

function itemLabel(type) {
  return { ev: 'EV', battery: 'Battery', charger: 'Charger', sparepart: 'Spare Part' }[type] || type;
}

function openNewTransferModal(state) {
  const locations = state.locations;
  const initialFrom = state.locationFilter !== 'all' ? state.locationFilter : locations[0]?.id;

  const modal = openModal({
    title: 'New Stock Transfer Between Shops',
    size: 'md',
    bodyHtml: `
      <form id="direct-transfer-form">
        <div class="form-grid">
          <div class="field">
            <label>Source Showroom (From)</label>
            <div class="select-wrap">
              <select name="fromLocationId" id="tr-from" required>
                ${locations.map(l => `<option value="${l.id}" ${l.id === initialFrom ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
              </select>
              ${icon('chevronDown')}
            </div>
          </div>

          <div class="field">
            <label>Destination Showroom (To)</label>
            <div class="select-wrap">
              <select name="toLocationId" id="tr-to" required>
                <!-- Populated dynamically to exclude source -->
              </select>
              ${icon('chevronDown')}
            </div>
          </div>

          <div class="field">
            <label>Item Category</label>
            <div class="select-wrap">
              <select name="itemType" id="tr-type" required>
                <option value="battery">Battery (12W Lead / Lithium)</option>
                <option value="charger">Charger (48W / 60W / 72W)</option>
                <option value="ev">EV Vehicle</option>
                <option value="sparepart">Spare Part</option>
              </select>
              ${icon('chevronDown')}
            </div>
          </div>

          <div class="field" id="tr-specific-item-wrap">
            <!-- Populated dynamically based on itemType -->
          </div>

          <div class="field">
            <label>Quantity to Transfer</label>
            <input name="qty" id="tr-qty" type="number" min="1" max="1" value="1" required>
            <div class="hint" id="tr-stock-hint" style="margin-top:4px;">Available in stock: 0</div>
          </div>

          <div class="field">
            <label>Transfer Note <span class="hint">(optional)</span></label>
            <input name="note" placeholder="Reason (e.g. showroom display request)">
          </div>
        </div>
      </form>
    `,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="direct-transfer-form" id="tr-submit-btn" class="btn btn--primary">${icon('transfer')}<span>Transfer Stock</span></button>
    `
  });

  const fromSel = $('#tr-from', modal);
  const toSel = $('#tr-to', modal);
  const typeSel = $('#tr-type', modal);
  const itemWrap = $('#tr-specific-item-wrap', modal);
  const qtyInput = $('#tr-qty', modal);
  const hintEl = $('#tr-stock-hint', modal);
  const submitBtn = $('#tr-submit-btn', modal);

  function updateToLocations() {
    const fromId = fromSel.value;
    const others = locations.filter(l => l.id !== fromId);
    toSel.innerHTML = others.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
  }

  function updateItemOptions() {
    const fromId = fromSel.value;
    const type = typeSel.value;

    if (type === 'battery') {
      const counts = {};
      BATTERY_TYPES.forEach(t => { counts[t] = 0; });
      state.batteryUnits.filter(u => u.locationId === fromId && u.status === STATUS.IN_STOCK).forEach(u => {
        const k = u.batteryType || 'Lead Battery';
        counts[k] = (counts[k] || 0) + 1;
      });

      itemWrap.innerHTML = `
        <label>Battery Technology</label>
        <div class="select-wrap">
          <select name="batteryType" id="tr-battery-select" required>
            ${BATTERY_TYPES.map(t => `<option value="${t}">${t} (${counts[t] || 0} in stock)</option>`).join('')}
          </select>
          ${icon('chevronDown')}
        </div>
      `;
      $('#tr-battery-select', itemWrap).addEventListener('change', refreshQtyLimit);
    } else if (type === 'charger') {
      const counts = {};
      CHARGER_WATTAGES.forEach(w => { counts[w] = 0; });
      state.chargerUnits.filter(u => u.locationId === fromId && u.status === STATUS.IN_STOCK).forEach(u => {
        const k = Number(u.wattage) || 48;
        counts[k] = (counts[k] || 0) + 1;
      });

      itemWrap.innerHTML = `
        <label>Charger Wattage</label>
        <div class="select-wrap">
          <select name="wattage" id="tr-charger-select" required>
            ${CHARGER_WATTAGES.map(w => `<option value="${w}">${w}W Charger (${counts[w] || 0} in stock)</option>`).join('')}
          </select>
          ${icon('chevronDown')}
        </div>
      `;
      $('#tr-charger-select', itemWrap).addEventListener('change', refreshQtyLimit);
    } else if (type === 'ev') {
      // EV
      const evs = state.evUnits.filter(e => e.locationId === fromId && e.status === STATUS.IN_STOCK);
      const modelMap = new Map();
      evs.forEach(e => {
        const key = `${e.providerId || ''}|${(e.model || 'Standard').trim()}`;
        if (!modelMap.has(key)) {
          modelMap.set(key, { providerId: e.providerId, model: (e.model || 'Standard').trim(), count: 0 });
        }
        modelMap.get(key).count += 1;
      });

      const options = Array.from(modelMap.values());
      if (options.length === 0) {
        itemWrap.innerHTML = `
          <label>EV Model</label>
          <div class="select-wrap">
            <select name="modelChoice" id="tr-ev-select" disabled>
              <option value="">No ready-to-sell EVs in this shop</option>
            </select>
            ${icon('chevronDown')}
          </div>
        `;
      } else {
        itemWrap.innerHTML = `
          <label>EV Model in Stock</label>
          <div class="select-wrap">
            <select name="modelChoice" id="tr-ev-select" required>
              ${options.map(o => `<option value="${o.providerId}|${escapeHtml(o.model)}">${escapeHtml(providerName(o.providerId))} ${escapeHtml(o.model)} (${o.count} in stock)</option>`).join('')}
            </select>
            ${icon('chevronDown')}
          </div>
        `;
      }
      $('#tr-ev-select', itemWrap)?.addEventListener('change', refreshQtyLimit);
    } else if (type === 'sparepart') {
      const parts = state.spareParts.filter(p => (p.quantity || 0) > 0);
      if (!parts.length) {
        itemWrap.innerHTML = `
          <label>Spare Part</label>
          <div class="select-wrap">
            <select name="partId" id="tr-part-select" disabled>
              <option value="">No spare parts in stock</option>
            </select>
            ${icon('chevronDown')}
          </div>
        `;
      } else {
        itemWrap.innerHTML = `
          <label>Spare Part in Stock</label>
          <div class="select-wrap">
            <select name="partId" id="tr-part-select" required>
              ${parts.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${p.quantity} pcs in stock)</option>`).join('')}
            </select>
            ${icon('chevronDown')}
          </div>
        `;
      }
      $('#tr-part-select', itemWrap)?.addEventListener('change', refreshQtyLimit);
    }

    refreshQtyLimit();
  }

  function refreshQtyLimit() {
    const fromId = fromSel.value;
    const type = typeSel.value;
    let available = 0;

    if (type === 'battery') {
      const bType = $('#tr-battery-select', itemWrap)?.value || 'Lead Battery';
      available = state.batteryUnits.filter(u => u.locationId === fromId && u.status === STATUS.IN_STOCK && (u.batteryType || 'Lead Battery') === bType).length;
    } else if (type === 'charger') {
      const wattage = Number($('#tr-charger-select', itemWrap)?.value) || 48;
      available = state.chargerUnits.filter(u => u.locationId === fromId && u.status === STATUS.IN_STOCK && Number(u.wattage) === wattage).length;
    } else if (type === 'ev') {
      const evChoice = $('#tr-ev-select', itemWrap)?.value;
      if (evChoice) {
        const [pId, model] = evChoice.split('|');
        available = state.evUnits.filter(e =>
          e.locationId === fromId &&
          e.status === STATUS.IN_STOCK &&
          e.providerId === pId &&
          (e.model || 'Standard').trim().toLowerCase() === model.toLowerCase()
        ).length;
      }
    } else if (type === 'sparepart') {
      const partId = $('#tr-part-select', itemWrap)?.value;
      const part = state.spareParts.find(p => p.id === partId);
      available = part ? (part.quantity || 0) : 0;
    }

    qtyInput.max = available > 0 ? available : 1;
    if (parseInt(qtyInput.value) > available) {
      qtyInput.value = available > 0 ? 1 : 0;
    }
    if (available > 0) {
      hintEl.textContent = `Available in stock: ${available} unit${available === 1 ? '' : 's'}`;
      hintEl.style.color = 'var(--text-secondary)';
      submitBtn.disabled = false;
    } else {
      hintEl.textContent = `Zero units currently available in stock at this location`;
      hintEl.style.color = 'var(--danger)';
      submitBtn.disabled = true;
    }
  }

  fromSel.addEventListener('change', () => {
    updateToLocations();
    updateItemOptions();
  });
  typeSel.addEventListener('change', updateItemOptions);

  updateToLocations();
  updateItemOptions();

  $('#direct-transfer-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const fromLocationId = fd.get('fromLocationId');
    const toLocationId = fd.get('toLocationId');
    const itemType = fd.get('itemType');
    const qty = Math.max(1, parseInt(fd.get('qty')) || 1);
    const note = (fd.get('note') || '').trim();

    submitBtn.disabled = true;

    try {
      if (itemType === 'battery') {
        await createDirectTransfer({
          itemType: 'battery',
          batteryType: fd.get('batteryType'),
          fromLocationId,
          toLocationId,
          qty,
          note
        });
        toast(`${qty} ${fd.get('batteryType')} transferred to ${locationName(toLocationId)}`, 'success');
      } else if (itemType === 'charger') {
        const w = Number(fd.get('wattage'));
        await createDirectTransfer({
          itemType: 'charger',
          wattage: w,
          fromLocationId,
          toLocationId,
          qty,
          note
        });
        toast(`${qty} × ${w}W Charger transferred to ${locationName(toLocationId)}`, 'success');
      } else if (itemType === 'sparepart') {
        const partId = fd.get('partId');
        const part = state.spareParts.find(p => p.id === partId);
        if (!part) throw new Error('Please select a spare part.');
        await transferSparePart(part, toLocationId, qty, note);
        toast(`${qty} pcs of ${part.name} transferred to ${locationName(toLocationId)}`, 'success');
      } else {
        const [providerId, model] = (fd.get('modelChoice') || '').split('|');
        if (!model) throw new Error('Please select an EV model to transfer.');
        await createDirectTransfer({
          itemType: 'ev',
          providerId,
          model,
          fromLocationId,
          toLocationId,
          qty,
          note
        });
        toast(`${qty} × ${model} transferred to ${locationName(toLocationId)}`, 'success');
      }
      closeModal();
    } catch (err) {
      toast(err.message, 'error');
      submitBtn.disabled = false;
    }
  });
}
