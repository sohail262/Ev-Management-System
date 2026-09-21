import { getState, subscribe, locationName, providerName } from '../state.js';
import { icon } from '../icons.js';
import { formatMoney, formatDateTime } from '../utils.js';
import { STATUS } from '../constants.js';
import { inLocation, lowStockAlerts } from './helpers.js';

export function mount(root) {
  render(root);
  return subscribe(() => render(root));
}

function render(root) {
  const state = getState();
  const lf = state.locationFilter;
  const scopeLabel = lf === 'all' ? 'All locations' : locationName(lf);

  const evInStock = state.evUnits.filter(e => e.status === STATUS.IN_STOCK && inLocation(e, lf));
  const batteriesInStock = state.batteryUnits.filter(u => u.status === STATUS.IN_STOCK && inLocation(u, lf));
  const chargersInStock = state.chargerUnits.filter(u => u.status === STATUS.IN_STOCK && inLocation(u, lf));
  const sparePartsQty = state.spareParts.reduce((s, p) => s + (p.quantity || 0), 0);
  const sparePartsValue = state.spareParts.reduce((s, p) => s + (p.quantity || 0) * (p.sellingPrice || 0), 0);

  const salesInScope = state.sales.filter(s => inLocation(s, lf));
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const toDate = (d) => d?.toDate ? d.toDate() : new Date(d);

  const todaySales = salesInScope.filter(s => s.date && toDate(s.date) >= startOfDay);
  const monthSales = salesInScope.filter(s => s.date && toDate(s.date) >= startOfMonth);
  const todayRevenue = todaySales.reduce((s, x) => s + (x.price || 0), 0);
  const monthRevenue = monthSales.reduce((s, x) => s + (x.price || 0), 0);
  const monthProfit = monthSales.reduce((s, x) => s + (x.profit || 0), 0);

  const alerts = lowStockAlerts(state, lf);
  const recentSales = [...salesInScope].sort((a, b) => toDate(b.date) - toDate(a.date)).slice(0, 6);
  const recentLog = state.stockLog.filter(l => lf === 'all' || l.locationId === lf || l.toLocationId === lf).slice(0, 8);

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Dashboard</h2>
        <p>${scopeLabel} · live overview of stock and sales</p>
      </div>
    </div>

    <div class="kpi-grid">
      ${kpi('ev', 'EVs in stock', evInStock.length, `${state.evUnits.filter(e=>inLocation(e,lf)).length} total added`)}
      ${kpi('battery', 'Batteries in stock', batteriesInStock.length, `across ${new Set(batteriesInStock.map(b=>b.wattage)).size || 0} wattages`)}
      ${kpi('charger', 'Chargers in stock', chargersInStock.length, `across ${new Set(chargersInStock.map(c=>c.wattage)).size || 0} wattages`)}
      ${kpi('package', 'Spare parts', sparePartsQty, `${formatMoney(sparePartsValue)} stock value`)}
      ${kpi('wallet', "Today's revenue", formatMoney(todayRevenue), `${todaySales.length} sale${todaySales.length===1?'':'s'} today`, 'info')}
      ${kpi('reports', "This month's revenue", formatMoney(monthRevenue), `${formatMoney(monthProfit)} profit`, 'info')}
      ${kpi('alert', 'Low stock alerts', alerts.length, alerts.length ? 'needs attention' : 'all good', alerts.length ? 'warn' : '')}
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card__header">
          <div><h3>Low stock alerts</h3><p>Below reorder threshold</p></div>
          ${icon('alert')}
        </div>
        ${alerts.length ? `<ul>${alerts.map(a => `
          <li class="alert-row">
            ${icon('alert')}
            <div>
              <div class="alert-row__title">${a.title}</div>
              <div class="alert-row__sub">${a.sub}</div>
            </div>
            <div class="alert-row__count">${a.count}</div>
          </li>`).join('')}</ul>` : emptyRow('checkCircle', 'Everything is well stocked', 'No items are below their reorder threshold right now.')}
      </div>

      <div class="card">
        <div class="card__header">
          <div><h3>Recent sales</h3><p>Latest transactions</p></div>
          ${icon('sales')}
        </div>
        ${recentSales.length ? `<ul>${recentSales.map(s => `
          <li class="alert-row">
            ${icon(s.type === 'ev' ? 'ev' : s.type === 'sparepart' ? 'package' : s.type)}
            <div>
              <div class="alert-row__title">${saleLabel(s)}</div>
              <div class="alert-row__sub">${locationName(s.locationId)} · ${formatDateTime(s.date)}</div>
            </div>
            <div class="alert-row__count" style="color:var(--accent)">${formatMoney(s.price)}</div>
          </li>`).join('')}</ul>` : emptyRow('sales', 'No sales yet', 'Sales you log will show up here.')}
      </div>
    </div>

    <div class="card mt-4">
      <div class="card__header">
        <div><h3>Recent activity</h3><p>Stock additions, sales and transfers</p></div>
        ${icon('refresh')}
      </div>
      ${recentLog.length ? `<ul>${recentLog.map(l => `
        <li class="alert-row">
          ${icon(logIcon(l.type))}
          <div>
            <div class="alert-row__title">${l.label || l.type}</div>
            <div class="alert-row__sub">${formatDateTime(l.date)}</div>
          </div>
        </li>`).join('')}</ul>` : emptyRow('boxes', 'No activity yet', 'Stock movements will appear here as you use the system.')}
    </div>
  `;
}

function kpi(iconName, label, value, sub, variant = '') {
  return `
    <div class="kpi-card">
      <div class="kpi-card__top">
        <span class="kpi-card__label">${label}</span>
        <span class="kpi-card__icon ${variant ? `kpi-card__icon--${variant}` : ''}">${icon(iconName)}</span>
      </div>
      <div class="kpi-card__value">${value}</div>
      <div class="kpi-card__sub">${sub}</div>
    </div>`;
}

function emptyRow(iconName, title, message) {
  return `<div class="empty-state">${icon(iconName, 'empty-state__icon')}<h4>${title}</h4><p>${message}</p></div>`;
}

function logIcon(type) {
  return { add: 'plus', sale: 'sales', transfer: 'transfer', adjust: 'edit' }[type] || 'boxes';
}

function saleLabel(s) {
  if (s.type === 'ev') return `${providerName(s.providerId)} EV${s.customerName ? ` — ${s.customerName}` : ''}`;
  if (s.type === 'sparepart') return `${s.sparePartName} × ${s.qty}`;
  return `${s.wattage}W ${s.type}`;
}
