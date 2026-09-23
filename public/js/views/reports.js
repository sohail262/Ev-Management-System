import { getState, subscribe, locationName, providerName } from '../state.js';
import { icon } from '../icons.js';
import { escapeHtml, formatMoney, formatDateTime, formatDate, todayInputValue, openModal, closeModal, $ } from '../utils.js';
import { STATUS, BATTERY_TYPES } from '../constants.js';
import { lowStockAlerts, withinRange, inLocation } from './helpers.js';
import { generateExecutiveReportPdf, generateModelReportPdf, generateInventoryValuationPdf } from '../reportsPdf.js';

let activeTab = 'inventory';
let range = { from: '', to: '' };
let activePreset = 'all';

// Chart instance cache to guarantee safe lifecycle and prevent Canvas reuse errors
const activeCharts = new Map();

function destroyCharts() {
  activeCharts.forEach(chart => {
    try { chart.destroy(); } catch (e) { /* ignore */ }
  });
  activeCharts.clear();
}

function registerChart(key, chartInstance) {
  if (activeCharts.has(key)) {
    try { activeCharts.get(key).destroy(); } catch (e) { /* ignore */ }
  }
  activeCharts.set(key, chartInstance);
  return chartInstance;
}

export function mount(root) {
  render(root);
  const unsub = subscribe(() => render(root));
  return () => {
    destroyCharts();
    unsub();
  };
}

function getRangeLabel() {
  if (!range.from && !range.to) return 'All Recorded History';
  if (range.from && range.to) {
    if (range.from === range.to) return formatDate(range.from);
    return `${formatDate(range.from)} – ${formatDate(range.to)}`;
  }
  if (range.from) return `From ${formatDate(range.from)}`;
  return `Up to ${formatDate(range.to)}`;
}

function getScopeLabel(state) {
  return state.locationFilter === 'all' ? 'All Dealership Locations' : locationName(state.locationFilter);
}

