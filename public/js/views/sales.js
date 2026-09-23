import { getState, subscribe, locationName, providerName } from '../state.js';
import { icon } from '../icons.js';
import {
  escapeHtml, formatMoney, formatDateTime, todayInputValue, debounce,
  openModal, closeModal, toast, $
} from '../utils.js';
import { CHARGER_WATTAGES, BATTERY_TYPES, BATTERY_UNIT_WATTAGE, PAYMENT_METHODS, STATUS, MAIN_LOCATION_ID } from '../constants.js';
import { inLocation } from './helpers.js';
import { createEvSale, createUnitSale, createSparePartSale, getSale } from '../data/sales.js';
import { generateInvoicePdf } from '../invoice.js?v=2.6';

let filters = { type: 'all', search: '' };

export function mount(root) {
  render(root);
  const unsub = subscribe(() => render(root));
  return unsub;
}

function render(root) {
  const state = getState();
  const lf = state.locationFilter;
  let items = state.sales.filter(s => inLocation(s, lf));
  if (filters.type !== 'all') items = items.filter(s => s.type === filters.type);
  if (filters.search) {
    const s = filters.search.toLowerCase();
    items = items.filter(x => (x.customerName || '').toLowerCase().includes(s) || (x.invoiceNo || '').toLowerCase().includes(s) || (x.customerPhone || '').includes(s));
  }
  items = [...items].sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

  const totalRevenue = items.reduce((s, x) => s + (x.price || 0), 0);
  const totalProfit = items.reduce((s, x) => s + (x.profit || 0), 0);

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Sales</h2>
        <p>${lf === 'all' ? 'All locations' : locationName(lf)} · ${items.length} sale${items.length === 1 ? '' : 's'} · ${formatMoney(totalRevenue)} revenue · ${formatMoney(totalProfit)} profit</p>
      </div>
      <div class="view-header__actions">
        <button class="btn btn--primary" id="new-sale-btn">${icon('plus')}<span>Log new sale</span></button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="search-input">
        ${icon('search')}
        <input type="text" id="search-input" placeholder="Search invoice no, customer or phone" value="${escapeHtml(filters.search)}">
      </div>
      <div class="field" style="min-width:150px;">
        <div class="select-wrap">
          <select id="filter-type">
            <option value="all">All sale types</option>
            <option value="ev" ${filters.type === 'ev' ? 'selected' : ''}>EV</option>
            <option value="battery" ${filters.type === 'battery' ? 'selected' : ''}>Battery</option>
            <option value="charger" ${filters.type === 'charger' ? 'selected' : ''}>Charger</option>
            <option value="sparepart" ${filters.type === 'sparepart' ? 'selected' : ''}>Spare part</option>
          </select>
          ${icon('chevronDown')}
        </div>
      </div>
    </div>

    <div id="sales-table"></div>
  `;

  renderTable(items, state);
  $('#new-sale-btn').addEventListener('click', () => openSaleModal(state));
  $('#search-input').addEventListener('input', debounce((e) => { filters.search = e.target.value; render(root); }, 200));
  $('#filter-type').addEventListener('change', (e) => { filters.type = e.target.value; render(root); });
}

function renderTable(items, state) {
  const host = $('#sales-table');
  if (!items.length) {
    host.innerHTML = `<div class="card"><div class="empty-state">${icon('sales', 'empty-state__icon')}<h4>No sales logged</h4><p>Sales you record will appear here with downloadable invoices.</p></div></div>`;
    return;
  }
  host.innerHTML = `
    <div class="table-wrap table-wrap--responsive">
      <table>
        <thead><tr><th>Invoice</th><th>Item</th><th>Customer</th><th>Location</th><th>Payment</th><th class="num">Amount</th><th>Date</th><th></th></tr></thead>
        <tbody>
          ${items.map(s => `
            <tr>
              <td data-label="Invoice" class="cell-strong">${escapeHtml(s.invoiceNo || '—')}</td>
              <td data-label="Item">${saleSummary(s)}</td>
              <td data-label="Customer">${escapeHtml(s.customerName || 'Walk-in')}${s.customerPhone ? `<div class="cell-muted">${escapeHtml(s.customerPhone)}</div>` : ''}</td>
              <td data-label="Location">${escapeHtml(locationName(s.locationId))}</td>
              <td data-label="Payment"><span class="badge badge--info">${escapeHtml(s.paymentMethod || '—')}</span></td>
              <td data-label="Amount" class="num cell-strong">${formatMoney(s.price)}</td>
              <td data-label="Date">${formatDateTime(s.date)}</td>
              <td class="cell-actions">
                <button class="icon-btn" data-invoice="${s.id}" title="Download invoice">${icon('download')}</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  items.forEach(s => {
    $(`[data-invoice="${s.id}"]`, host)?.addEventListener('click', () => downloadInvoice(s));
  });
}

function saleSummary(s) {
  if (s.type === 'ev') {
    const details = [];
    if (s.hasBattery || (s.batteryCount && s.batteryCount > 0)) {
      const battW = s.batteryCombinedWattage || (s.batteryCount * BATTERY_UNIT_WATTAGE);
      details.push(`${s.batteryCount}× ${s.batteryType || 'Battery'} (${battW}W)`);
    }
    if (s.hasCharger || s.chargerWattage) {
      details.push(`${s.chargerWattage}W Charger`);
    }
    return `${escapeHtml(providerName(s.providerId))} EV${s.model ? ' - ' + escapeHtml(s.model) : ''}` +
      (details.length ? `<div class="cell-muted">${escapeHtml(details.join(' + '))}</div>` : `<div class="cell-muted">Vehicle only</div>`);
  }
  if (s.type === 'battery') {
    const qty = s.qty || 1;
    const bType = s.batteryType || 'Lead Battery';
    return `${qty}× ${escapeHtml(bType)}<div class="cell-muted">${qty * BATTERY_UNIT_WATTAGE}W combined</div>`;
  }
  if (s.type === 'charger') {
    const qty = s.qty || 1;
    return `${qty}× ${s.wattage}W Charger`;
  }
  if (s.type === 'sparepart') return `${escapeHtml(s.sparePartName)}<div class="cell-muted">Qty ${s.qty}</div>`;
  return 'Sale';
}

function downloadInvoice(sale) {
  const state = getState();
  const loc = state.locations.find(l => l.id === sale.locationId);
  generateInvoicePdf(sale, {
    locationName: loc?.name || '',
    locationAddress: loc?.address || '',
    providerName: sale.providerId ? providerName(sale.providerId) : ''
  });
}

// ================= New sale modal =================
function openSaleModal(state) {
  let saleType = 'ev';
  const modal = openModal({
    title: 'Log new sale',
    size: 'lg',
    bodyHtml: `
      <div class="tabs" id="sale-type-tabs">
        <button type="button" class="tab-btn is-active" data-stype="ev">${icon('ev')} EV</button>
        <button type="button" class="tab-btn" data-stype="battery">${icon('battery')} Battery</button>
        <button type="button" class="tab-btn" data-stype="charger">${icon('charger')} Charger</button>
        <button type="button" class="tab-btn" data-stype="sparepart">${icon('package')} Spare part</button>
      </div>
      <form id="sale-form">
        <div id="sale-fields"></div>
        <div class="form-grid mt-4" style="border-top:1px solid var(--border);padding-top:16px;">
          <div class="field">
            <label>Customer name <span class="hint">(optional)</span></label>
            <input name="customerName" placeholder="Walk-in customer">
          </div>
          <div class="field">
            <label>Customer phone <span class="hint">(optional)</span></label>
            <input name="customerPhone" type="tel" placeholder="10-digit mobile">
          </div>
          <div class="field">
            <label>Payment method</label>
            <div class="select-wrap">
              <select name="paymentMethod" required>
                ${PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}
              </select>
              ${icon('chevronDown')}
            </div>
          </div>
          <div class="field">
            <label>Sale date</label>
            <input name="saleDate" type="date" value="${todayInputValue()}" required>
          </div>
        </div>
        <div id="sale-error"></div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="sale-form" class="btn btn--primary">${icon('sales')}<span>Complete sale</span></button>`
  });

  const fieldsHost = $('#sale-fields', modal);
  renderFields(fieldsHost, saleType, state);

  $$('.tab-btn', modal).forEach(btn => btn.addEventListener('click', () => {
    saleType = btn.dataset.stype;
    $$('.tab-btn', modal).forEach(b => b.classList.toggle('is-active', b === btn));
    renderFields(fieldsHost, saleType, state);
  }));

  $('#sale-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const errHost = $('#sale-error', modal);
    errHost.innerHTML = '';
    const fd = new FormData(e.target);
    const submitBtn = $('[form="sale-form"]');
    submitBtn.disabled = true;
    try {
      let saleId;
      const common = {
        customerName: fd.get('customerName')?.trim(),
        customerPhone: fd.get('customerPhone')?.trim(),
        paymentMethod: fd.get('paymentMethod'),
        saleDate: fd.get('saleDate')
      };
      if (saleType === 'ev') {
        const ev = state.evUnits.find(x => x.id === fd.get('evId'));
        if (!ev) throw new Error('Select a vehicle to sell.');
        const bType = fd.get('batteryType');
        const bCount = bType !== 'none' ? Number(fd.get('batteryCount')) : 0;
        const chgWatt = fd.get('chargerWattage') !== 'none' ? Number(fd.get('chargerWattage')) : null;

        saleId = await createEvSale({
          ev,
          batteryType: bType !== 'none' ? bType : '',
          batteryCount: bCount,
          chargerWattage: chgWatt,
          price: fd.get('price'),
          locationId: ev.locationId,
          ...common
        });
      } else if (saleType === 'battery') {
        const bType = fd.get('batteryType');
        const qty = Number(fd.get('qty')) || 1;
        saleId = await createUnitSale('battery', {
          batteryType: bType,
          qty,
          price: fd.get('price'),
          locationId: fd.get('locationId'),
          ...common
        });
      } else if (saleType === 'charger') {
        const watt = Number(fd.get('wattage'));
        const qty = Number(fd.get('qty')) || 1;
        saleId = await createUnitSale('charger', {
          wattage: watt,
          qty,
          price: fd.get('price'),
          locationId: fd.get('locationId'),
          ...common
        });
      } else {
        const part = state.spareParts.find(x => x.id === fd.get('sparePartId'));
        if (!part) throw new Error('Select a spare part.');
        saleId = await createSparePartSale({
          part, qty: Number(fd.get('qty')), price: fd.get('price'), locationId: MAIN_LOCATION_ID, ...common
        });
      }
      closeModal();
      toast('Sale logged', 'success');
      if (saleId) offerInvoice(saleId);
    } catch (err) {
      errHost.innerHTML = `<div class="form-error mt-3">${icon('alert')}<span>${escapeHtml(err.message)}</span></div>`;
      submitBtn.disabled = false;
    }
  });
}

function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function renderFields(host, type, state) {
  if (type === 'ev') {
    const locs = state.locations;
    const defaultLoc = state.locationFilter !== 'all' ? state.locationFilter : (locs[0]?.id || '');
    host.innerHTML = `
      <div class="form-grid">
        <div class="field">
          <label>Shop location</label>
          <div class="select-wrap">
            <select name="saleLocationId" id="sale-loc">
              ${locs.map(l => `<option value="${l.id}" ${l.id === defaultLoc ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
            </select>
            ${icon('chevronDown')}
          </div>
        </div>
        <div class="field">
          <label>Vehicle</label>
          <div class="select-wrap">
            <select name="evId" id="sale-ev" required></select>
            ${icon('chevronDown')}
          </div>
        </div>
        <div class="field">
          <label>Battery</label>
          <div class="select-wrap">
            <select name="batteryType" id="sale-batt-type">
              <option value="none">No battery (Vehicle only)</option>
              ${BATTERY_TYPES.map(t => `<option value="${t}" ${t === 'Lead Battery' ? 'selected' : ''}>${t} (12W each)</option>`).join('')}
            </select>
            ${icon('chevronDown')}
          </div>
        </div>
        <div class="field" id="batt-count-wrap">
          <label>Battery quantity <span class="hint" id="batt-count-hint">(5 × 12W = 60W combined)</span></label>
          <input name="batteryCount" id="sale-batt-count" type="number" min="1" step="1" value="5">
        </div>
        <div class="field">
          <label>Charger</label>
          <div class="select-wrap">
            <select name="chargerWattage" id="sale-charger">
              <option value="none">No charger</option>
              ${CHARGER_WATTAGES.map(w => `<option value="${w}" ${w === 60 ? 'selected' : ''}>${w}W Charger</option>`).join('')}
            </select>
            ${icon('chevronDown')}
          </div>
        </div>
        <div></div>
        <div class="field field--full" id="sale-availability"></div>
        <div class="field field--full">
          <label>Total sale price <span class="hint">(auto-calculated, editable)</span></label>
          <input name="price" id="sale-price" type="number" min="0" step="1">
        </div>
      </div>`;

    const locSel = $('#sale-loc', host);
    const evSel = $('#sale-ev', host);
    const bTypeSel = $('#sale-batt-type', host);
    const bCountInput = $('#sale-batt-count', host);
    const bCountWrap = $('#batt-count-wrap', host);
    const bCountHint = $('#batt-count-hint', host);
    const chgSel = $('#sale-charger', host);
    const availHost = $('#sale-availability', host);
    const priceInput = $('#sale-price', host);

    function populateEvs() {
      const evs = state.evUnits.filter(e => e.status === STATUS.IN_STOCK && e.locationId === locSel.value);
      evSel.innerHTML = evs.length
        ? evs.map(e => `<option value="${e.id}">${providerName(e.providerId)}${e.model ? ' - ' + e.model : ''}${e.chassisNo ? ` (${e.chassisNo})` : ''} — ${formatMoney(e.sellingPrice)}</option>`).join('')
        : `<option value="">No EVs in stock at this location</option>`;
      updatePreview();
    }

    function updatePreview() {
      const ev = state.evUnits.find(e => e.id === evSel.value);
      if (!ev) { availHost.innerHTML = ''; priceInput.value = ''; return; }

      const bType = bTypeSel.value;
      const hasBattery = bType !== 'none';
      bCountWrap.style.display = hasBattery ? 'block' : 'none';
      const bCount = hasBattery ? Math.max(1, Number(bCountInput.value) || 1) : 0;
      const combinedWattage = bCount * BATTERY_UNIT_WATTAGE;

      if (hasBattery) {
        bCountHint.textContent = `(${bCount} × 12W = ${combinedWattage}W combined)`;
      }

      const chgWatt = chgSel.value;
      const hasCharger = chgWatt !== 'none';

      let ok = true;
      const messages = [];

      let battPrice = 0;
      if (hasBattery) {
        const battAvail = availableBatteryCount(state.batteryUnits, bType, ev.locationId);
        if (battAvail < bCount) {
          ok = false;
          messages.push(`Only ${battAvail} × ${bType} available (need ${bCount}).`);
        } else {
          messages.push(`${battAvail} × ${bType} in stock.`);
        }
        battPrice = sumBatteryPrice(state.batteryUnits, bType, ev.locationId, bCount);
      }

      let chgPrice = 0;
      if (hasCharger) {
        const chgAvail = availableChargerCount(state.chargerUnits, Number(chgWatt), ev.locationId);
        if (chgAvail < 1) {
          ok = false;
          messages.push(`No ${chgWatt}W charger available.`);
        } else {
          messages.push(`${chgAvail} × ${chgWatt}W charger in stock.`);
        }
        chgPrice = firstChargerPrice(state.chargerUnits, Number(chgWatt), ev.locationId);
      }

      if (!hasBattery && !hasCharger) {
        messages.push('Selling vehicle without battery or charger.');
      }

      availHost.innerHTML = `<div class="${ok ? 'form-note' : 'form-error'}">${icon(ok ? 'checkCircle' : 'alert')}<span>${messages.join(' ')}</span></div>`;
      priceInput.value = Math.round((ev.sellingPrice || 0) + battPrice + chgPrice);
    }

    populateEvs();
    locSel.addEventListener('change', populateEvs);
    evSel.addEventListener('change', updatePreview);
    bTypeSel.addEventListener('change', updatePreview);
    bCountInput.addEventListener('input', updatePreview);
    chgSel.addEventListener('change', updatePreview);
  }

  if (type === 'battery') {
    const locs = state.locations;
    const defaultLoc = state.locationFilter !== 'all' ? state.locationFilter : (locs[0]?.id || '');
    host.innerHTML = `
      <div class="form-grid">
        <div class="field">
          <label>Shop location</label>
          <div class="select-wrap">
            <select name="locationId" id="u-loc">
              ${locs.map(l => `<option value="${l.id}" ${l.id === defaultLoc ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
            </select>
            ${icon('chevronDown')}
          </div>
        </div>
        <div class="field">
          <label>Battery Type</label>
          <div class="select-wrap">
            <select name="batteryType" id="u-batt-type">
              ${BATTERY_TYPES.map(t => `<option value="${t}">${t} (12W)</option>`).join('')}
            </select>
            ${icon('chevronDown')}
          </div>
        </div>
        <div class="field">
          <label>Quantity <span class="hint" id="u-qty-hint">(1 × 12W = 12W)</span></label>
          <input name="qty" id="u-qty" type="number" min="1" step="1" value="1" required>
        </div>
        <div></div>
        <div class="field field--full" id="u-availability"></div>
        <div class="field field--full">
          <label>Sale price <span class="hint">(auto-filled, editable)</span></label>
          <input name="price" id="u-price" type="number" min="0" step="1">
        </div>
      </div>`;

    const locSel = $('#u-loc', host);
    const typeSel = $('#u-batt-type', host);
    const qtyInput = $('#u-qty', host);
    const hint = $('#u-qty-hint', host);
    const availHost = $('#u-availability', host);
    const priceInput = $('#u-price', host);

    function update() {
      const bType = typeSel.value;
      const qty = Math.max(1, Number(qtyInput.value) || 1);
      hint.textContent = `(${qty} × 12W = ${qty * BATTERY_UNIT_WATTAGE}W combined)`;

      const avail = availableBatteryCount(state.batteryUnits, bType, locSel.value);
      const ok = avail >= qty;
      availHost.innerHTML = ok
        ? `<div class="form-note">${icon('checkCircle')}<span>${avail} in stock at this location.</span></div>`
        : `<div class="form-error">${icon('alert')}<span>Only ${avail} in stock at this location (need ${qty}).</span></div>`;

      const unitPrice = firstBatteryPrice(state.batteryUnits, bType, locSel.value);
      priceInput.value = Math.round(unitPrice * qty);
    }
    update();
    locSel.addEventListener('change', update);
    typeSel.addEventListener('change', update);
    qtyInput.addEventListener('input', update);
  }

  if (type === 'charger') {
    const locs = state.locations;
    const defaultLoc = state.locationFilter !== 'all' ? state.locationFilter : (locs[0]?.id || '');
    host.innerHTML = `
      <div class="form-grid">
        <div class="field">
          <label>Shop location</label>
          <div class="select-wrap">
            <select name="locationId" id="u-loc">
              ${locs.map(l => `<option value="${l.id}" ${l.id === defaultLoc ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
            </select>
            ${icon('chevronDown')}
          </div>
        </div>
        <div class="field">
          <label>Charger Wattage</label>
          <div class="select-wrap">
            <select name="wattage" id="u-watt">
              ${CHARGER_WATTAGES.map(w => `<option value="${w}">${w}W</option>`).join('')}
            </select>
            ${icon('chevronDown')}
          </div>
        </div>
        <div class="field">
          <label>Quantity</label>
          <input name="qty" id="u-qty" type="number" min="1" step="1" value="1" required>
        </div>
        <div></div>
        <div class="field field--full" id="u-availability"></div>
        <div class="field field--full">
          <label>Sale price <span class="hint">(auto-filled, editable)</span></label>
          <input name="price" id="u-price" type="number" min="0" step="1">
        </div>
      </div>`;

    const locSel = $('#u-loc', host);
    const wattSel = $('#u-watt', host);
    const qtyInput = $('#u-qty', host);
    const availHost = $('#u-availability', host);
    const priceInput = $('#u-price', host);

    function update() {
      const watt = Number(wattSel.value);
      const qty = Math.max(1, Number(qtyInput.value) || 1);
      const avail = availableChargerCount(state.chargerUnits, watt, locSel.value);
      const ok = avail >= qty;
      availHost.innerHTML = ok
        ? `<div class="form-note">${icon('checkCircle')}<span>${avail} in stock at this location.</span></div>`
        : `<div class="form-error">${icon('alert')}<span>Only ${avail} in stock at this location (need ${qty}).</span></div>`;

      const unitPrice = firstChargerPrice(state.chargerUnits, watt, locSel.value);
      priceInput.value = Math.round(unitPrice * qty);
    }
    update();
    locSel.addEventListener('change', update);
    wattSel.addEventListener('change', update);
    qtyInput.addEventListener('input', update);
  }

  if (type === 'sparepart') {
    host.innerHTML = `
      <div class="form-grid">
        <div class="field field--full">
          <label>Spare part</label>
          <div class="select-wrap">
            <select name="sparePartId" id="sp-part" required>
              ${state.spareParts.map(p => `<option value="${p.id}" data-price="${p.sellingPrice}" data-qty="${p.quantity}">${escapeHtml(p.name)} — ${p.quantity} in stock</option>`).join('') || `<option value="">No spare parts added yet</option>`}
            </select>
            ${icon('chevronDown')}
          </div>
        </div>
        <div class="field">
          <label>Quantity</label>
          <input name="qty" id="sp-qty" type="number" min="1" step="1" value="1" required>
        </div>
        <div class="field">
          <label>Sale price <span class="hint">(auto-filled, editable)</span></label>
          <input name="price" id="sp-price" type="number" min="0" step="1">
        </div>
        <div class="field field--full" id="sp-availability"></div>
      </div>`;
    const partSel = $('#sp-part', host);
    const qtySel = $('#sp-qty', host);
    function update() {
      const opt = partSel.selectedOptions[0];
      const price = Number(opt?.dataset.price || 0);
      const stock = Number(opt?.dataset.qty || 0);
      const qty = Number(qtySel.value || 1);
      $('#sp-price', host).value = Math.round(price * qty);
      const availHost = $('#sp-availability', host);
      const ok = stock >= qty;
      availHost.innerHTML = `<div class="${ok ? 'form-note' : 'form-error'}">${icon(ok ? 'checkCircle' : 'alert')}<span>${stock} in stock.</span></div>`;
    }
    if (state.spareParts.length) { update(); partSel.addEventListener('change', update); qtySel.addEventListener('input', update); }
  }
}

function availableBatteryCount(units, batteryType, locationId) {
  return units.filter(u => u.status === STATUS.IN_STOCK && u.locationId === locationId && ((u.batteryType || 'Lead Battery') === batteryType)).length;
}
function sumBatteryPrice(units, batteryType, locationId, count) {
  const list = units.filter(u => u.status === STATUS.IN_STOCK && u.locationId === locationId && ((u.batteryType || 'Lead Battery') === batteryType));
  return list.slice(0, count).reduce((s, u) => s + (u.sellingPrice || 0), 0);
}
function firstBatteryPrice(units, batteryType, locationId) {
  const list = units.filter(u => u.status === STATUS.IN_STOCK && u.locationId === locationId && ((u.batteryType || 'Lead Battery') === batteryType));
  return list[0]?.sellingPrice || 0;
}

function availableChargerCount(units, wattage, locationId) {
  return units.filter(u => u.status === STATUS.IN_STOCK && u.locationId === locationId && Number(u.wattage) === Number(wattage)).length;
}
function firstChargerPrice(units, wattage, locationId) {
  const list = units.filter(u => u.status === STATUS.IN_STOCK && u.locationId === locationId && Number(u.wattage) === Number(wattage));
  return list[0]?.sellingPrice || 0;
}

async function offerInvoice(saleId) {
  const sale = await getSale(saleId);
  const modal = openModal({
    title: 'Sale complete',
    size: 'sm',
    bodyHtml: `<p class="confirm-text">${icon('checkCircle')} The sale has been recorded${sale?.invoiceNo ? ` as <strong>${escapeHtml(sale.invoiceNo)}</strong>` : ''}. Download the invoice now?</p>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Later</button>
      <button type="button" class="btn btn--primary" id="dl-now">${icon('download')}<span>Download invoice</span></button>`
  });
  $('#dl-now', modal).addEventListener('click', async () => {
    const s = sale || await getSale(saleId);
    if (s) downloadInvoice(s);
    closeModal();
  });
}

