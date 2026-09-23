import { listenLocations, listenProviders, ensureSeedData } from './data/core.js';
import { listenEvUnits, listenUnits, listenSpareParts } from './data/inventory.js';
import { listenSales } from './data/sales.js';
import { listenTransfers } from './data/transfers.js';
import { listenStockLog } from './data/log.js';
import { listenExpenses } from './data/expenses.js';

const state = {
  locations: [], providers: [], evUnits: [], batteryUnits: [], chargerUnits: [],
  spareParts: [], sales: [], transfers: [], expenses: [], stockLog: [],
  locationFilter: localStorage.getItem('ulike_location_filter') || 'all',
  ready: {
    locations: false, providers: false, ev: false, battery: false,
    charger: false, spareParts: false, sales: false, transfers: false, expenses: false
  }
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { listeners.forEach(fn => fn(state)); }

export function getState() { return state; }
window.__debugState = state; // temporary, for diagnostics

export function setLocationFilter(id) {
  state.locationFilter = id;
  localStorage.setItem('ulike_location_filter', id);
  notify();
}

export function initState() {
  return ensureSeedData().then(() => {
    listenLocations(v => { state.locations = v.sort((a, b) => a.name.localeCompare(b.name)); state.ready.locations = true; notify(); });
    listenProviders(v => { state.providers = v.sort((a, b) => a.name.localeCompare(b.name)); state.ready.providers = true; notify(); });
    listenEvUnits(v => { state.evUnits = v; state.ready.ev = true; notify(); });
    listenUnits('battery', v => { state.batteryUnits = v; state.ready.battery = true; notify(); });
    listenUnits('charger', v => { state.chargerUnits = v; state.ready.charger = true; notify(); });
    listenSpareParts(v => { state.spareParts = v; state.ready.spareParts = true; notify(); });
    listenSales(v => { state.sales = v; state.ready.sales = true; notify(); });
    listenTransfers(v => { state.transfers = v; state.ready.transfers = true; notify(); });
    listenExpenses(v => { state.expenses = v; state.ready.expenses = true; notify(); });
    listenStockLog(v => { state.stockLog = v; notify(); });
  });
}

export function isReady() {
  return Object.values(state.ready).every(Boolean);
}

export function locationName(id) {
  const l = state.locations.find(x => x.id === id);
  return l ? l.name : '—';
}
export function providerName(id) {
  const p = state.providers.find(x => x.id === id);
  return p ? p.name : '—';
}
