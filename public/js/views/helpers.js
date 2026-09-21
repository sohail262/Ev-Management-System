import { STATUS, LOW_STOCK_THRESHOLDS } from '../constants.js';
import { locationName, providerName } from '../state.js';
import { groupBy } from '../utils.js';

export function inLocation(item, locationFilter) {
  return locationFilter === 'all' || item.locationId === locationFilter;
}

export function statusBadgeHtml(status) {
  const map = {
    [STATUS.IN_STOCK]: { cls: 'success', label: 'In stock' },
    [STATUS.SOLD]: { cls: 'muted', label: 'Sold' },
    [STATUS.TRANSFERRED]: { cls: 'info', label: 'Transferred' }
  };
  const m = map[status] || { cls: 'muted', label: status || '—' };
  return `<span class="badge badge--${m.cls}"><span class="badge-dot"></span>${m.label}</span>`;
}

export function paymentBadgeHtml(method) {
  return `<span class="badge badge--info">${method || '—'}</span>`;
}

export function lowStockAlerts(state, locationFilter) {
  const alerts = [];

  ['battery', 'charger'].forEach((type) => {
    const units = (type === 'battery' ? state.batteryUnits : state.chargerUnits)
      .filter(u => u.status === STATUS.IN_STOCK && inLocation(u, locationFilter));
    const groups = groupBy(units, u => `${u.locationId}|${u.wattage}`);
    for (const [key, items] of groups.entries()) {
      const [locationId, wattage] = key.split('|');
      if (items.length < LOW_STOCK_THRESHOLDS[type]) {
        alerts.push({
          itemType: type,
          title: `${wattage}W ${type === 'battery' ? 'Batteries' : 'Chargers'} low`,
          sub: locationName(locationId),
          count: items.length
        });
      }
    }
  });

  const evs = state.evUnits.filter(e => e.status === STATUS.IN_STOCK && inLocation(e, locationFilter));
  const evGroups = groupBy(evs, e => `${e.locationId}|${e.providerId}`);
  for (const [key, items] of evGroups.entries()) {
    const [locationId, providerId] = key.split('|');
    if (items.length < LOW_STOCK_THRESHOLDS.ev) {
      alerts.push({
        itemType: 'ev',
        title: `${providerName(providerId)} stock low`,
        sub: locationName(locationId),
        count: items.length
      });
    }
  }

  state.spareParts.forEach(p => {
    if ((p.quantity || 0) <= (p.reorderLevel || 0)) {
      alerts.push({
        itemType: 'sparepart',
        title: `${p.name} low`,
        sub: 'Spare parts · centralized',
        count: p.quantity || 0
      });
    }
  });

  return alerts.sort((a, b) => a.count - b.count);
}

export function sameDay(a, b) {
  const da = a?.toDate ? a.toDate() : new Date(a);
  return da.toDateString() === b.toDateString();
}

export function withinRange(dateVal, from, to) {
  if (!dateVal) return false;
  const d = dateVal?.toDate ? dateVal.toDate() : new Date(dateVal);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}
