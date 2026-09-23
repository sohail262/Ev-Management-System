import { icon } from './icons.js';
import { $, toast } from './utils.js';
import { initState, getState, subscribe, setLocationFilter, isReady } from './state.js';

const V = '?v=2.6';
const ROUTES = [
  { id: 'dashboard', label: 'Dashboard', tag: 'Overview', icon: 'dashboard', mod: () => import(`./views/dashboard.js${V}`) },
  { id: 'evs', label: 'EV Inventory', tag: 'Vehicles', icon: 'ev', mod: () => import(`./views/evInventory.js${V}`) },
  { id: 'units', label: 'Batteries & Chargers', tag: 'Stock', icon: 'battery', mod: () => import(`./views/batteryCharger.js${V}`) },
  { id: 'spareparts', label: 'Spare Parts', tag: 'Stock', icon: 'package', mod: () => import(`./views/spareParts.js${V}`) },
  { id: 'sales', label: 'Sales', tag: 'Billing', icon: 'sales', mod: () => import(`./views/sales.js${V}`) },
  { id: 'expenses', label: 'Expenses', tag: 'Daily Accounts', icon: 'wallet', mod: () => import(`./views/expenses.js${V}`) },
  { id: 'transfers', label: 'Transfers', tag: 'Movement', icon: 'transfer', mod: () => import(`./views/transfers.js${V}`) },
  { id: 'reports', label: 'Reports', tag: 'Insights', icon: 'reports', mod: () => import(`./views/reports.js${V}`) },
  { id: 'locations', label: 'Locations & Brands', tag: 'Setup', icon: 'store', mod: () => import(`./views/locations.js${V}`) }
];

const sidebarNav = $('#sidebar-nav');
const viewRoot = $('#view-root');
const topbarTitle = $('#topbar-title');
const locationFilterSel = $('#location-filter');
const sidebar = $('#sidebar');
const overlay = $('#sidebar-overlay');
const menuBtn = $('#menu-btn');

let currentUnmount = null;
let currentRouteId = null;

function renderNav() {
  sidebarNav.innerHTML = ROUTES.map(r => `
    <button class="nav-item" data-route="${r.id}">
      ${icon(r.icon)}<span>${r.label}</span>
    </button>`).join('');
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.hash = btn.dataset.route;
      closeDrawer();
    });
  });
}
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

function setActiveNav(routeId) {
  $$('.nav-item').forEach(btn => btn.classList.toggle('is-active', btn.dataset.route === routeId));
}

function renderLocationOptions() {
  const state = getState();
  const current = locationFilterSel.value || state.locationFilter;
  locationFilterSel.innerHTML = `<option value="all">All locations</option>` +
    state.locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  locationFilterSel.value = current;
  if (locationFilterSel.value !== current) locationFilterSel.value = 'all';
}

locationFilterSel.addEventListener('change', () => setLocationFilter(locationFilterSel.value));

function openDrawer() { sidebar.classList.add('is-open'); overlay.classList.add('is-visible'); }
function closeDrawer() { sidebar.classList.remove('is-open'); overlay.classList.remove('is-visible'); }
menuBtn.addEventListener('click', openDrawer);
overlay.addEventListener('click', closeDrawer);

async function navigate() {
  const routeId = (window.location.hash || '#dashboard').slice(1);
  const route = ROUTES.find(r => r.id === routeId) || ROUTES[0];
  if (route.id !== routeId) window.location.hash = route.id;
  currentRouteId = route.id;
  setActiveNav(route.id);
  topbarTitle.innerHTML = `${route.label}<span>${route.tag}</span>`;

  if (typeof currentUnmount === 'function') {
    try { currentUnmount(); } catch (e) { /* noop */ }
    currentUnmount = null;
  }
  viewRoot.innerHTML = `<div class="loading-state"><span class="spinner"></span><span>Loading…</span></div>`;
  try {
    const mod = await route.mod();
    if (currentRouteId !== route.id) return; // route changed while loading
    currentUnmount = mod.mount(viewRoot) || null;
  } catch (err) {
    console.error(err);
    viewRoot.innerHTML = `<div class="form-error">${icon('alert')}<span>Could not load this section. ${err.message || ''}</span></div>`;
  }
}

window.addEventListener('hashchange', navigate);

async function boot() {
  renderNav();
  try {
    await initState();
  } catch (err) {
    console.error('Firebase init failed', err);
    document.getElementById('splash').innerHTML = `
      <div class="form-error" style="max-width:420px;">${icon('alert')}<span>Could not connect to Firebase. Check your internet connection and the config in js/firebase-init.js, then reload.</span></div>`;
    return;
  }

  const unsub = subscribe(() => {
    renderLocationOptions();
    if (isReady()) {
      unsub();
      document.getElementById('splash').style.display = 'none';
      document.getElementById('app-shell').style.display = 'flex';
      navigate();
    }
  });

  // Safety net: if snapshots are slow, still reveal the shell after 4s.
  setTimeout(() => {
    if (document.getElementById('splash').style.display !== 'none') {
      document.getElementById('splash').style.display = 'none';
      document.getElementById('app-shell').style.display = 'flex';
      navigate();
    }
  }, 4000);
}

boot();

window.addEventListener('error', (e) => {
  if (e && e.message) toast(e.message, 'error');
});