function render(root) {
  destroyCharts();
  const state = getState();
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Reports &amp; Business Intelligence</h2>
        <p>Comprehensive analytics, performance charts, model audits &amp; downloadable reports</p>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn ${activeTab === 'inventory' ? 'is-active' : ''}" data-tab="inventory">Inventory by location</button>
      <button class="tab-btn ${activeTab === 'sales' ? 'is-active' : ''}" data-tab="sales">Sales &amp; revenue</button>
      <button class="tab-btn ${activeTab === 'model' ? 'is-active' : ''}" data-tab="model">EV Model report</button>
      <button class="tab-btn ${activeTab === 'movement' ? 'is-active' : ''}" data-tab="movement">Stock movement</button>
      <button class="tab-btn ${activeTab === 'lowstock' ? 'is-active' : ''}" data-tab="lowstock">Low stock</button>
    </div>

    <div id="report-body"></div>
  `;

  $$('.tab-btn', root).forEach(b => b.addEventListener('click', () => {
    activeTab = b.dataset.tab;
    render(root);
  }));

  const body = $('#report-body', root);
  if (activeTab === 'inventory') renderInventory(body, state);
  if (activeTab === 'sales') renderSales(body, state);
  if (activeTab === 'model') renderModelReport(body, state);
  if (activeTab === 'movement') renderMovement(body, state);
  if (activeTab === 'lowstock') renderLowStock(body, state);
}

function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function rangeBar() {
  return `
    <div class="date-presets">
      <button type="button" class="preset-btn ${activePreset === 'all' ? 'is-active' : ''}" data-preset="all">All Time</button>
      <button type="button" class="preset-btn ${activePreset === 'this_month' ? 'is-active' : ''}" data-preset="this_month">This Month</button>
      <button type="button" class="preset-btn ${activePreset === '30d' ? 'is-active' : ''}" data-preset="30d">Last 30 Days</button>
      <button type="button" class="preset-btn ${activePreset === '7d' ? 'is-active' : ''}" data-preset="7d">Last 7 Days</button>
      <button type="button" class="preset-btn ${activePreset === 'today' ? 'is-active' : ''}" data-preset="today">Today</button>
    </div>
    <div class="filter-bar">
      <div class="field">
        <label class="text-tiny">From</label>
        <input type="date" id="r-from" value="${range.from}">
      </div>
      <div class="field">
        <label class="text-tiny">To</label>
        <input type="date" id="r-to" value="${range.to}">
      </div>
      <button class="btn btn--secondary" id="r-clear">${icon('close')}<span>Reset</span></button>
    </div>`;
}

function wireRangeBar(host, onChange) {
  const now = new Date();
  const todayStr = todayInputValue();

  $$('.preset-btn', host).forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      if (preset === 'all') {
        range = { from: '', to: '' };
      } else if (preset === 'today') {
        range = { from: todayStr, to: todayStr };
      } else if (preset === '7d') {
        const past = new Date(now.getTime() - 6 * 86400000);
        range = { from: past.toISOString().slice(0, 10), to: todayStr };
      } else if (preset === '30d') {
        const past = new Date(now.getTime() - 29 * 86400000);
        range = { from: past.toISOString().slice(0, 10), to: todayStr };
      } else if (preset === 'this_month') {
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        const tz = first.getTimezoneOffset() * 60000;
        range = { from: new Date(first - tz).toISOString().slice(0, 10), to: todayStr };
      }
      activePreset = preset;
      onChange();
    });
  });

  $('#r-from', host)?.addEventListener('change', (e) => {
    range.from = e.target.value;
    activePreset = '';
    onChange();
  });
  $('#r-to', host)?.addEventListener('change', (e) => {
    range.to = e.target.value;
    activePreset = '';
    onChange();
  });
  $('#r-clear', host)?.addEventListener('click', () => {
    range = { from: '', to: '' };
    activePreset = 'all';
    onChange();
  });
}

function inSelectedRange(dateVal) {
  const from = range.from ? new Date(range.from + 'T00:00:00') : null;
  const to = range.to ? new Date(range.to + 'T23:59:59') : null;
  if (!from && !to) return true;
  return withinRange(dateVal, from, to);
}

function kpi(iconName, label, value, sub = '', variant = '') {
  return `
    <div class="kpi-card">
      <div class="kpi-card__top">
        <span class="kpi-card__label">${label}</span>
        <span class="kpi-card__icon ${variant ? `kpi-card__icon--${variant}` : ''}">${icon(iconName)}</span>
      </div>
      <div class="kpi-card__value">${value}</div>
      ${sub ? `<div class="kpi-card__sub">${sub}</div>` : ''}
    </div>`;
}

function emptyMini(text) {
  return `<p class="text-tiny" style="padding:24px 0;text-align:center;color:var(--text-tertiary);">${escapeHtml(text)}</p>`;
}

// ---------------- 1. Inventory by Location ----------------
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
  const totalEvCount = rows.reduce((s, r) => s + r.evCount, 0);
  const totalBattCount = rows.reduce((s, r) => s + r.battCount, 0);
  const totalChgCount = rows.reduce((s, r) => s + r.chgCount, 0);
  const totalEvValue = rows.reduce((s, r) => s + r.evValue, 0);

  // Battery type counts in stock
  const leadBattCount = state.batteryUnits.filter(u => u.status === STATUS.IN_STOCK && u.batteryType === 'Lead Battery').length;
  const lithiumBattCount = state.batteryUnits.filter(u => u.status === STATUS.IN_STOCK && u.batteryType === 'Lithium Battery').length;

  host.innerHTML = `
    <div class="card mb-4">
      <div class="card__header">
        <div>
          <h3>Stock &amp; Valuation by Shop</h3>
          <p>Real-time physical asset counts and valuation across all 5 dealerships</p>
        </div>
        <button class="btn btn--pdf btn--sm" id="btn-export-inv-pdf">${icon('download')}<span>Download Valuation (PDF)</span></button>
      </div>
      <div class="table-wrap table-wrap--responsive">
        <table>
          <thead>
            <tr>
              <th>Shop Location</th>
              <th class="num">EVs</th>
              <th class="num">Batteries</th>
              <th class="num">Chargers</th>
              <th class="num">EV Stock Value</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td data-label="Shop" class="cell-strong">${escapeHtml(r.l.name)}</td>
                <td data-label="EVs" class="num">${r.evCount}</td>
                <td data-label="Batteries" class="num">${r.battCount}</td>
                <td data-label="Chargers" class="num">${r.chgCount}</td>
                <td data-label="EV stock value" class="num cell-strong">${formatMoney(r.evValue)}</td>
              </tr>`).join('')}
            <tr style="font-weight:700; background:var(--accent-soft);">
              <td data-label="Shop">Total Dealership Network</td>
              <td data-label="EVs" class="num">${totalEvCount}</td>
              <td data-label="Batteries" class="num">${totalBattCount}</td>
              <td data-label="Chargers" class="num">${totalChgCount}</td>
              <td data-label="EV stock value" class="num" style="color:var(--accent);">${formatMoney(totalEvValue)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Visual Charts Grid -->
    <div class="chart-grid">
      <div class="chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title">EV Stock Valuation by Shop</div>
            <div class="chart-card__sub">Distribution of inventory capital tied in ready-to-sell EVs</div>
          </div>
          ${icon('store')}
        </div>
        <div class="chart-container">
          <canvas id="inv-valuation-chart"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title">Battery Technology Distribution</div>
            <div class="chart-card__sub">Active 12W units in stock (Lead vs. Lithium)</div>
          </div>
          ${icon('battery')}
        </div>
        <div class="chart-container">
          <canvas id="inv-battery-chart"></canvas>
        </div>
      </div>
    </div>

    <div class="card mt-4">
      <div class="card__header">
        <div>
          <h3>Centralized Spare Parts Warehouse (Jadcherla)</h3>
          <p>Total quantity and valuation across catalog replacement components</p>
        </div>
        ${icon('package')}
      </div>
      <div class="kpi-grid" style="margin-bottom:0;">
        ${kpi('boxes', 'Total stock pieces', sparePartsQty)}
        ${kpi('wallet', 'Spare parts valuation', formatMoney(sparePartsValue), 'Central warehouse inventory', 'info')}
        ${kpi('alert', 'Low stock parts', state.spareParts.filter(p => (p.quantity || 0) <= (p.reorderLevel || 0)).length, 'Reorder needed', 'warn')}
      </div>
    </div>
  `;

  // Attach PDF export
  $('#btn-export-inv-pdf', host)?.addEventListener('click', () => {
    generateInventoryValuationPdf({
      state,
      scopeLabel: getScopeLabel(state),
      locationRows: rows,
      sparePartsTotal: { quantity: sparePartsQty, value: sparePartsValue }
    });
  });

  // Render Charts if Chart.js available
  if (window.Chart) {
    // 1. Valuation Bar Chart
    const valCtx = $('#inv-valuation-chart', host);
    if (valCtx) {
      const chart = new window.Chart(valCtx, {
        type: 'bar',
        data: {
          labels: rows.map(r => r.l.name.replace(/ \(.+\)/, '')),
          datasets: [{
            label: 'EV Stock Value (₹)',
            data: rows.map(r => r.evValue),
            backgroundColor: 'rgba(20, 97, 79, 0.85)',
            borderColor: '#14614f',
            borderWidth: 1,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => ` Stock Value: Rs. ${Number(ctx.raw).toLocaleString('en-IN')}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (v) => `Rs. ${(v / 1000).toFixed(0)}k`
              }
            }
          }
        }
      });
      registerChart('invValuation', chart);
    }

    // 2. Battery Mix Donut Chart
    const battCtx = $('#inv-battery-chart', host);
    if (battCtx) {
      const totalB = leadBattCount + lithiumBattCount;
      const chart = new window.Chart(battCtx, {
        type: 'doughnut',
        data: {
          labels: ['Lead Battery (12W)', 'Lithium Battery (12W)'],
          datasets: [{
            data: totalB > 0 ? [leadBattCount, lithiumBattCount] : [1, 0],
            backgroundColor: ['#14614f', '#0284c7'],
            borderColor: '#ffffff',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.label}: ${totalB > 0 ? ctx.raw : 0} units`
              }
            }
          }
        }
      });
      registerChart('invBattery', chart);
    }
  }
}

