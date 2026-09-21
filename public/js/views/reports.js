import { getState, subscribe, locationName, providerName } from '../state.js';
import { icon } from '../icons.js';
import { escapeHtml, formatMoney, formatDateTime, todayInputValue, $ } from '../utils.js';
import { STATUS } from '../constants.js';
import { lowStockAlerts, withinRange } from './helpers.js';

let activeTab = 'inventory';
let range = { from: '', to: '' };

export function mount(root) {
  render(root);
  const unsub = subscribe(() => render(root));
  return unsub;
}

function render(root) {
  const state = getState();
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Reports</h2>
        <p>Inventory, sales and movement insights across your business</p>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn ${activeTab === 'inventory' ? 'is-active' : ''}" data-tab="inventory">Inventory by location</button>
      <button class="tab-btn ${activeTab === 'sales' ? 'is-active' : ''}" data-tab="sales">Sales &amp; revenue</button>
      <button class="tab-btn ${activeTab === 'movement' ? 'is-active' : ''}" data-tab="movement">Stock movement</button>
      <button class="tab-btn ${activeTab === 'lowstock' ? 'is-active' : ''}" data-tab="lowstock">Low stock</button>
    </div>

    <div id="report-body"></div>
  `;
  $$('.tab-btn').forEach(b => b.addEventListener('click', () => { activeTab = b.dataset.tab; render(root); }));

  const body = $('#report-body');
  if (activeTab === 'inventory') renderInventory(body, state);
  if (activeTab === 'sales') renderSales(body, state);
  if (activeTab === 'movement') renderMovement(body, state);
  if (activeTab === 'lowstock') renderLowStock(body, state);
}
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

function rangeBar(onChange) {
  return `
    <div class="filter-bar">
      <div class="field">
        <label class="text-tiny">From</label>
        <input type="date" id="r-from" value="${range.from}">
      </div>
      <div class="field">
        <label class="text-tiny">To</label>
        <input type="date" id="r-to" value="${range.to}">
      </div>
      <button class="btn btn--secondary" id="r-clear">${icon('close')}<span>Clear</span></button>
    </div>`;
}
function wireRangeBar(host, onChange) {
  $('#r-from', host).addEventListener('change', (e) => { range.from = e.target.value; onChange(); });
  $('#r-to', host).addEventListener('change', (e) => { range.to = e.target.value; onChange(); });
  $('#r-clear', host).addEventListener('click', () => { range = { from: '', to: '' }; onChange(); });
}

function inSelectedRange(dateVal) {
  const from = range.from ? new Date(range.from + 'T00:00:00') : null;
  const to = range.to ? new Date(range.to + 'T23:59:59') : null;
  if (!from && !to) return true;
  return withinRange(dateVal, from, to);
}

// ---------------- Inventory by location ----------------
function renderInventory(host, state) {
  const rows = state.locations.map(l => {
    const evCount = state.evUnits.filter(e => e.locationId === l.id && e.status === STATUS.IN_STOCK).length;
    const battCount = state.batteryUnits.filter(u => u.locationId === l.id && u.status === STATUS.IN_STOCK).length;
    const chgCount = state.chargerUnits.filter(u => u.locationId === l.id && u.status === STATUS.IN_STOCK).length;
    const evValue = state.evUnits.filter(e => e.locationId === l.id && e.status === STATUS.IN_STOCK).reduce((s, e) => s + (e.sellingPrice || 0), 0);
    return { l, evCount, battCount, chgCount, evValue };
  });
  const sparePartsQty = state.spareParts.reduce((s, p) => s + (p.quantity || 0), 0);
  const sparePartsValue = state.spareParts.reduce((s, p) => s + (p.quantity || 0) * (p.sellingPrice || 0), 0);

  host.innerHTML = `
    <div class="card">
      <div class="card__header"><div><h3>Stock by shop</h3><p>Current in-stock counts, centralized view</p></div>${icon('store')}</div>
      <div class="table-wrap table-wrap--responsive">
        <table>
          <thead><tr><th>Shop</th><th class="num">EVs</th><th class="num">Batteries</th><th class="num">Chargers</th><th class="num">EV stock value</th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td data-label="Shop" class="cell-strong">${escapeHtml(r.l.name)}</td>
                <td data-label="EVs" class="num">${r.evCount}</td>
                <td data-label="Batteries" class="num">${r.battCount}</td>
                <td data-label="Chargers" class="num">${r.chgCount}</td>
                <td data-label="EV stock value" class="num">${formatMoney(r.evValue)}</td>
              </tr>`).join('')}
            <tr>
              <td data-label="Shop" class="cell-strong">Total</td>
              <td data-label="EVs" class="num cell-strong">${rows.reduce((s, r) => s + r.evCount, 0)}</td>
              <td data-label="Batteries" class="num cell-strong">${rows.reduce((s, r) => s + r.battCount, 0)}</td>
              <td data-label="Chargers" class="num cell-strong">${rows.reduce((s, r) => s + r.chgCount, 0)}</td>
              <td data-label="EV stock value" class="num cell-strong">${formatMoney(rows.reduce((s, r) => s + r.evValue, 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="card mt-4">
      <div class="card__header"><div><h3>Spare parts (centralized)</h3><p>Total quantity and stock value across all parts</p></div>${icon('package')}</div>
      <div class="kpi-grid" style="margin-bottom:0;">
        ${kpi('boxes', 'Total quantity', sparePartsQty)}
        ${kpi('wallet', 'Stock value', formatMoney(sparePartsValue))}
        ${kpi('alert', 'Low stock parts', state.spareParts.filter(p => (p.quantity || 0) <= (p.reorderLevel || 0)).length, '', 'warn')}
      </div>
    </div>`;
}

