import { getState, subscribe, locationName } from '../state.js';
import { icon } from '../icons.js';
import {
  $, $$, toast, formatMoney, formatDate, formatDateTime, escapeHtml,
  openModal, closeModal, confirmDialog, todayInputValue
} from '../utils.js';
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS } from '../constants.js';
import { addExpense, updateExpense, deleteExpense } from '../data/expenses.js';
import { inLocation } from './helpers.js';

let filters = {
  preset: 'today',      // 'today' | 'yesterday' | '7d' | 'this_month' | 'all' | 'custom'
  startDate: '',
  endDate: '',
  category: 'all',
  paymentMethod: 'all',
  search: ''
};

export function mount(root) {
  render(root);
  return subscribe(() => render(root));
}

function parseItemDate(d) {
  if (!d) return new Date(0);
  return d?.toDate ? d.toDate() : (d instanceof Date ? d : new Date(d));
}

function getDateRange(preset) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (preset === 'today') {
    return { start: startOfDay, end: endOfDay };
  }
  if (preset === 'yesterday') {
    const yStart = new Date(startOfDay);
    yStart.setDate(yStart.getDate() - 1);
    const yEnd = new Date(yStart.getFullYear(), yStart.getMonth(), yStart.getDate(), 23, 59, 59, 999);
    return { start: yStart, end: yEnd };
  }
  if (preset === '7d') {
    const d7 = new Date(startOfDay);
    d7.setDate(d7.getDate() - 6);
    return { start: d7, end: endOfDay };
  }
  if (preset === 'this_month') {
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: mStart, end: endOfDay };
  }
  return { start: null, end: null };
}

function categoryColorClass(cat) {
  const lower = (cat || '').toLowerCase();
  if (lower.includes('rent')) return 'badge--danger';
  if (lower.includes('electric') || lower.includes('utility')) return 'badge--warning';
  if (lower.includes('salar') || lower.includes('wage')) return 'badge--info';
  if (lower.includes('food') || lower.includes('tea') || lower.includes('refresh') || lower.includes('hospitality')) return 'badge--success';
  if (lower.includes('logistics') || lower.includes('transport')) return 'badge--info';
  return 'badge--muted';
}

