import { getState, subscribe, locationName, providerName } from '../state.js';
import { icon } from '../icons.js';
import {
  escapeHtml, formatMoney, formatDateTime, todayInputValue, debounce,
  openModal, closeModal, toast, $
} from '../utils.js';
import { WATTAGES, BATTERY_COUNTS, PAYMENT_METHODS, STATUS, MAIN_LOCATION_ID } from '../constants.js';
import { inLocation } from './helpers.js';
import { createEvSale, createUnitSale, createSparePartSale, getSale } from '../data/sales.js';
import { generateInvoicePdf } from '../invoice.js';

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
  if (s.type === 'ev') return `${escapeHtml(providerName(s.providerId))} EV<div class="cell-muted">${s.batteryCount}× ${s.batteryWattage}W battery + charger</div>`;
  if (s.type === 'sparepart') return `${escapeHtml(s.sparePartName)}<div class="cell-muted">Qty ${s.qty}</div>`;
  return `${s.wattage}W ${s.type === 'battery' ? 'Battery' : 'Charger'}`;
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
        saleId = await createEvSale({
          ev, batteryWattage: Number(fd.get('batteryWattage')), batteryCount: Number(fd.get('batteryCount')),
          price: fd.get('price'), locationId: ev.locationId, ...common
        });
      } else if (saleType === 'battery' || saleType === 'charger') {
        const units = (saleType === 'battery' ? state.batteryUnits : state.chargerUnits)
          .filter(u => u.status === STATUS.IN_STOCK && u.locationId === fd.get('locationId') && String(u.wattage) === fd.get('wattage'));
        if (!units.length) throw new Error(`No ${fd.get('wattage')}W ${saleType} available at this location.`);
        saleId = await createUnitSale(saleType, { unit: units[0], price: fd.get('price'), ...common });
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
          <label>Battery wattage</label>
          <div class="select-wrap">
            <select name="batteryWattage" id="sale-wattage">
              ${WATTAGES.map(w => `<option value="${w}">${w}W</option>`).join('')}
            </select>
            ${icon('chevronDown')}
          </div>
        </div>
        <div class="field">
          <label>Battery count</label>
          <div class="select-wrap">
            <select name="batteryCount" id="sale-count">
              ${BATTERY_COUNTS.map(c => `<option value="${c}">${c} batteries</option>`).join('')}
            </select>
            ${icon('chevronDown')}
          </div>
        </div>
        <div class="field field--full" id="sale-availability"></div>
        <div class="field field--full">
          <label>Total sale price <span class="hint">(auto-calculated, editable)</span></label>
          <input name="price" id="sale-price" type="number" min="0" step="1">
        </div>
      </div>`;

    const locSel = $('#sale-loc', host);
    const evSel = $('#sale-ev', host);
    const wattSel = $('#sale-wattage', host);
    const countSel = $('#sale-count', host);

    function populateEvs() {
      const evs = state.evUnits.filter(e => e.status === STATUS.IN_STOCK && e.locationId === locSel.value);
      evSel.innerHTML = evs.length
        ? evs.map(e => `<option value="${e.id}" data-wattage="${e.bundleWattage}">${providerName(e.providerId)}${e.model ? ' - ' + e.model : ''}${e.chassisNo ? ` (${e.chassisNo})` : ''} — ${formatMoney(e.sellingPrice)}</option>`).join('')
        : `<option value="">No EVs in stock at this location</option>`;
      if (evs.length) wattSel.value = evs[0].bundleWattage;
      updatePreview();
    }
    function updatePreview() {
      const ev = state.evUnits.find(e => e.id === evSel.value);
      const wattage = Number(wattSel.value);
      const count = Number(countSel.value);
      const availHost = $('#sale-availability', host);
      const priceInput = $('#sale-price', host);
      if (!ev) { availHost.innerHTML = ''; return; }
      const battAvail = availableCount(state.batteryUnits, wattage, ev.locationId, ev.id);
      const chgAvail = availableCount(state.chargerUnits, wattage, ev.locationId, ev.id);
      const ok = battAvail >= count && chgAvail >= 1;
      availHost.innerHTML = `<div class="${ok ? 'form-note' : 'form-error'}">${icon(ok ? 'checkCircle' : 'alert')}<span>${battAvail} × ${wattage}W batteries and ${chgAvail} × ${wattage}W charger available at this location. Need ${count} batteries + 1 charger.</span></div>`;
      const battPrice = sumSellingPrice(state.batteryUnits, wattage, ev.locationId, ev.id, count);
      const chgPrice = firstSellingPrice(state.chargerUnits, wattage, ev.locationId, ev.id);
      priceInput.value = Math.round((ev.sellingPrice || 0) + battPrice + chgPrice);
    }

    populateEvs();
    locSel.addEventListener('change', populateEvs);
    evSel.addEventListener('change', () => { const w = evSel.selectedOptions[0]?.dataset.wattage; if (w) wattSel.value = w; updatePreview(); });
    wattSel.addEventListener('change', updatePreview);
    countSel.addEventListener('change', updatePreview);
  }

  if (type === 'battery' || type === 'charger') {
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
          <label>Wattage</label>
          <div class="select-wrap">
            <select name="wattage" id="u-watt">
              ${WATTAGES.map(w => `<option value="${w}">${w}W</option>`).join('')}
            </select>
            ${icon('chevronDown')}
          </div>
        </div>
        <div class="field field--full" id="u-availability"></div>
        <div class="field field--full">
          <label>Sale price <span class="hint">(auto-filled, editable)</span></label>
          <input name="price" id="u-price" type="number" min="0" step="1">
        </div>
      </div>`;
    const locSel = $('#u-loc', host);
    const wattSel = $('#u-watt', host);
    function update() {
      const units = (type === 'battery' ? state.batteryUnits : state.chargerUnits)
        .filter(u => u.status === STATUS.IN_STOCK && u.locationId === locSel.value && String(u.wattage) === wattSel.value);
      const availHost = $('#u-availability', host);
      availHost.innerHTML = units.length
        ? `<div class="form-note">${icon('checkCircle')}<span>${units.length} in stock at this location.</span></div>`
        : `<div class="form-error">${icon('alert')}<span>None in stock at this location.</span></div>`;
      $('#u-price', host).value = units[0]?.sellingPrice ?? 0;
    }
    update();
    locSel.addEventListener('change', update);
    wattSel.addEventListener('change', update);
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

function availableCount(units, wattage, locationId, evId) {
  return units.filter(u => u.status === STATUS.IN_STOCK && u.wattage === wattage && u.locationId === locationId).length;
}
function sumSellingPrice(units, wattage, locationId, evId, count) {
  const list = units.filter(u => u.status === STATUS.IN_STOCK && u.wattage === wattage && u.locationId === locationId);
  list.sort((a, b) => (b.linkedEvId === evId ? 1 : 0) - (a.linkedEvId === evId ? 1 : 0));
  return list.slice(0, count).reduce((s, u) => s + (u.sellingPrice || 0), 0);
}
function firstSellingPrice(units, wattage, locationId, evId) {
  const list = units.filter(u => u.status === STATUS.IN_STOCK && u.wattage === wattage && u.locationId === locationId);
  list.sort((a, b) => (b.linkedEvId === evId ? 1 : 0) - (a.linkedEvId === evId ? 1 : 0));
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