function kpi(iconName, label, value, sub = '', variant = '') {
  return `
    <div class="kpi-card">
      <div class="kpi-card__top"><span class="kpi-card__label">${label}</span><span class="kpi-card__icon ${variant ? `kpi-card__icon--${variant}` : ''}">${icon(iconName)}</span></div>
      <div class="kpi-card__value">${value}</div>
      ${sub ? `<div class="kpi-card__sub">${sub}</div>` : ''}
    </div>`;
}

// ---------------- Sales & revenue ----------------
function renderSales(host, state) {
  host.innerHTML = rangeBar() + `<div id="sales-report-body"></div>`;
  wireRangeBar(host, () => renderSales(host, state));
  const body = $('#sales-report-body', host);

  const sales = state.sales.filter(s => inSelectedRange(s.date));
  const revenue = sales.reduce((s, x) => s + (x.price || 0), 0);
  const profit = sales.reduce((s, x) => s + (x.profit || 0), 0);

  const byProvider = new Map();
  sales.filter(s => s.type === 'ev').forEach(s => {
    const key = s.providerId;
    if (!byProvider.has(key)) byProvider.set(key, { units: 0, revenue: 0, profit: 0 });
    const r = byProvider.get(key);
    r.units += 1; r.revenue += s.price || 0; r.profit += s.profit || 0;
  });

  const byPayment = new Map();
  sales.forEach(s => {
    const key = s.paymentMethod || 'Unknown';
    byPayment.set(key, (byPayment.get(key) || 0) + (s.price || 0));
  });

  body.innerHTML = `
    <div class="kpi-grid">
      ${kpi('sales', 'Total sales', sales.length)}
      ${kpi('wallet', 'Revenue', formatMoney(revenue), '', 'info')}
      ${kpi('reports', 'Profit', formatMoney(profit), '', 'info')}
      ${kpi('ev', 'EV units sold', sales.filter(s => s.type === 'ev').length)}
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card__header"><div><h3>EV sales by brand</h3></div>${icon('ev')}</div>
        ${byProvider.size ? `
        <div class="table-wrap table-wrap--responsive">
          <table>
            <thead><tr><th>Brand</th><th class="num">Units</th><th class="num">Revenue</th><th class="num">Profit</th></tr></thead>
            <tbody>
              ${[...byProvider.entries()].map(([id, r]) => `
                <tr><td data-label="Brand" class="cell-strong">${escapeHtml(providerName(id))}</td><td data-label="Units" class="num">${r.units}</td><td data-label="Revenue" class="num">${formatMoney(r.revenue)}</td><td data-label="Profit" class="num">${formatMoney(r.profit)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>` : emptyMini('No EV sales in this range')}
      </div>
      <div class="card">
        <div class="card__header"><div><h3>Revenue by payment method</h3></div>${icon('wallet')}</div>
        ${byPayment.size ? `
        <div class="table-wrap table-wrap--responsive">
          <table>
            <thead><tr><th>Method</th><th class="num">Revenue</th></tr></thead>
            <tbody>
              ${[...byPayment.entries()].map(([m, v]) => `<tr><td data-label="Method" class="cell-strong">${escapeHtml(m)}</td><td data-label="Revenue" class="num">${formatMoney(v)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>` : emptyMini('No sales in this range')}
      </div>
    </div>
    <div class="card mt-4">
      <div class="card__header">
        <div><h3>All sales in range</h3><p>${sales.length} transaction${sales.length === 1 ? '' : 's'}</p></div>
        <button class="btn btn--secondary btn--sm" id="export-csv">${icon('download')}<span>Export CSV</span></button>
      </div>
      ${sales.length ? `
      <div class="table-wrap table-wrap--responsive">
        <table>
          <thead><tr><th>Invoice</th><th>Date</th><th>Type</th><th>Location</th><th class="num">Revenue</th><th class="num">Profit</th></tr></thead>
          <tbody>
            ${sales.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)).map(s => `
              <tr>
                <td data-label="Invoice">${escapeHtml(s.invoiceNo || '—')}</td>
                <td data-label="Date">${formatDateTime(s.date)}</td>
                <td data-label="Type"><span class="badge badge--info">${s.type}</span></td>
                <td data-label="Location">${escapeHtml(locationName(s.locationId))}</td>
                <td data-label="Revenue" class="num">${formatMoney(s.price)}</td>
                <td data-label="Profit" class="num">${formatMoney(s.profit)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : emptyMini('No sales in this range')}
    </div>
  `;

  $('#export-csv', body)?.addEventListener('click', () => exportSalesCsv(sales));
}

function emptyMini(text) {
  return `<p class="text-tiny" style="padding:20px 0;text-align:center;">${escapeHtml(text)}</p>`;
}

function exportSalesCsv(sales) {
  const headers = ['Invoice', 'Date', 'Type', 'Location', 'Customer', 'Phone', 'Payment', 'Revenue', 'Cost', 'Profit'];
  const rows = sales.map(s => [
    s.invoiceNo || '', formatDateTime(s.date), s.type, locationName(s.locationId),
    s.customerName || '', s.customerPhone || '', s.paymentMethod || '',
    s.price || 0, s.costTotal || 0, s.profit || 0
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `sales-report-${todayInputValue()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ---------------- Stock movement ----------------
function renderMovement(host, state) {
  host.innerHTML = rangeBar() + `<div id="movement-body"></div>`;
  wireRangeBar(host, () => renderMovement(host, state));
  const body = $('#movement-body', host);
  const logs = state.stockLog.filter(l => inSelectedRange(l.date)).sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

  body.innerHTML = `
    <div class="card">
      <div class="card__header"><div><h3>Movement history</h3><p>${logs.length} event${logs.length === 1 ? '' : 's'}</p></div>${icon('refresh')}</div>
      ${logs.length ? `<ul>${logs.map(l => `
        <li class="alert-row">
          ${icon({ add: 'plus', sale: 'sales', transfer: 'transfer', adjust: 'edit' }[l.type] || 'boxes')}
          <div>
            <div class="alert-row__title">${escapeHtml(l.label || l.type)}</div>
            <div class="alert-row__sub">${formatDateTime(l.date)}${l.locationId ? ` · ${escapeHtml(locationName(l.locationId))}` : ''}${l.toLocationId ? ` → ${escapeHtml(locationName(l.toLocationId))}` : ''}</div>
          </div>
        </li>`).join('')}</ul>` : emptyMini('No stock movement in this range')}
    </div>`;
}

// ---------------- Low stock ----------------
function renderLowStock(host, state) {
  const alerts = lowStockAlerts(state, 'all');
  host.innerHTML = `
    <div class="card">
      <div class="card__header"><div><h3>Low stock across all shops</h3><p>${alerts.length} item${alerts.length === 1 ? '' : 's'} below reorder threshold</p></div>${icon('alert')}</div>
      ${alerts.length ? `<ul>${alerts.map(a => `
        <li class="alert-row">
          ${icon('alert')}
          <div><div class="alert-row__title">${escapeHtml(a.title)}</div><div class="alert-row__sub">${escapeHtml(a.sub)}</div></div>
          <div class="alert-row__count">${a.count}</div>
        </li>`).join('')}</ul>` : emptyMini('Nothing is low on stock right now')}
    </div>`;
}
