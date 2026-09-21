import { getState, subscribe } from '../state.js';
import { icon } from '../icons.js';
import { escapeHtml, openModal, closeModal, confirmDialog, toast, $ } from '../utils.js';
import {
  addLocation, updateLocation, deleteLocation, addProvider, updateProvider, deleteProvider
} from '../data/core.js';

let activeTab = 'locations';

export function mount(root) {
  render(root);
  const unsub = subscribe(() => render(root));
  root.addEventListener('click', onClick);
  return () => { unsub(); root.removeEventListener('click', onClick); };
}

function onClick(e) {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { activeTab = tabBtn.dataset.tab; render(document.getElementById('view-root')); return; }
}

function render(root) {
  const state = getState();
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Locations &amp; Brands</h2>
        <p>Manage your 5 shops and the EV brands each one carries</p>
      </div>
      <div class="view-header__actions">
        <button class="btn btn--primary" id="add-btn">${icon('plus')}<span>${activeTab === 'locations' ? 'Add location' : 'Add brand'}</span></button>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn ${activeTab === 'locations' ? 'is-active' : ''}" data-tab="locations">Shops (${state.locations.length})</button>
      <button class="tab-btn ${activeTab === 'brands' ? 'is-active' : ''}" data-tab="brands">Brands (${state.providers.length})</button>
    </div>

    <div id="tab-content"></div>
  `;

  $('#add-btn').addEventListener('click', () => activeTab === 'locations' ? openLocationForm(state) : openProviderForm());
  renderTabContent(state);
}

function renderTabContent(state) {
  const content = $('#tab-content');
  if (activeTab === 'locations') {
    if (!state.locations.length) {
      content.innerHTML = emptyState('store', 'No shops yet', 'Add your first shop location to start tracking stock.');
      return;
    }
    content.innerHTML = `
      <div class="table-wrap table-wrap--responsive">
        <table>
          <thead><tr><th>Shop</th><th>Address</th><th>Brands carried</th><th></th></tr></thead>
          <tbody>
            ${state.locations.map(l => `
              <tr>
                <td data-label="Shop" class="cell-strong">${escapeHtml(l.name)}</td>
                <td data-label="Address">${escapeHtml(l.address || '—')}</td>
                <td data-label="Brands">${(l.brandIds || []).map(id => `<span class="badge badge--info">${escapeHtml(brandName(state, id))}</span>`).join(' ') || '<span class="text-tiny">None assigned</span>'}</td>
                <td class="cell-actions">
                  <button class="icon-btn" data-edit-loc="${l.id}">${icon('edit')}</button>
                  <button class="icon-btn icon-btn--danger" data-del-loc="${l.id}">${icon('trash')}</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    state.locations.forEach(l => {
      $(`[data-edit-loc="${l.id}"]`, content)?.addEventListener('click', () => openLocationForm(state, l));
      $(`[data-del-loc="${l.id}"]`, content)?.addEventListener('click', async () => {
        if (await confirmDialog(`Delete "${l.name}"? This does not delete stock already assigned to it.`)) {
          try { await deleteLocation(l.id); toast('Location deleted', 'success'); }
          catch (err) { toast(err.message, 'error'); }
        }
      });
    });
  } else {
    if (!state.providers.length) {
      content.innerHTML = emptyState('ev', 'No brands yet', 'Add the EV brands / providers you stock.');
      return;
    }
    content.innerHTML = `
      <div class="table-wrap table-wrap--responsive">
        <table>
          <thead><tr><th>Brand</th><th></th></tr></thead>
          <tbody>
            ${state.providers.map(p => `
              <tr>
                <td data-label="Brand" class="cell-strong">${escapeHtml(p.name)}</td>
                <td class="cell-actions">
                  <button class="icon-btn" data-edit-prov="${p.id}">${icon('edit')}</button>
                  <button class="icon-btn icon-btn--danger" data-del-prov="${p.id}">${icon('trash')}</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    state.providers.forEach(p => {
      $(`[data-edit-prov="${p.id}"]`, content)?.addEventListener('click', () => openProviderForm(p));
      $(`[data-del-prov="${p.id}"]`, content)?.addEventListener('click', async () => {
        if (await confirmDialog(`Delete brand "${p.name}"?`)) {
          try { await deleteProvider(p.id); toast('Brand deleted', 'success'); }
          catch (err) { toast(err.message, 'error'); }
        }
      });
    });
  }
}

function brandName(state, id) {
  return state.providers.find(p => p.id === id)?.name || id;
}

function emptyState(iconName, title, message) {
  return `<div class="card"><div class="empty-state">${icon(iconName, 'empty-state__icon')}<h4>${title}</h4><p>${message}</p></div></div>`;
}

function openLocationForm(state, loc = null) {
  const isEdit = !!loc;
  const modal = openModal({
    title: isEdit ? 'Edit shop' : 'Add shop',
    bodyHtml: `
      <form id="loc-form">
        <div class="form-grid">
          <div class="field field--full">
            <label>Shop name</label>
            <input name="name" required value="${escapeHtml(loc?.name || '')}" placeholder="e.g. Jadcherla">
          </div>
          <div class="field field--full">
            <label>Address</label>
            <input name="address" value="${escapeHtml(loc?.address || '')}" placeholder="e.g. Jadcherla, Mahabubnagar Dist.">
          </div>
          <div class="field field--full">
            <label>Brands carried at this shop</label>
            <div style="display:flex;flex-wrap:wrap;gap:10px;">
              ${state.providers.map(p => `
                <label class="checkbox-row">
                  <input type="checkbox" name="brandIds" value="${p.id}" ${loc?.brandIds?.includes(p.id) ? 'checked' : ''}>
                  ${escapeHtml(p.name)}
                </label>`).join('') || '<span class="text-tiny">Add a brand first</span>'}
            </div>
          </div>
        </div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="loc-form" class="btn btn--primary">${isEdit ? 'Save changes' : 'Add shop'}</button>`
  });
  $('#loc-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      name: fd.get('name').trim(),
      address: fd.get('address').trim(),
      brandIds: fd.getAll('brandIds')
    };
    try {
      if (isEdit) await updateLocation(loc.id, data);
      else await addLocation(data);
      closeModal();
      toast(isEdit ? 'Shop updated' : 'Shop added', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
}

function openProviderForm(prov = null) {
  const isEdit = !!prov;
  const modal = openModal({
    title: isEdit ? 'Edit brand' : 'Add brand',
    size: 'sm',
    bodyHtml: `
      <form id="prov-form">
        <div class="field">
          <label>Brand / provider name</label>
          <input name="name" required value="${escapeHtml(prov?.name || '')}" placeholder="e.g. Zelio">
        </div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="prov-form" class="btn btn--primary">${isEdit ? 'Save changes' : 'Add brand'}</button>`
  });
  $('#prov-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name').trim();
    try {
      if (isEdit) await updateProvider(prov.id, { name });
      else await addProvider({ name });
      closeModal();
      toast(isEdit ? 'Brand updated' : 'Brand added', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
}