// ---------------- 2. Sales & Revenue ----------------
function renderSales(host, state) {
  host.innerHTML = rangeBar() + `<div id="sales-report-body"></div>`;
  wireRangeBar(host, () => renderSales(host, state));
  const body = $('#sales-report-body', host);

  const lf = state.locationFilter;
  const inScopeEvs = state.evUnits.filter(e => inLocation(e, lf));
  const sales = state.sales.filter(s => inLocation(s, lf) && inSelectedRange(s.date));

  const revenue = sales.reduce((s, x) => s + (x.price || 0), 0);
  const profit = sales.reduce((s, x) => s + (x.profit || 0), 0);
  const marginPct = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0.0';
  const evUnitsSold = sales.filter(s => s.type === 'ev').length;

  // Operating Expenses in selected scope and range
  const expenses = (state.expenses || [])
    .filter(e => inLocation(e, lf))
    .filter(e => inSelectedRange(e.date));
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit = profit - totalExpenses;
  const netMarginPct = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : '0.0';

  // 1. Executive Insight: Top EV Model
  const modelSalesMap = new Map();
  sales.filter(s => s.type === 'ev').forEach(s => {
    const key = `${s.providerId || ''}|${(s.model || 'Standard').trim()}`;
    if (!modelSalesMap.has(key)) {
      modelSalesMap.set(key, { providerId: s.providerId, model: (s.model || 'Standard').trim(), count: 0, rev: 0 });
    }
    const item = modelSalesMap.get(key);
    item.count += 1;
    item.rev += (s.price || 0);
  });
  const topModelArr = Array.from(modelSalesMap.values()).sort((a, b) => b.rev - a.rev);
  const topModel = topModelArr[0] || null;

  // 2. Executive Insight: Leading Showroom
  const locationRevMap = new Map();
  sales.forEach(s => {
    const locId = s.locationId || 'unknown';
    locationRevMap.set(locId, (locationRevMap.get(locId) || 0) + (s.price || 0));
  });
  const topLocArr = Array.from(locationRevMap.entries()).sort((a, b) => b[1] - a[1]);
  const topLocationId = topLocArr[0]?.[0];
  const topLocationRev = topLocArr[0]?.[1] || 0;
  const topLocPct = revenue > 0 ? ((topLocationRev / revenue) * 100).toFixed(0) : 0;

  // 3. Working Capital in Stock
  const evCapital = inScopeEvs.filter(e => e.status === STATUS.IN_STOCK).reduce((s, e) => s + (e.sellingPrice || 0), 0);
  const battCapital = state.batteryUnits.filter(u => inLocation(u, lf) && u.status === STATUS.IN_STOCK).reduce((s, u) => s + (u.sellingPrice || 0), 0);
  const chgCapital = state.chargerUnits.filter(u => inLocation(u, lf) && u.status === STATUS.IN_STOCK).reduce((s, u) => s + (u.sellingPrice || 0), 0);
  const partsCapital = (lf === 'all' || lf === 'loc_jadcherla')
    ? state.spareParts.reduce((s, p) => s + (p.quantity || 0) * (p.sellingPrice || 0), 0)
    : 0;
  const totalWorkingCapital = evCapital + battCapital + chgCapital + partsCapital;

  // Category breakdown
  const evRev = sales.filter(s => s.type === 'ev').reduce((s, x) => s + (x.price || 0), 0);
  const battRev = sales.filter(s => s.type === 'battery').reduce((s, x) => s + (x.price || 0), 0);
  const chgRev = sales.filter(s => s.type === 'charger').reduce((s, x) => s + (x.price || 0), 0);
  const partsRev = sales.filter(s => s.type === 'part').reduce((s, x) => s + (x.price || 0), 0);

  // Payment breakdown
  const byPayment = new Map();
  sales.forEach(s => {
    const key = s.paymentMethod || 'Cash';
    byPayment.set(key, (byPayment.get(key) || 0) + (s.price || 0));
  });

  // Prepare structured insights array for PDF & UI
  const insights = [
    {
      title: 'Net Profit & Operating Margin',
      metric: `${formatMoney(netProfit)}`,
      desc: revenue > 0
        ? `Sales Gross Profit: ${formatMoney(profit)} less ${formatMoney(totalExpenses)} showroom expenses (${netMarginPct}% net margin).`
        : 'Awaiting transactions in this period.',
      variant: netProfit >= 0 ? 'success' : 'warning',
      iconName: 'wallet'
    },
    {
      title: 'Top Revenue EV Model',
      metric: topModel ? `${topModel.model}` : 'None Recorded',
      desc: topModel
        ? `${providerName(topModel.providerId)} generated ${formatMoney(topModel.rev)} across ${topModel.count} unit${topModel.count === 1 ? '' : 's'}.`
        : 'No EV vehicle sales recorded in this selected range.',
      variant: 'info',
      iconName: 'ev'
    },
    {
      title: 'Leading Showroom Contribution',
      metric: topLocationId ? locationName(topLocationId) : 'All Locations',
      desc: topLocationId
        ? `Generated ${formatMoney(topLocationRev)} (${topLocPct}% of total turnover in this period).`
        : 'Awaiting showroom sales distribution.',
      variant: 'info',
      iconName: 'store'
    },
    {
      title: 'Active Working Capital',
      metric: formatMoney(totalWorkingCapital),
      desc: `Capital in stock: EVs (${formatMoney(evCapital)}), Batteries & Chargers (${formatMoney(battCapital + chgCapital)}).`,
      variant: 'info',
      iconName: 'boxes'
    }
  ];

  body.innerHTML = `
    <!-- Top Action Bar with Branded PDF Trigger -->
    <div class="flex-between mb-3" style="flex-wrap:wrap; gap:var(--space-2);">
      <div>
        <h3 style="margin:0;">Executive Sales &amp; Financial Overview</h3>
        <p class="text-tiny" style="margin:2px 0 0 0;">Scope: ${escapeHtml(getScopeLabel(state))} · Period: ${escapeHtml(getRangeLabel())}</p>
      </div>
      <div class="btn-group">
        <button class="btn btn--pdf" id="btn-export-exec-pdf">${icon('download')}<span>Download Executive Report (PDF)</span></button>
        <button class="btn btn--secondary" id="export-sales-csv">${icon('download')}<span>Export CSV</span></button>
      </div>
    </div>

    <!-- Executive Business Intelligence Insights Cards -->
    <div class="insight-grid">
      ${insights.map(ins => `
        <div class="insight-card insight-card--${ins.variant}">
          <div class="insight-card__icon">${icon(ins.iconName)}</div>
          <div class="insight-card__body">
            <div class="insight-card__label">${escapeHtml(ins.title)}</div>
            <div class="insight-card__metric">${escapeHtml(ins.metric)}</div>
            <div class="insight-card__desc">${escapeHtml(ins.desc)}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- KPIs Row -->
    <div class="kpi-grid">
      ${kpi('sales', 'Total transactions', sales.length, `${evUnitsSold} EV units sold`)}
      ${kpi('wallet', 'Gross revenue', formatMoney(revenue), `${marginPct}% gross margin`, 'info')}
      ${kpi('reports', 'Gross profit', formatMoney(profit), 'Sales margin before expenses', 'info')}
      ${kpi('wallet', 'Operating expenses', formatMoney(totalExpenses), `${expenses.length} expense entries`, totalExpenses > 0 ? 'warn' : '')}
      ${kpi('reports', 'Net profit', formatMoney(netProfit), `After deducting expenses`, netProfit >= 0 ? 'success' : 'danger')}
      ${kpi('ev', 'EV units sold', evUnitsSold, topModel ? `Leader: ${topModel.model}` : '')}
    </div>

    <!-- Interactive Visual Charts Grid -->
    <div class="chart-grid">
      <div class="chart-card" style="grid-column: 1 / -1;">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title">Revenue &amp; Net Profit Trend</div>
            <div class="chart-card__sub">Chronological timeline of gross turnover vs realized dealer margin</div>
          </div>
          ${icon('reports')}
        </div>
        <div class="chart-container chart-container--tall">
          <canvas id="sales-trend-chart"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title">Revenue by Product Category</div>
            <div class="chart-card__sub">Distribution between EVs, batteries, chargers &amp; spare parts</div>
          </div>
          ${icon('pie')}
        </div>
        <div class="chart-container">
          <canvas id="sales-category-chart"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title">Expenses by Category</div>
            <div class="chart-card__sub">Breakdown of showroom and business operational costs</div>
          </div>
          ${icon('wallet')}
        </div>
        <div class="chart-container">
          <canvas id="expenses-category-chart"></canvas>
        </div>
      </div>

      <div class="chart-card" style="grid-column: 1 / -1;">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title">Payment Methods Share</div>
            <div class="chart-card__sub">Settlement channel breakdown (Cash, UPI, Finance, Cards)</div>
          </div>
          ${icon('wallet')}
        </div>
        <div class="chart-container">
          <canvas id="sales-payment-chart"></canvas>
        </div>
      </div>
    </div>

    <!-- All Transactions Table in Period -->
    <div class="card mt-4">
      <div class="card__header">
        <div>
          <h3>Transaction Audit Log</h3>
          <p>${sales.length} transaction${sales.length === 1 ? '' : 's'} recorded</p>
        </div>
      </div>
      ${sales.length ? `
      <div class="table-wrap table-wrap--responsive">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Type</th>
              <th>Customer</th>
              <th>Location</th>
              <th>Payment</th>
              <th class="num">Revenue</th>
              <th class="num">Profit</th>
            </tr>
          </thead>
          <tbody>
            ${sales.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)).map(s => `
              <tr>
                <td data-label="Invoice" class="cell-strong">${escapeHtml(s.invoiceNo || '—')}</td>
                <td data-label="Date">${formatDateTime(s.date)}</td>
                <td data-label="Type"><span class="badge badge--info">${s.type}</span></td>
                <td data-label="Customer">${escapeHtml(s.customerName || '—')}</td>
                <td data-label="Location">${escapeHtml(locationName(s.locationId))}</td>
                <td data-label="Payment">${escapeHtml(s.paymentMethod || 'Cash')}</td>
                <td data-label="Revenue" class="num cell-strong">${formatMoney(s.price)}</td>
                <td data-label="Profit" class="num" style="color:var(--accent);">${formatMoney(s.profit)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : emptyMini('No transactions recorded within this date range')}
    </div>
  `;

  // Render Charts
  if (window.Chart) {
    // 1. Trend Chart
    const trendCtx = $('#sales-trend-chart', host);
    if (trendCtx) {
      // Group sales by day
      const dateMap = new Map();
      const sorted = [...sales].sort((a, b) => {
        const ta = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
        const tb = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
        return ta - tb;
      });

      sorted.forEach(s => {
        const d = s.date?.toDate ? s.date.toDate() : new Date(s.date);
        if (isNaN(d)) return;
        const key = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        if (!dateMap.has(key)) dateMap.set(key, { rev: 0, profit: 0 });
        const e = dateMap.get(key);
        e.rev += (s.price || 0);
        e.profit += (s.profit || 0);
      });

      const trendLabels = dateMap.size > 0 ? Array.from(dateMap.keys()) : ['No Sales'];
      const trendRev = dateMap.size > 0 ? Array.from(dateMap.values()).map(v => v.rev) : [0];
      const trendProf = dateMap.size > 0 ? Array.from(dateMap.values()).map(v => v.profit) : [0];

      const chart = new window.Chart(trendCtx, {
        type: 'bar',
        data: {
          labels: trendLabels,
          datasets: [
            {
              label: 'Gross Revenue (₹)',
              data: trendRev,
              backgroundColor: 'rgba(20, 97, 79, 0.85)',
              borderColor: '#14614f',
              borderWidth: 1,
              borderRadius: 4
            },
            {
              label: 'Net Profit (₹)',
              data: trendProf,
              backgroundColor: 'rgba(16, 185, 129, 0.85)',
              borderColor: '#10b981',
              borderWidth: 1,
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: Rs. ${Number(ctx.raw).toLocaleString('en-IN')}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (v) => `Rs. ${(v / 1000).toFixed(0)}k`
              }
            }
          }
        }
      });
      registerChart('salesTrend', chart);
    }

    // 2. Category Share Chart
    const catCtx = $('#sales-category-chart', host);
    if (catCtx) {
      const catData = [evRev, battRev, chgRev, partsRev];
      const hasCatData = catData.some(v => v > 0);
      const chart = new window.Chart(catCtx, {
        type: 'doughnut',
        data: {
          labels: ['EV Vehicles', 'Batteries', 'Chargers', 'Spare Parts'],
          datasets: [{
            data: hasCatData ? catData : [1, 0, 0, 0],
            backgroundColor: ['#14614f', '#0284c7', '#f59e0b', '#8b5cf6'],
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                label: (ctx) => hasCatData ? ` ${ctx.label}: Rs. ${Number(ctx.raw).toLocaleString('en-IN')}` : ' No sales data'
              }
            }
          }
        }
      });
      registerChart('salesCategory', chart);
    }

    // 2b. Expenses Category Chart
    const expCtx = $('#expenses-category-chart', host);
    if (expCtx) {
      const expCatMap = new Map();
      expenses.forEach(e => {
        const cat = e.category || 'Misc / Other';
        expCatMap.set(cat, (expCatMap.get(cat) || 0) + (e.amount || 0));
      });
      const expLabels = expCatMap.size > 0 ? Array.from(expCatMap.keys()) : ['No Expenses'];
      const expData = expCatMap.size > 0 ? Array.from(expCatMap.values()) : [1];
      const hasExpData = expCatMap.size > 0;

      const chart = new window.Chart(expCtx, {
        type: 'doughnut',
        data: {
          labels: expLabels,
          datasets: [{
            data: expData,
            backgroundColor: ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'],
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                label: (ctx) => hasExpData ? ` ${ctx.label}: Rs. ${Number(ctx.raw).toLocaleString('en-IN')}` : ' No expense data'
              }
            }
          }
        }
      });
      registerChart('expensesCategory', chart);
    }

    // 3. Payment Methods Chart
    const payCtx = $('#sales-payment-chart', host);
    if (payCtx) {
      const payLabels = byPayment.size > 0 ? Array.from(byPayment.keys()) : ['No Sales'];
      const payData = byPayment.size > 0 ? Array.from(byPayment.values()) : [1];
      const hasPayData = byPayment.size > 0;

      const chart = new window.Chart(payCtx, {
        type: 'doughnut',
        data: {
          labels: payLabels,
          datasets: [{
            data: payData,
            backgroundColor: ['#0d9488', '#3b82f6', '#6366f1', '#ec4899', '#f97316', '#84cc16'],
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                label: (ctx) => hasPayData ? ` ${ctx.label}: Rs. ${Number(ctx.raw).toLocaleString('en-IN')}` : ' No sales data'
              }
            }
          }
        }
      });
      registerChart('salesPayment', chart);
    }
  }

  // Hook PDF & CSV Buttons
  $('#btn-export-exec-pdf', host)?.addEventListener('click', async () => {
    // Collect snapshots of canvases
    const trendImg = activeCharts.get('salesTrend')?.toBase64Image();
    const catImg = activeCharts.get('salesCategory')?.toBase64Image();
    const payImg = activeCharts.get('salesPayment')?.toBase64Image();

    await generateExecutiveReportPdf({
      state,
      sales,
      evUnits: inScopeEvs,
      scopeLabel: getScopeLabel(state),
      rangeLabel: getRangeLabel(),
      insights: insights.map(i => ({ title: i.title, desc: `${i.metric} — ${i.desc}` })),
      chartImages: {
        trend: trendImg,
        category: catImg,
        payment: payImg
      }
    });
  });

  $('#export-sales-csv', host)?.addEventListener('click', () => exportSalesCsv(sales));
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
  a.href = url;
  a.download = `sales-report-${todayInputValue()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------- 3. EV Model Report ----------------
function renderModelReport(host, state) {
  host.innerHTML = rangeBar() + `
    <div class="filter-bar" style="margin-top:-10px;">
      <div class="search-input" style="flex:1;">
        ${icon('search')}
        <input type="text" id="model-search" placeholder="Search EV brand or model name...">
      </div>
    </div>
    <div id="model-report-body"></div>`;

  wireRangeBar(host, () => renderModelReport(host, state));
  const body = $('#model-report-body', host);
  const searchInput = $('#model-search', host);

  const lf = state.locationFilter;
  const inScopeEvs = state.evUnits.filter(e => inLocation(e, lf));
  const inScopeSales = state.sales.filter(s => s.type === 'ev' && inLocation(s, lf) && inSelectedRange(s.date));

  const modelMap = new Map();

  function getModelEntry(providerId, modelRaw) {
    const cleanModel = (modelRaw || 'Standard').trim();
    const key = `${providerId || 'unknown'}|${cleanModel.toLowerCase()}`;
    if (!modelMap.has(key)) {
      modelMap.set(key, {
        key,
        providerId: providerId || '',
        model: cleanModel,
        inStock: 0,
        inStockValue: 0,
        soldCount: 0,
        revenue: 0,
        profit: 0,
        stockUnits: [],
        salesRecords: []
      });
    }
    return modelMap.get(key);
  }

  inScopeEvs.forEach(e => {
    const entry = getModelEntry(e.providerId, e.model);
    if (e.status === STATUS.IN_STOCK) {
      entry.inStock += 1;
      entry.inStockValue += (e.sellingPrice || 0);
      entry.stockUnits.push(e);
    }
  });

  inScopeSales.forEach(s => {
    const entry = getModelEntry(s.providerId, s.model);
    entry.soldCount += 1;
    entry.revenue += (s.price || 0);
    entry.profit += (s.profit || 0);
    entry.salesRecords.push(s);
  });

  const rows = Array.from(modelMap.values());

  function renderList() {
    const query = (searchInput.value || '').trim().toLowerCase();
    let filtered = rows;
    if (query) {
      filtered = filtered.filter(r =>
        providerName(r.providerId).toLowerCase().includes(query) ||
        r.model.toLowerCase().includes(query)
      );
    }
    filtered.sort((a, b) => b.soldCount - a.soldCount || b.inStock - a.inStock || b.revenue - a.revenue);

    const totalInStock = filtered.reduce((s, r) => s + r.inStock, 0);
    const totalSold = filtered.reduce((s, r) => s + r.soldCount, 0);
    const totalRev = filtered.reduce((s, r) => s + r.revenue, 0);
    const totalProfit = filtered.reduce((s, r) => s + r.profit, 0);
    const totalStockValue = filtered.reduce((s, r) => s + r.inStockValue, 0);
    const topModel = filtered.find(r => r.soldCount > 0);

    body.innerHTML = `
      <div class="flex-between mb-3" style="flex-wrap:wrap; gap:var(--space-2);">
        <div>
          <h3 style="margin:0;">EV Model Performance</h3>
          <p class="text-tiny" style="margin:2px 0 0 0;">Scope: ${escapeHtml(getScopeLabel(state))} · Period: ${escapeHtml(getRangeLabel())}</p>
        </div>
        <div class="btn-group">
          <button class="btn btn--pdf" id="btn-export-model-pdf">${icon('download')}<span>Download Model Report (PDF)</span></button>
          <button class="btn btn--secondary" id="export-model-csv">${icon('download')}<span>Export CSV</span></button>
        </div>
      </div>

      <div class="kpi-grid">
        ${kpi('ev', 'Models tracked', filtered.length)}
        ${kpi('boxes', 'EVs in stock', totalInStock, `${formatMoney(totalStockValue)} inventory value`)}
        ${kpi('sales', 'EVs sold in period', totalSold, topModel ? `Leader: ${providerName(topModel.providerId)} ${topModel.model}` : 'No sales yet')}
        ${kpi('wallet', 'EV model revenue', formatMoney(totalRev), `${formatMoney(totalProfit)} profit`, 'info')}
      </div>

      <!-- Top EV Models Comparison Chart -->
      <div class="card mb-4">
        <div class="card__header">
          <div>
            <h3>Top EV Models by Revenue</h3>
            <p>Direct comparison of best performing EV variants in current date range</p>
          </div>
          ${icon('reports')}
        </div>
        <div class="chart-container" style="height:270px;">
          <canvas id="model-comparison-chart"></canvas>
        </div>
      </div>

      <div class="card">
        <div class="card__header">
          <div>
            <h3>Model Audit Table</h3>
            <p>${filtered.length} model${filtered.length === 1 ? '' : 's'} cataloged</p>
          </div>
        </div>
        ${filtered.length ? `
        <div class="table-wrap table-wrap--responsive">
          <table>
            <thead>
              <tr>
                <th>Brand &amp; Model</th>
                <th class="num">In Stock</th>
                <th class="num">Stock Value</th>
                <th class="num">Units Sold</th>
                <th class="num">Revenue</th>
                <th class="num">Profit</th>
                <th class="num">Avg Price</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(r => {
                const avgPrice = r.soldCount ? Math.round(r.revenue / r.soldCount) : 0;
                return `
                <tr>
                  <td data-label="Model" class="cell-strong">
                    ${escapeHtml(providerName(r.providerId))}
                    <div class="cell-muted">${escapeHtml(r.model)}</div>
                  </td>
                  <td data-label="In Stock" class="num cell-strong">${r.inStock}</td>
                  <td data-label="Stock Value" class="num">${formatMoney(r.inStockValue)}</td>
                  <td data-label="Sold" class="num cell-strong" style="color:var(--accent);">${r.soldCount}</td>
                  <td data-label="Revenue" class="num">${formatMoney(r.revenue)}</td>
                  <td data-label="Profit" class="num">${formatMoney(r.profit)}</td>
                  <td data-label="Avg Price" class="num">${avgPrice ? formatMoney(avgPrice) : '—'}</td>
                  <td data-label="Actions" style="text-align:right;">
                    <button type="button" class="btn btn--secondary btn--sm model-view-btn" data-key="${r.key}">View Details</button>
                  </td>
                </tr>`;
              }).join('')}
              <tr style="font-weight:700; background:var(--accent-soft);">
                <td data-label="Model">Total Summary</td>
                <td data-label="In Stock" class="num">${totalInStock}</td>
                <td data-label="Stock Value" class="num">${formatMoney(totalStockValue)}</td>
                <td data-label="Sold" class="num">${totalSold}</td>
                <td data-label="Revenue" class="num">${formatMoney(totalRev)}</td>
                <td data-label="Profit" class="num">${formatMoney(totalProfit)}</td>
                <td data-label="Avg Price" class="num">${totalSold ? formatMoney(Math.round(totalRev / totalSold)) : '—'}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>` : emptyMini('No EV models found matching your search')}
      </div>
    `;

    // Render Model Comparison Chart
    if (window.Chart) {
      const chartCtx = $('#model-comparison-chart', body);
      if (chartCtx) {
        const top6 = filtered.slice(0, 6);
        const labels = top6.map(r => `${providerName(r.providerId)} ${r.model}`);
        const revData = top6.map(r => r.revenue);

        const chart = new window.Chart(chartCtx, {
          type: 'bar',
          data: {
            labels: labels.length ? labels : ['No models'],
            datasets: [{
              label: 'Realized Revenue (₹)',
              data: revData.length ? revData : [0],
              backgroundColor: 'rgba(20, 97, 79, 0.85)',
              borderColor: '#14614f',
              borderWidth: 1,
              borderRadius: 4
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const row = top6[ctx.dataIndex];
                    return [
                      ` Revenue: Rs. ${Number(ctx.raw).toLocaleString('en-IN')}`,
                      ` Units Sold: ${row ? row.soldCount : 0}`,
                      ` In Stock: ${row ? row.inStock : 0}`
                    ];
                  }
                }
              }
            },
            scales: {
              x: {
                beginAtZero: true,
                ticks: {
                  callback: (v) => `Rs. ${(v / 1000).toFixed(0)}k`
                }
              }
            }
          }
        });
        registerChart('modelComparison', chart);
      }
    }

    // Attach Row "View Details" Click Handlers for Drilldown Modal
    $$('.model-view-btn', body).forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const modelRecord = rows.find(r => r.key === key);
        if (modelRecord) openModelDrilldownModal(modelRecord, state);
      });
    });

    // PDF and CSV buttons
    $('#btn-export-model-pdf', body)?.addEventListener('click', () => {
      generateModelReportPdf({
        rows: filtered,
        scopeLabel: getScopeLabel(state),
        rangeLabel: getRangeLabel(),
        providerNameFn: providerName
      });
    });

    $('#export-model-csv', body)?.addEventListener('click', () => exportModelReportCsv(filtered));
  }

  renderList();
  searchInput.addEventListener('input', renderList);
}

