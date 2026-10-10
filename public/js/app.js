import { icon } from './icons.js';
import { $, openModal, closeModal, toast } from './utils.js';
import { initState, getState, subscribe, setLocationFilter, isReady } from './state.js';
import {
  auth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider
} from './firebase-init.js';

const V = '?v=2.8';
const ROUTES = [
  { id: 'dashboard', label: 'Dashboard', tag: 'Overview', icon: 'dashboard', mod: () => import(`./views/dashboard.js${V}`) },
  { id: 'evs', label: 'EV Inventory', tag: 'Vehicles', icon: 'ev', mod: () => import(`./views/evInventory.js${V}`) },
  { id: 'units', label: 'Batteries & Chargers', tag: 'Stock', icon: 'battery', mod: () => import(`./views/batteryCharger.js${V}`) },
  { id: 'spareparts', label: 'Spare Parts', tag: 'Stock', icon: 'package', mod: () => import(`./views/spareParts.js${V}`) },
  { id: 'sales', label: 'Sales', tag: 'Billing', icon: 'sales', mod: () => import(`./views/sales.js${V}`) },
  { id: 'expenses', label: 'Expenses', tag: 'Daily Accounts', icon: 'wallet', mod: () => import(`./views/expenses.js${V}`) },
  { id: 'transfers', label: 'Transfers', tag: 'Movement', icon: 'transfer', mod: () => import(`./views/transfers.js${V}`) },
  { id: 'reports', label: 'Reports', tag: 'Insights', icon: 'reports', mod: () => import(`./views/reports.js${V}`) },
  { id: 'locations', label: 'Settings & Models', tag: 'Setup', icon: 'store', mod: () => import(`./views/locations.js${V}`) }
];

const sidebarNav = $('#sidebar-nav');
const viewRoot = $('#view-root');
const topbarTitle = $('#topbar-title');
const locationFilterSel = $('#location-filter');
const sidebar = $('#sidebar');
const overlay = $('#sidebar-overlay');
const menuBtn = $('#menu-btn');
const splash = $('#splash');
const loginView = $('#login-view');
const appShell = $('#app-shell');
const userEmailDisplay = $('#user-email-display');

let currentUnmount = null;
let currentRouteId = null;
let currentUser = null;
let isAppInitialized = false;

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

window.addEventListener('hashchange', () => {
  if (currentUser) navigate();
});

// ---------------- Authentication & App Lifecycle ----------------

