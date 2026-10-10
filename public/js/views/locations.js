import { getState, subscribe, providerName } from '../state.js';
import { icon } from '../icons.js';
import { escapeHtml, openModal, closeModal, confirmDialog, toast, debounce, $ } from '../utils.js';
import {
  addLocation, updateLocation, deleteLocation,
  addProvider, updateProvider, deleteProvider,
  addModelToProvider, updateModelInProvider, deleteModelFromProvider
} from '../data/core.js';

let activeTab = 'locations';
let modelFilters = { brandId: 'all', search: '' };

export function mount(root) {
  render(root);
  const unsub = subscribe(() => render(root));
  root.addEventListener('click', onClick);
  return () => { unsub(); root.removeEventListener('click', onClick); };
}

function onClick(e) {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) {
    activeTab = tabBtn.dataset.tab;
    render(document.getElementById('view-root'));
  }
}

function render(root) {
  const state = getState();
  const totalModels = state.providers.reduce((sum, p) => sum + (p.models?.length || 0), 0);

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Locations &amp; Settings</h2>
        <p>Manage your 5 shops, EV brands, and vehicle models</p>
      </div>
      <div class="view-header__actions">
        <button class="btn btn--primary" id="add-btn">${icon('plus')}<span>${
          activeTab === 'locations' ? 'Add location' : (activeTab === 'brands' ? 'Add brand' : 'Add model')
        }</span></button>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn ${activeTab === 'locations' ? 'is-active' : ''}" data-tab="locations">Shops (${state.locations.length})</button>
      <button class="tab-btn ${activeTab === 'brands' ? 'is-active' : ''}" data-tab="brands">Brands (${state.providers.length})</button>
      <button class="tab-btn ${activeTab === 'models' ? 'is-active' : ''}" data-tab="models">EV Models (${totalModels})</button>
    </div>

    <div id="tab-content"></div>
  `;

  $('#add-btn').addEventListener('click', () => {
    if (activeTab === 'locations') openLocationForm(state);
    else if (activeTab === 'brands') openProviderForm();
    else openModelForm(state);
  });

  renderTabContent(state);
}

function renderTabContent(state) {
  const content = $('#tab-content');
  if (activeTab === 'locations') {
    renderLocationsTab(content, state);
  } else if (activeTab === 'brands') {
    renderBrandsTab(content, state);
  } else {
    renderModelsTab(content, state);
  }
}

// ---------------- 1. Locations / Shops Tab ----------------
function renderLocationsTab(content, state) {
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
                <button class="icon-btn" data-edit-loc="${l.id}" title="Edit shop">${icon('edit')}</button>
                <button class="icon-btn icon-btn--danger" data-del-loc="${l.id}" title="Delete shop">${icon('trash')}</button>
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
}

// ---------------- 2. Brands Tab ----------------
function renderBrandsTab(content, state) {
  if (!state.providers.length) {
    content.innerHTML = emptyState('ev', 'No brands yet', 'Add the EV brands / providers you stock.');
    return;
  }
  content.innerHTML = `
    <div class="table-wrap table-wrap--responsive">
      <table>
        <thead><tr><th>Brand</th><th>Models configured</th><th></th></tr></thead>
        <tbody>
          ${state.providers.map(p => {
            const models = p.models || [];
            return `
            <tr>
              <td data-label="Brand" class="cell-strong" style="min-width:140px;">${escapeHtml(p.name)}</td>
              <td data-label="Models">
                <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                  <span class="badge badge--info">${models.length} model${models.length === 1 ? '' : 's'}</span>
                  ${models.slice(0, 8).map(m => `<span class="badge badge--muted" style="letter-spacing:0.02em;">${escapeHtml(m)}</span>`).join('')}
                  ${models.length > 8 ? `<span class="cell-muted" style="font-size:12px;">+${models.length - 8} more</span>` : ''}
                  <button class="btn btn--secondary btn--sm" data-add-model-for="${p.id}" style="padding:3px 8px; font-size:11px; margin-left:4px;">
                    ${icon('plus')} Add model
                  </button>
                </div>
              </td>
              <td class="cell-actions">
                <button class="icon-btn" data-edit-prov="${p.id}" title="Edit brand name">${icon('edit')}</button>
                <button class="icon-btn icon-btn--danger" data-del-prov="${p.id}" title="Delete brand">${icon('trash')}</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  state.providers.forEach(p => {
    $(`[data-add-model-for="${p.id}"]`, content)?.addEventListener('click', () => openModelForm(state, p.id));
    $(`[data-edit-prov="${p.id}"]`, content)?.addEventListener('click', () => openProviderForm(p));
    $(`[data-del-prov="${p.id}"]`, content)?.addEventListener('click', async () => {
      if (await confirmDialog(`Delete brand "${p.name}"?`)) {
        try { await deleteProvider(p.id); toast('Brand deleted', 'success'); }
        catch (err) { toast(err.message, 'error'); }
      }
    });
  });
}

// ---------------- 3. EV Models Tab ----------------
function renderModelsTab(content, state) {
  let allModels = [];
  state.providers.forEach(p => {
    (p.models || []).forEach(m => {
      const inStockCount = state.evUnits.filter(e =>
        e.providerId === p.id &&
        (e.model || '').trim().toUpperCase() === m.toUpperCase() &&
        e.status === 'in-stock'
      ).length;
      allModels.push({
        providerId: p.id,
        brandName: p.name,
        modelName: m,
        inStockCount
      });
    });
  });

  let filtered = [...allModels];
  if (modelFilters.brandId !== 'all') {
    filtered = filtered.filter(x => x.providerId === modelFilters.brandId);
  }
  if (modelFilters.search) {
    const s = modelFilters.search.toLowerCase();
    filtered = filtered.filter(x => x.modelName.toLowerCase().includes(s) || x.brandName.toLowerCase().includes(s));
  }
  filtered.sort((a, b) => a.brandName.localeCompare(b.brandName) || a.modelName.localeCompare(b.modelName));

  content.innerHTML = `
    <div class="filter-bar" style="margin-bottom:var(--space-4);">
      <div class="search-input" style="flex:1;">
        ${icon('search')}
        <input type="text" id="model-search-input" placeholder="Search model name (e.g. WARRIOR, CHALO NEO)..." value="${escapeHtml(modelFilters.search)}">
      </div>
      <div class="field" style="min-width:180px;">
        <div class="select-wrap">
          <select id="model-filter-brand">
            <option value="all">All brands (${allModels.length} models)</option>
            ${state.providers.map(p => `
              <option value="${p.id}" ${modelFilters.brandId === p.id ? 'selected' : ''}>
                ${escapeHtml(p.name)} (${(p.models || []).length})
              </option>`).join('')}
          </select>
          ${icon('chevronDown')}
        </div>
      </div>
    </div>

    ${!filtered.length ? `
      <div class="card">
        <div class="empty-state">
          ${icon('ev', 'empty-state__icon')}
          <h4>No models match your search</h4>
          <p>Try searching for a different name, select another brand, or click "+ Add model" to create one.</p>
        </div>
      </div>
    ` : `
      <div class="table-wrap table-wrap--responsive">
        <table>
          <thead>
            <tr>
              <th>Model Name</th>
              <th>Brand</th>
              <th>Units In Stock</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(item => `
              <tr>
                <td data-label="Model" class="cell-strong" style="font-family:var(--font-mono); font-size:13.5px; letter-spacing:0.03em;">
                  ${escapeHtml(item.modelName)}
                </td>
                <td data-label="Brand">
                  <span class="badge badge--info">${escapeHtml(item.brandName)}</span>
                </td>
                <td data-label="In Stock">
                  ${item.inStockCount > 0
                    ? `<span class="badge badge--success">${item.inStockCount} in stock</span>`
                    : `<span class="cell-muted">0 in stock</span>`}
                </td>
                <td class="cell-actions">
                  <button class="icon-btn" data-edit-model="${escapeHtml(item.providerId)}:::${escapeHtml(item.modelName)}" title="Edit model name">
                    ${icon('edit')}
                  </button>
                  <button class="icon-btn icon-btn--danger" data-del-model="${escapeHtml(item.providerId)}:::${escapeHtml(item.modelName)}" title="Delete model">
                    ${icon('trash')}
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;

  $('#model-search-input')?.addEventListener('input', debounce((e) => {
    modelFilters.search = e.target.value;
    renderTabContent(state);
  }, 180));

  $('#model-filter-brand')?.addEventListener('change', (e) => {
    modelFilters.brandId = e.target.value;
    renderTabContent(state);
  });

  $$('[data-edit-model]', content).forEach(btn => {
    btn.addEventListener('click', () => {
      const [pId, mName] = btn.dataset.editModel.split(':::');
      openEditModelForm(state, pId, mName);
    });
  });

  $$('[data-del-model]', content).forEach(btn => {
    btn.addEventListener('click', async () => {
      const [pId, mName] = btn.dataset.delModel.split(':::');
      const bName = brandName(state, pId);
      if (await confirmDialog(`Delete model "${mName}" from ${bName}?`)) {
        try {
          await deleteModelFromProvider(pId, mName);
          toast(`Model ${mName} deleted from ${bName}`, 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    });
  });
}

function $$(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function brandName(state, id) {
  return state.providers.find(p => p.id === id)?.name || id;
}

function emptyState(iconName, title, message) {
  return `<div class="card"><div class="empty-state">${icon(iconName, 'empty-state__icon')}<h4>${title}</h4><p>${message}</p></div></div>`;
}

// ---------------- Modals ----------------

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

export function openModelForm(state, defaultProviderId = null) {
  const modal = openModal({
    title: 'Add EV Model',
    size: 'sm',
    bodyHtml: `
      <form id="model-add-form">
        <div class="form-grid">
          <div class="field field--full">
            <label>Brand</label>
            <div class="select-wrap">
              <select name="providerId" required>
                ${state.providers.map(p => `
                  <option value="${p.id}" ${(defaultProviderId || state.providers[0]?.id) === p.id ? 'selected' : ''}>
                    ${escapeHtml(p.name)}
                  </option>
                `).join('')}
              </select>
              ${icon('chevronDown')}
            </div>
          </div>
          <div class="field field--full">
            <label>Model Name</label>
            <input name="modelName" id="model-name-input" required placeholder="e.g. WARRIOR" style="text-transform:uppercase;" autofocus>
            <span class="hint">Model names are saved in ALL CAPS and will appear in the EV inventory dropdown.</span>
          </div>
        </div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="model-add-form" class="btn btn--primary">Add model</button>`
  });

  const input = $('#model-name-input', modal);
  input.addEventListener('input', () => {
    const s = input.selectionStart, e = input.selectionEnd;
    input.value = input.value.toUpperCase();
    input.setSelectionRange(s, e);
  });

  $('#model-add-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const providerId = fd.get('providerId');
    const modelName = fd.get('modelName').trim().toUpperCase();
    if (!modelName) return;
    try {
      await addModelToProvider(providerId, modelName);
      closeModal();
      toast(`Model ${modelName} added to ${brandName(state, providerId)}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

export function openEditModelForm(state, providerId, currentModelName) {
  const bName = brandName(state, providerId);
  const modal = openModal({
    title: `Edit Model: ${currentModelName}`,
    size: 'sm',
    bodyHtml: `
      <form id="model-edit-form">
        <div class="form-grid">
          <div class="field field--full">
            <label>Brand</label>
            <input type="text" value="${escapeHtml(bName)}" disabled style="background:var(--bg); color:var(--text-secondary); cursor:not-allowed;">
          </div>
          <div class="field field--full">
            <label>Model Name</label>
            <input name="modelName" id="model-edit-input" required value="${escapeHtml(currentModelName)}" style="text-transform:uppercase;" autofocus>
            <span class="hint">Renaming updates this model and all in-stock vehicles of this model.</span>
          </div>
        </div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn--ghost" data-close-modal>Cancel</button>
      <button type="submit" form="model-edit-form" class="btn btn--primary">Save changes</button>`
  });

  const input = $('#model-edit-input', modal);
  input.addEventListener('input', () => {
    const s = input.selectionStart, e = input.selectionEnd;
    input.value = input.value.toUpperCase();
    input.setSelectionRange(s, e);
  });

  $('#model-edit-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const newModelName = fd.get('modelName').trim().toUpperCase();
    if (!newModelName) return;
    try {
      await updateModelInProvider(providerId, currentModelName, newModelName);
      closeModal();
      toast(`Model updated to ${newModelName}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