// ---------------- EV Model Drilldown Modal ----------------
function openModelDrilldownModal(r, state) {
  const avgPrice = r.soldCount ? Math.round(r.revenue / r.soldCount) : 0;
  const brandName = providerName(r.providerId);

  // Shop breakdown of in-stock units
  const locDistribution = state.locations.map(loc => {
    const count = r.stockUnits.filter(u => u.locationId === loc.id).length;
    return { name: loc.name, count };
  }).filter(l => l.count > 0);

  const bodyHtml = `
    <div class="drilldown-stat-grid">
      <div class="drilldown-stat">
        <div class="drilldown-stat__label">Units in Stock</div>
        <div class="drilldown-stat__val">${r.inStock}</div>
      </div>
      <div class="drilldown-stat">
        <div class="drilldown-stat__label">Stock Valuation</div>
        <div class="drilldown-stat__val">${formatMoney(r.inStockValue)}</div>
      </div>
      <div class="drilldown-stat">
        <div class="drilldown-stat__label">Sold in Range</div>
        <div class="drilldown-stat__val" style="color:var(--accent);">${r.soldCount}</div>
      </div>
      <div class="drilldown-stat">
        <div class="drilldown-stat__label">Realized Revenue</div>
        <div class="drilldown-stat__val">${formatMoney(r.revenue)}</div>
      </div>
      <div class="drilldown-stat">
        <div class="drilldown-stat__label">Realized Profit</div>
        <div class="drilldown-stat__val" style="color:var(--accent);">${formatMoney(r.profit)}</div>
      </div>
      <div class="drilldown-stat">
        <div class="drilldown-stat__label">Avg Selling Price</div>
        <div class="drilldown-stat__val">${avgPrice ? formatMoney(avgPrice) : '—'}</div>
      </div>
    </div>

    <div class="mb-3">
      <h4 style="font-size:13px; font-weight:700; margin-bottom:6px;">Current Stock by Showroom</h4>
      ${locDistribution.length ? `
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${locDistribution.map(l => `
            <span class="badge badge--neutral" style="padding:6px 12px; font-size:12px;">
              <strong>${escapeHtml(l.name)}:</strong>&nbsp;${l.count} unit${l.count === 1 ? '' : 's'}
            </span>
          `).join('')}
        </div>
      ` : '<p class="text-tiny">No units currently in stock across dealerships.</p>'}
    </div>

    <div class="mb-3">
      <h4 style="font-size:13px; font-weight:700; margin-bottom:6px;">Ready-to-Sell Chassis in Stock (${r.stockUnits.length})</h4>
      ${r.stockUnits.length ? `
        <div class="table-wrap" style="max-height:160px; overflow-y:auto;">
          <table>
            <thead>
              <tr><th>Chassis No</th><th>Color</th><th>Location</th><th class="num">Selling Price</th></tr>
            </thead>
            <tbody>
              ${r.stockUnits.map(u => `
                <tr>
                  <td class="cell-strong" style="font-family:monospace; font-size:12px;">${escapeHtml(u.chassisNo || '—')}</td>
                  <td>${escapeHtml(u.color || 'Standard')}</td>
                  <td>${escapeHtml(locationName(u.locationId))}</td>
                  <td class="num">${formatMoney(u.sellingPrice)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p class="text-tiny">No units in stock.</p>'}
    </div>

    <div>
      <h4 style="font-size:13px; font-weight:700; margin-bottom:6px;">Recent Sales for this Model (${r.salesRecords.length})</h4>
      ${r.salesRecords.length ? `
        <div class="table-wrap" style="max-height:160px; overflow-y:auto;">
          <table>
            <thead>
              <tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Location</th><th class="num">Price</th></tr>
            </thead>
            <tbody>
              ${r.salesRecords.slice(0, 10).map(s => `
                <tr>
                  <td class="cell-strong">${escapeHtml(s.invoiceNo || '—')}</td>
                  <td>${formatDateTime(s.date)}</td>
                  <td>${escapeHtml(s.customerName || '—')}</td>
                  <td>${escapeHtml(locationName(s.locationId))}</td>
                  <td class="num cell-strong">${formatMoney(s.price)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p class="text-tiny">No sales in this date period.</p>'}
    </div>
  `;

  openModal({
    title: `${brandName} ${r.model} — Model Drilldown Audit`,
    bodyHtml,
    footerHtml: `<button type="button" class="btn btn--secondary" data-close-modal>Close</button>`,
    size: 'lg'
  });
}

function exportModelReportCsv(rows) {
  const headers = ['Brand', 'Model', 'In Stock', 'Stock Value', 'Units Sold', 'Revenue', 'Profit', 'Avg Selling Price'];
  const data = rows.map(r => [
    providerName(r.providerId),
    r.model,
    r.inStock,
    r.inStockValue,
    r.soldCount,
    r.revenue,
    r.profit,
    r.soldCount ? Math.round(r.revenue / r.soldCount) : 0
  ]);
  const csv = [headers, ...data].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ev-model-report-${todayInputValue()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------- 4. Stock Movement ----------------
function renderMovement(host, state) {
  host.innerHTML = rangeBar() + `<div id="movement-body"></div>`;
  wireRangeBar(host, () => renderMovement(host, state));
  const body = $('#movement-body', host);
  const logs = state.stockLog.filter(l => inSelectedRange(l.date)).sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

  body.innerHTML = `
    <div class="card">
      <div class="card__header">
        <div>
          <h3>Movement History &amp; Audit Trail</h3>
          <p>${logs.length} inventory event${logs.length === 1 ? '' : 's'} recorded</p>
        </div>
        ${icon('refresh')}
      </div>
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

// ---------------- 5. Low Stock ----------------
function renderLowStock(host, state) {
  const alerts = lowStockAlerts(state, 'all');
  host.innerHTML = `
    <div class="card">
      <div class="card__header">
        <div>
          <h3>Low Stock Across Dealerships</h3>
          <p>${alerts.length} item${alerts.length === 1 ? '' : 's'} below reorder threshold</p>
        </div>
        ${icon('alert')}
      </div>
      ${alerts.length ? `<ul>${alerts.map(a => `
        <li class="alert-row">
          ${icon('alert')}
          <div>
            <div class="alert-row__title">${escapeHtml(a.title)}</div>
            <div class="alert-row__sub">${escapeHtml(a.sub)}</div>
          </div>
          <div class="alert-row__count">${a.count}</div>
        </li>`).join('')}</ul>` : emptyMini('All inventory units are healthy and above reorder thresholds')}
    </div>`;
}