function setupAuthUi() {
  // Password visibility toggle on login form
  const toggleBtn = document.getElementById('toggle-login-pwd');
  const pwdInput = document.getElementById('login-password');
  if (toggleBtn && pwdInput) {
    toggleBtn.addEventListener('click', () => {
      const isPwd = pwdInput.type === 'password';
      pwdInput.type = isPwd ? 'text' : 'password';
      toggleBtn.innerHTML = isPwd
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="width:16px; height:16px;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="width:16px; height:16px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    });
  }

  // Login form submission
  const loginForm = document.getElementById('login-form');
  const loginErr = document.getElementById('login-error');
  const loginSubmit = document.getElementById('login-submit-btn');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    loginErr.style.display = 'none';
    loginSubmit.disabled = true;
    loginSubmit.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span><span>Signing in…</span>';

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle transition
    } catch (err) {
      console.error('Sign in failed:', err);
      let msg = 'Failed to sign in. Please check your credentials.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        msg = 'Invalid email or password.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Too many failed login attempts. Please try again in a few minutes.';
      } else if (err.code === 'auth/user-disabled') {
        msg = 'This user account has been disabled.';
      } else if (err.code === 'auth/network-request-failed') {
        msg = 'Network error. Please check your internet connection.';
      } else if (err.code === 'auth/operation-not-allowed') {
        msg = 'Email/Password provider is not enabled in Firebase Authentication console.';
      }
      loginErr.textContent = msg;
      loginErr.style.display = 'flex';
      loginSubmit.disabled = false;
      loginSubmit.innerHTML = '<span>Sign In</span>';
    }
  });

  // Change password triggers
  const openPwdModal = () => {
    if (currentUser) openChangePasswordModal(currentUser);
  };
  document.getElementById('change-pwd-btn')?.addEventListener('click', openPwdModal);
  document.getElementById('topbar-pwd-btn')?.addEventListener('click', openPwdModal);

  // Logout triggers
  const handleLogout = async () => {
    if (confirm('Are you sure you want to sign out?')) {
      try {
        await signOut(auth);
        toast('Signed out successfully', 'info');
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  };
  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
  document.getElementById('topbar-logout-btn')?.addEventListener('click', handleLogout);
}

function openChangePasswordModal(user) {
  const modal = openModal({
    title: 'Change Password',
    size: 'sm',
    bodyHtml: `
      <form id="change-pwd-form">
        <div class="form-grid">
          <div class="field field--full">
            <label>Current Password</label>
            <input type="password" name="currentPassword" required placeholder="Enter current password" autocomplete="current-password">
          </div>
          <div class="field field--full">
            <label>New Password</label>
            <input type="password" name="newPassword" required minlength="6" placeholder="At least 6 characters" autocomplete="new-password">
          </div>
          <div class="field field--full">
            <label>Confirm New Password</label>
            <input type="password" name="confirmPassword" required minlength="6" placeholder="Re-enter new password" autocomplete="new-password">
          </div>
        </div>
        <div id="pwd-change-error" class="form-error" style="display:none; margin-top:12px;"></div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="change-pwd-form" class="btn btn--primary">Update Password</button>`
  });

  $('#change-pwd-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const curr = fd.get('currentPassword');
    const next = fd.get('newPassword');
    const confirm = fd.get('confirmPassword');
    const errEl = $('#pwd-change-error', modal);
    errEl.style.display = 'none';

    if (next !== confirm) {
      errEl.textContent = 'New passwords do not match.';
      errEl.style.display = 'flex';
      return;
    }
    if (next.length < 6) {
      errEl.textContent = 'New password must be at least 6 characters.';
      errEl.style.display = 'flex';
      return;
    }

    const submitBtn = $('[form="change-pwd-form"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating…';

    try {
      if (user.email) {
        const cred = EmailAuthProvider.credential(user.email, curr);
        await reauthenticateWithCredential(user, cred);
      }
      await updatePassword(user, next);
      closeModal();
      toast('Password changed successfully!', 'success');
    } catch (err) {
      let msg = err.message || 'Failed to update password.';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Incorrect current password.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'New password should be at least 6 characters.';
      } else if (err.code === 'auth/requires-recent-login') {
        msg = 'Please log out and log in again before changing password.';
      }
      errEl.textContent = msg;
      errEl.style.display = 'flex';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Update Password';
    }
  });
}

async function startAppForUser(user) {
  currentUser = user;
  loginView.style.display = 'none';
  if (userEmailDisplay) userEmailDisplay.textContent = user.email || 'Admin';

  if (!isAppInitialized) {
    splash.style.display = 'flex';
    renderNav();
    try {
      await initState();
    } catch (err) {
      console.error('Firebase init failed', err);
      splash.innerHTML = `
        <div class="form-error" style="max-width:420px;">${icon('alert')}<span>Could not connect to Firebase. Check your internet connection and reload.</span></div>`;
      return;
    }

    const unsub = subscribe(() => {
      renderLocationOptions();
      if (isReady()) {
        unsub();
        splash.style.display = 'none';
        appShell.style.display = 'flex';
        navigate();
        isAppInitialized = true;
      }
    });

    // Safety net: reveal shell after 4s
    setTimeout(() => {
      if (splash.style.display !== 'none') {
        splash.style.display = 'none';
        appShell.style.display = 'flex';
        navigate();
        isAppInitialized = true;
      }
    }, 4000);
  } else {
    splash.style.display = 'none';
    appShell.style.display = 'flex';
    navigate();
  }
}

function showLoggedOutView() {
  currentUser = null;
  appShell.style.display = 'none';
  splash.style.display = 'none';
  loginView.style.display = 'flex';
  const pwd = document.getElementById('login-password');
  if (pwd) pwd.value = '';
}

// ---------------- Boot Entrypoint ----------------
function boot() {
  setupAuthUi();

  onAuthStateChanged(auth, (user) => {
    if (user) {
      startAppForUser(user);
    } else {
      showLoggedOutView();
    }
  });
}

boot();

window.addEventListener('error', (e) => {
  if (e && e.message) toast(e.message, 'error');
});