function render(root) {
  const state = getState();
  const lf = state.locationFilter;
  const scopeLabel = lf === 'all' ? 'All locations' : locationName(lf);

  // All expenses in current location scope
  const allExpenses = (state.expenses || []).filter(e => inLocation(e, lf));

  // Compute KPI metrics
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const startOfYesterday = new Date(startOfDay);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const endOfYesterday = new Date(startOfYesterday.getFullYear(), startOfYesterday.getMonth(), startOfYesterday.getDate(), 23, 59, 59, 999);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const todayList = allExpenses.filter(e => {
    const d = parseItemDate(e.date);
    return d >= startOfDay && d <= endOfDay;
  });
  const todayTotal = todayList.reduce((s, e) => s + (e.amount || 0), 0);

  const yesterdayList = allExpenses.filter(e => {
    const d = parseItemDate(e.date);
    return d >= startOfYesterday && d <= endOfYesterday;
  });
  const yesterdayTotal = yesterdayList.reduce((s, e) => s + (e.amount || 0), 0);

  const monthList = allExpenses.filter(e => {
    const d = parseItemDate(e.date);
    return d >= startOfMonth && d <= endOfDay;
  });
  const monthTotal = monthList.reduce((s, e) => s + (e.amount || 0), 0);

  // Top category this month
  const categoryMap = {};
  monthList.forEach(e => {
    const c = e.category || 'Misc / Other';
    categoryMap[c] = (categoryMap[c] || 0) + (e.amount || 0);
  });
  let topCatName = 'None';
  let topCatAmount = 0;
  for (const [c, amt] of Object.entries(categoryMap)) {
    if (amt > topCatAmount) {
      topCatName = c;
      topCatAmount = amt;
    }
  }

  // Filter expenses based on current view filters
  let filtered = allExpenses;

  // Date filtering
  if (filters.preset === 'custom') {
    if (filters.startDate) {
      const s = new Date(filters.startDate + 'T00:00:00');
      filtered = filtered.filter(e => parseItemDate(e.date) >= s);
    }
    if (filters.endDate) {
      const en = new Date(filters.endDate + 'T23:59:59.999');
      filtered = filtered.filter(e => parseItemDate(e.date) <= en);
    }
  } else if (filters.preset !== 'all') {
    const { start, end } = getDateRange(filters.preset);
    if (start && end) {
      filtered = filtered.filter(e => {
        const d = parseItemDate(e.date);
        return d >= start && d <= end;
      });
    }
  }

  // Category filter
  if (filters.category !== 'all') {
    filtered = filtered.filter(e => e.category === filters.category);
  }

  // Payment method filter
  if (filters.paymentMethod !== 'all') {
    filtered = filtered.filter(e => (e.paymentMethod || 'Cash') === filters.paymentMethod);
  }

  // Search filter
  if (filters.search) {
    const q = filters.search.toLowerCase().trim();
    filtered = filtered.filter(e =>
      (e.description || '').toLowerCase().includes(q) ||
      (e.paidTo || '').toLowerCase().includes(q) ||
      (e.receiptNo || '').toLowerCase().includes(q) ||
      (e.category || '').toLowerCase().includes(q)
    );
  }

  // Total of currently filtered view
  const currentViewTotal = filtered.reduce((s, e) => s + (e.amount || 0), 0);

  // Group filtered expenses by date string (YYYY-MM-DD)
  const dayGroups = new Map();
  filtered.forEach(e => {
    const d = parseItemDate(e.date);
    const dateKey = !isNaN(d) ? d.toISOString().slice(0, 10) : 'unknown';
    if (!dayGroups.has(dateKey)) dayGroups.set(dateKey, []);
    dayGroups.get(dateKey).push(e);
  });

  // Sort day keys descending
  const sortedDayKeys = Array.from(dayGroups.keys()).sort((a, b) => b.localeCompare(a));

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Expenses</h2>
        <p>${scopeLabel} · daily showroom petty cash &amp; operating costs</p>
      </div>
      <div class="btn-group">
        <button class="btn btn--outline" id="export-csv-btn">
          ${icon('download')}<span>Export CSV</span>
        </button>
        <button class="btn btn--primary" id="add-expense-btn">
          ${icon('plus')}<span>Add Expense</span>
        </button>
      </div>
    </div>

    <!-- KPI Summary Cards -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-card__top"><span class="kpi-card__label">Today's Expenses</span>${icon('wallet')}</div>
        <div class="kpi-card__value" style="color:var(--danger);">${formatMoney(todayTotal)}</div>
        <div class="kpi-card__sub">${todayList.length} transaction${todayList.length === 1 ? '' : 's'} recorded today</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__top"><span class="kpi-card__label">Yesterday's Total</span>${icon('calendar')}</div>
        <div class="kpi-card__value">${formatMoney(yesterdayTotal)}</div>
        <div class="kpi-card__sub">${yesterdayList.length} transaction${yesterdayList.length === 1 ? '' : 's'} yesterday</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__top"><span class="kpi-card__label">This Month Total</span>${icon('reports')}</div>
        <div class="kpi-card__value">${formatMoney(monthTotal)}</div>
        <div class="kpi-card__sub">${monthList.length} expenses in current month</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__top"><span class="kpi-card__label">Top Month Category</span>${icon('pie')}</div>
        <div class="kpi-card__value" style="font-size:19px;">${escapeHtml(topCatName)}</div>
        <div class="kpi-card__sub">${formatMoney(topCatAmount)} spent this month</div>
      </div>
    </div>

    <!-- Filter Toolbar -->
    <div class="card mb-4" style="padding: var(--space-3) var(--space-4);">
      <div class="date-presets" style="margin-bottom:var(--space-2);">
        <span style="font-size:12px;font-weight:700;color:var(--text-tertiary);margin-right:var(--space-2);text-transform:uppercase;">Period:</span>
        <button class="preset-btn ${filters.preset === 'today' ? 'is-active' : ''}" data-preset="today">Today</button>
        <button class="preset-btn ${filters.preset === 'yesterday' ? 'is-active' : ''}" data-preset="yesterday">Yesterday</button>
        <button class="preset-btn ${filters.preset === '7d' ? 'is-active' : ''}" data-preset="7d">Last 7 Days</button>
        <button class="preset-btn ${filters.preset === 'this_month' ? 'is-active' : ''}" data-preset="this_month">This Month</button>
        <button class="preset-btn ${filters.preset === 'all' ? 'is-active' : ''}" data-preset="all">All Time</button>
        <button class="preset-btn ${filters.preset === 'custom' ? 'is-active' : ''}" data-preset="custom">Custom Range</button>
      </div>

      <div class="filter-bar" style="border-top: 1px solid var(--border); padding-top: var(--space-3); margin-top: var(--space-1);">
        ${filters.preset === 'custom' ? `
          <div class="input-wrap" style="max-width:150px;">
            <input type="date" id="start-date-input" value="${filters.startDate || ''}" title="From date">
          </div>
          <div class="input-wrap" style="max-width:150px;">
            <input type="date" id="end-date-input" value="${filters.endDate || ''}" title="To date">
          </div>
        ` : ''}

        <div class="select-wrap" style="min-width:180px;">
          <select id="cat-filter">
            <option value="all">All Categories</option>
            ${EXPENSE_CATEGORIES.map(c => `<option value="${escapeHtml(c)}" ${filters.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          </select>
          ${icon('chevronDown')}
        </div>

        <div class="select-wrap" style="min-width:160px;">
          <select id="pay-filter">
            <option value="all">All Payment Modes</option>
            ${EXPENSE_PAYMENT_METHODS.map(m => `<option value="${escapeHtml(m)}" ${filters.paymentMethod === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
          </select>
          ${icon('chevronDown')}
        </div>

        <div class="search-input" style="flex:1;min-width:200px;">
          ${icon('search')}
          <input type="search" id="expense-search" placeholder="Search notes, vendor, voucher…" value="${escapeHtml(filters.search)}">
        </div>

        <div style="font-weight:700;font-size:13px;color:var(--text-secondary);white-space:nowrap;align-self:center;">
          Total: <span style="color:var(--danger);font-size:15px;">${formatMoney(currentViewTotal)}</span> (${filtered.length} entries)
        </div>
      </div>
    </div>

    <!-- Expenses Listing -->
    <div id="expenses-content">
      ${filtered.length === 0 ? `
        <div class="card">
          <div class="empty-state">
            ${icon('wallet', 'empty-state__icon')}
            <h4>No expenses found</h4>
            <p>No expense transactions match your filters. Click "+ Add Expense" to record one.</p>
          </div>
        </div>
      ` : `
        ${sortedDayKeys.map(dateKey => {
          const items = dayGroups.get(dateKey) || [];
          const daySum = items.reduce((s, x) => s + (x.amount || 0), 0);
          const isToday = dateKey === todayInputValue();
          let dayLabel = dateKey;
          if (isToday) {
            dayLabel = `Today · ${formatDate(new Date(dateKey + 'T12:00:00'))}`;
          } else {
            const yesterdayDateKey = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            if (dateKey === yesterdayDateKey) {
              dayLabel = `Yesterday · ${formatDate(new Date(dateKey + 'T12:00:00'))}`;
            } else {
              dayLabel = formatDate(new Date(dateKey + 'T12:00:00'));
            }
          }

          return `
            <div class="card mb-4" style="overflow:hidden;">
              <div class="card__header" style="background:var(--bg);padding:10px 16px;border-bottom:1px solid var(--border);">
                <div style="display:flex;align-items:center;gap:var(--space-2);">
                  <strong style="font-size:14px;color:var(--text-primary);">${dayLabel}</strong>
                  ${isToday ? '<span class="badge badge--success" style="font-size:11px;">Active Day</span>' : ''}
                </div>
                <div style="font-weight:700;font-size:13.5px;">
                  Day Cash Out: <span style="color:var(--danger);">${formatMoney(daySum)}</span>
                  <span style="color:var(--text-tertiary);font-weight:400;font-size:12px;margin-left:6px;">(${items.length} item${items.length === 1 ? '' : 's'})</span>
                </div>
              </div>

              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th style="width:110px;">Time</th>
                      <th style="width:150px;">Showroom</th>
                      <th style="width:180px;">Category</th>
                      <th>Description / Paid To</th>
                      <th style="width:120px;">Mode</th>
                      <th style="width:110px;">Voucher #</th>
                      <th style="width:130px;text-align:right;">Amount</th>
                      <th style="width:90px;text-align:right;">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items.map(e => {
                      const d = parseItemDate(e.date);
                      const timeStr = !isNaN(d) ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
                      return `
                        <tr data-expense-id="${e.id}">
                          <td class="cell-mono text-muted" style="font-size:12px;">${timeStr}</td>
                          <td>
                            <span class="badge badge--muted" style="font-size:11.5px;">${escapeHtml(locationName(e.locationId))}</span>
                          </td>
                          <td>
                            <span class="badge ${categoryColorClass(e.category)}" style="font-size:11.5px;">
                              ${escapeHtml(e.category || 'Misc')}
                            </span>
                          </td>
                          <td>
                            <div style="font-weight:600;color:var(--text-primary);">${escapeHtml(e.description || '—')}</div>
                            ${e.paidTo ? `<div class="text-tiny text-muted">Paid to: ${escapeHtml(e.paidTo)}</div>` : ''}
                          </td>
                          <td>
                            <span class="badge badge--info" style="font-size:11px;">${escapeHtml(e.paymentMethod || 'Cash')}</span>
                          </td>
                          <td class="cell-mono text-tiny text-muted">${escapeHtml(e.receiptNo || '—')}</td>
                          <td style="text-align:right;font-weight:700;color:var(--danger);font-size:14.5px;">
                            - ${formatMoney(e.amount)}
                          </td>
                          <td style="text-align:right;">
                            <div class="row-actions" style="justify-content:flex-end;">
                              <button class="icon-btn edit-expense-btn" data-id="${e.id}" title="Edit Expense" aria-label="Edit">
                                ${icon('edit')}
                              </button>
                              <button class="icon-btn delete-expense-btn" data-id="${e.id}" title="Delete Expense" aria-label="Delete" style="color:var(--danger);">
                                ${icon('trash')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `;
        }).join('')}
      `}
    </div>
  `;

  bindEvents(root, state);
}

function bindEvents(root, state) {
  // Preset buttons
  $$('.preset-btn', root).forEach(btn => {
    btn.addEventListener('click', () => {
      filters.preset = btn.dataset.preset;
      render(root);
    });
  });

  // Custom date inputs
  const startInp = $('#start-date-input', root);
  const endInp = $('#end-date-input', root);
  if (startInp) {
    startInp.addEventListener('change', (e) => {
      filters.startDate = e.target.value;
      render(root);
    });
  }
  if (endInp) {
    endInp.addEventListener('change', (e) => {
      filters.endDate = e.target.value;
      render(root);
    });
  }

  // Category filter
  $('#cat-filter', root)?.addEventListener('change', (e) => {
    filters.category = e.target.value;
    render(root);
  });

  // Payment method filter
  $('#pay-filter', root)?.addEventListener('change', (e) => {
    filters.paymentMethod = e.target.value;
    render(root);
  });

  // Search input
  $('#expense-search', root)?.addEventListener('input', (e) => {
    filters.search = e.target.value;
    render(root);
  });

  // Add Expense button
  $('#add-expense-btn', root)?.addEventListener('click', () => {
    openExpenseModal(state);
  });

  // Export CSV button
  $('#export-csv-btn', root)?.addEventListener('click', () => {
    exportExpensesCsv(state);
  });

  // Edit Expense buttons
  $$('.edit-expense-btn', root).forEach(btn => {
    btn.addEventListener('click', () => {
      const exp = (state.expenses || []).find(x => x.id === btn.dataset.id);
      if (exp) openExpenseModal(state, exp);
    });
  });

  // Delete Expense buttons
  $$('.delete-expense-btn', root).forEach(btn => {
    btn.addEventListener('click', async () => {
      const exp = (state.expenses || []).find(x => x.id === btn.dataset.id);
      if (!exp) return;
      const ok = await confirmDialog(`Delete expense of ${formatMoney(exp.amount)} for "${exp.category}"?`, {
        confirmLabel: 'Delete Expense',
        danger: true
      });
      if (!ok) return;

      try {
        await deleteExpense(exp.id);
        toast('Expense deleted', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

function openExpenseModal(state, existing = null) {
  const isEdit = Boolean(existing);
  const locations = state.locations || [];
  const defaultLocId = existing?.locationId || (state.locationFilter !== 'all' ? state.locationFilter : (locations[0]?.id || ''));

  let existingDateVal = todayInputValue();
  if (existing?.date) {
    const d = parseItemDate(existing.date);
    if (!isNaN(d)) existingDateVal = d.toISOString().slice(0, 10);
  }

  const modal = openModal({
    title: isEdit ? 'Edit Expense Record' : 'Record Showroom Expense',
    bodyHtml: `
      <form id="expense-form" class="form-grid">
        <div class="form-row">
          <div class="field">
            <label>Expense Date *</label>
            <input type="date" name="date" value="${existingDateVal}" required>
          </div>
          <div class="field">
            <label>Showroom / Location *</label>
            <div class="select-wrap">
              <select name="locationId" required>
                ${locations.map(l => `<option value="${l.id}" ${l.id === defaultLocId ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
              </select>
              ${icon('chevronDown')}
            </div>
          </div>
        </div>

        <div class="form-row">
          <div class="field">
            <label>Expense Category *</label>
            <div class="select-wrap">
              <select name="category" required>
                ${EXPENSE_CATEGORIES.map(c => `<option value="${escapeHtml(c)}" ${existing?.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
              </select>
              ${icon('chevronDown')}
            </div>
          </div>
          <div class="field">
            <label>Payment Mode *</label>
            <div class="select-wrap">
              <select name="paymentMethod" required>
                ${EXPENSE_PAYMENT_METHODS.map(m => `<option value="${escapeHtml(m)}" ${(existing?.paymentMethod || 'Cash') === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
              </select>
              ${icon('chevronDown')}
            </div>
          </div>
        </div>

        <div class="field">
          <label>Amount (₹) *</label>
          <input type="number" id="expense-amount-inp" name="amount" min="1" step="any" placeholder="e.g. 250" value="${existing?.amount || ''}" required>
          <div class="petty-cash-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
            <span style="font-size:11px;color:var(--text-tertiary);align-self:center;">Quick add:</span>
            <button type="button" class="preset-btn chip-btn" data-add="50">+₹50</button>
            <button type="button" class="preset-btn chip-btn" data-add="100">+₹100</button>
            <button type="button" class="preset-btn chip-btn" data-add="200">+₹200</button>
            <button type="button" class="preset-btn chip-btn" data-add="500">+₹500</button>
            <button type="button" class="preset-btn chip-btn" data-add="1000">+₹1,000</button>
            <button type="button" class="preset-btn chip-btn" data-add="2000">+₹2,000</button>
          </div>
        </div>

        <div class="form-row">
          <div class="field">
            <label>Paid To / Vendor / Person (Optional)</label>
            <input type="text" name="paidTo" placeholder="e.g. Raju Tea Stall, Electrician Suresh" value="${escapeHtml(existing?.paidTo || '')}">
          </div>
          <div class="field">
            <label>Bill / Voucher No. (Optional)</label>
            <input type="text" name="receiptNo" placeholder="e.g. VCH-0042, Bill #981" value="${escapeHtml(existing?.receiptNo || '')}">
          </div>
        </div>

        <div class="field">
          <label>Description / Reason for Expense</label>
          <textarea name="description" rows="2" placeholder="e.g. Tea and refreshments for customers and mechanics" style="resize:vertical;">${escapeHtml(existing?.description || '')}</textarea>
        </div>

        <div class="modal__footer" style="padding:var(--space-4) 0 0;margin-top:var(--space-2);border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:var(--space-2);">
          <button type="button" class="btn btn--outline" data-close-modal>Cancel</button>
          <button type="submit" class="btn btn--primary" id="save-expense-btn">
            ${icon('check')}<span>${isEdit ? 'Update Expense' : 'Save Expense'}</span>
          </button>
        </div>
      </form>
    `
  });

  const form = $('#expense-form', modal);
  const amountInp = $('#expense-amount-inp', modal);
  const submitBtn = $('#save-expense-btn', modal);

  // Quick petty cash chips
  $$('.chip-btn', modal).forEach(btn => {
    btn.addEventListener('click', () => {
      const addVal = Number(btn.dataset.add) || 0;
      const cur = Number(amountInp.value) || 0;
      amountInp.value = cur + addVal;
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const amount = Number(fd.get('amount'));
    if (!amount || amount <= 0) {
      toast('Please enter a valid expense amount.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `${icon('refresh')}<span>Saving…</span>`;

    const payload = {
      date: fd.get('date'),
      locationId: fd.get('locationId'),
      category: fd.get('category'),
      amount,
      paymentMethod: fd.get('paymentMethod'),
      paidTo: fd.get('paidTo'),
      receiptNo: fd.get('receiptNo'),
      description: fd.get('description')
    };

    try {
      if (isEdit) {
        await updateExpense(existing.id, payload);
        toast('Expense record updated successfully', 'success');
      } else {
        await addExpense(payload);
        toast(`₹${amount} expense recorded for ${payload.category}`, 'success');
      }
      closeModal();
    } catch (err) {
      toast(err.message || 'Failed to save expense', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = `${icon('check')}<span>${isEdit ? 'Update Expense' : 'Save Expense'}</span>`;
    }
  });
}

function exportExpensesCsv(state) {
  const lf = state.locationFilter;
  const list = (state.expenses || []).filter(e => inLocation(e, lf));

  if (!list.length) {
    toast('No expenses to export', 'error');
    return;
  }

  const rows = [
    ['Date', 'Time', 'Showroom', 'Category', 'Description', 'Paid To', 'Payment Method', 'Voucher No', 'Amount (INR)']
  ];

  list.forEach(e => {
    const d = parseItemDate(e.date);
    const dateStr = !isNaN(d) ? d.toISOString().slice(0, 10) : '';
    const timeStr = !isNaN(d) ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
    rows.push([
      dateStr,
      timeStr,
      locationName(e.locationId),
      e.category || '',
      e.description || '',
      e.paidTo || '',
      e.paymentMethod || 'Cash',
      e.receiptNo || '',
      e.amount || 0
    ]);
  });

  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r =>
    r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `ulike_expenses_${todayInputValue()}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  toast('Expenses CSV downloaded', 'success');
}
