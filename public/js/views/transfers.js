import { getState, subscribe, locationName } from '../state.js';
import { icon } from '../icons.js';
import { escapeHtml, formatDateTime, debounce, $ } from '../utils.js';

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
        <span class="badge badge--muted">${icon('info')}<span>Start a transfer from EV or Battery/Charger inventory</span></span>
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

  const host = $('#transfer-table');
  if (!items.length) {
    host.innerHTML = `<div class="card"><div class="empty-state">${icon('transfer', 'empty-state__icon')}<h4>No transfers yet</h4><p>Transfers between shops will show up here.</p></div></div>`;
  } else {
    host.innerHTML = `
      <div class="table-wrap table-wrap--responsive">
        <table>
          <thead><tr><th>Date</th><th>Item</th><th>From</th><th>To</th><th>Note</th></tr></thead>
          <tbody>
            ${items.map(t => `
              <tr>
                <td data-label="Date">${formatDateTime(t.date)}</td>
                <td data-label="Item"><span class="badge badge--info">${itemLabel(t.itemType)}</span></td>
                <td data-label="From">${escapeHtml(locationName(t.fromLocationId))}</td>
                <td data-label="To">${escapeHtml(locationName(t.toLocationId))}</td>
                <td data-label="Note">${escapeHtml(t.note || '—')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  $('#filter-type').addEventListener('change', (e) => { filters.itemType = e.target.value; render(root); });
  $('#filter-loc').addEventListener('change', (e) => { filters.locationId = e.target.value; render(root); });
}

function itemLabel(type) {
  return { ev: 'EV', battery: 'Battery', charger: 'Charger' }[type] || type;
}
