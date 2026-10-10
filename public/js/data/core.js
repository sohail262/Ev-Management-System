import {
  db, collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, writeBatch, onSnapshot
} from '../firebase-init.js';
import { SEED_LOCATIONS, SEED_PROVIDERS, DEFAULT_BRAND_MODELS } from '../constants.js';

const locationsCol = collection(db, 'locations');
const providersCol = collection(db, 'providers');
const evUnitsCol = collection(db, 'evUnits');

export async function ensureSeedData() {
  const [locSnap, provSnap] = await Promise.all([getDocs(locationsCol), getDocs(providersCol)]);
  if (locSnap.empty) {
    await Promise.all(SEED_LOCATIONS.map(loc => {
      const { id, ...data } = loc;
      return setDoc(doc(locationsCol, id), data);
    }));
  }
  if (provSnap.empty) {
    await Promise.all(SEED_PROVIDERS.map(p => {
      const { id, ...data } = p;
      return setDoc(doc(providersCol, id), data);
    }));
  } else {
    // Check if existing providers need their models list seeded / populated
    const updates = [];
    provSnap.docs.forEach(d => {
      const data = d.data();
      const defaultModels = DEFAULT_BRAND_MODELS[d.id];
      if (defaultModels && (!Array.isArray(data.models) || data.models.length === 0)) {
        updates.push(updateDoc(doc(providersCol, d.id), { models: defaultModels }));
      }
    });
    if (updates.length) await Promise.all(updates);
  }
}

// ---------- Locations ----------
export function listenLocations(cb) {
  return onSnapshot(locationsCol, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function getLocations() {
  const snap = await getDocs(locationsCol);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export function addLocation(data) {
  return addDoc(locationsCol, data);
}
export function updateLocation(id, data) {
  return updateDoc(doc(locationsCol, id), data);
}
export function deleteLocation(id) {
  return deleteDoc(doc(locationsCol, id));
}

// ---------- Providers (brands) ----------
export function listenProviders(cb) {
  return onSnapshot(providersCol, (snap) => cb(snap.docs.map(d => {
    const data = d.data();
    const models = (Array.isArray(data.models) && data.models.length > 0)
      ? data.models
      : (DEFAULT_BRAND_MODELS[d.id] || []);
    return { id: d.id, ...data, models };
  })));
}
export async function getProviders() {
  const snap = await getDocs(providersCol);
  return snap.docs.map(d => {
    const data = d.data();
    const models = (Array.isArray(data.models) && data.models.length > 0)
      ? data.models
      : (DEFAULT_BRAND_MODELS[d.id] || []);
    return { id: d.id, ...data, models };
  });
}
export function addProvider(data) {
  const models = Array.isArray(data.models) ? data.models : (DEFAULT_BRAND_MODELS[data.name?.toLowerCase()] || []);
  return addDoc(providersCol, { ...data, models });
}
export function updateProvider(id, data) {
  return updateDoc(doc(providersCol, id), data);
}
export function deleteProvider(id) {
  return deleteDoc(doc(providersCol, id));
}

// ---------- Brand Models Management ----------
export async function addModelToProvider(providerId, modelName) {
  const cleanModel = (modelName || '').trim().toUpperCase();
  if (!cleanModel) throw new Error('Model name cannot be empty.');
  const provRef = doc(providersCol, providerId);
  const provSnap = await getDoc(provRef);
  let currentModels = [];
  if (provSnap.exists()) {
    const data = provSnap.data();
    currentModels = (Array.isArray(data.models) && data.models.length > 0)
      ? data.models
      : (DEFAULT_BRAND_MODELS[providerId] || []);
  } else {
    currentModels = DEFAULT_BRAND_MODELS[providerId] || [];
  }

  if (currentModels.map(m => m.toUpperCase()).includes(cleanModel)) {
    return cleanModel; // already present
  }

  const updatedModels = [...currentModels, cleanModel];
  await setDoc(provRef, { models: updatedModels }, { merge: true });
  return cleanModel;
}

export async function updateModelInProvider(providerId, oldModelName, newModelName) {
  const cleanOld = (oldModelName || '').trim().toUpperCase();
  const cleanNew = (newModelName || '').trim().toUpperCase();
  if (!cleanNew) throw new Error('New model name cannot be empty.');
  if (cleanOld === cleanNew) return;

  const provRef = doc(providersCol, providerId);
  const provSnap = await getDoc(provRef);
  let currentModels = [];
  if (provSnap.exists()) {
    const data = provSnap.data();
    currentModels = (Array.isArray(data.models) && data.models.length > 0)
      ? data.models
      : (DEFAULT_BRAND_MODELS[providerId] || []);
  } else {
    currentModels = DEFAULT_BRAND_MODELS[providerId] || [];
  }

  const updatedModels = currentModels.map(m => m.toUpperCase() === cleanOld ? cleanNew : m);
  if (!updatedModels.includes(cleanNew)) {
    updatedModels.push(cleanNew);
  }
  await setDoc(provRef, { models: updatedModels }, { merge: true });

  // Also update existing EV units in stock that have the old model name
  try {
    const evQuery = query(evUnitsCol, where('providerId', '==', providerId));
    const evSnap = await getDocs(evQuery);
    const batch = writeBatch(db);
    let count = 0;
    evSnap.docs.forEach(d => {
      const evData = d.data();
      if ((evData.model || '').trim().toUpperCase() === cleanOld) {
        batch.update(d.ref, { model: cleanNew });
        count++;
      }
    });
    if (count > 0) {
      await batch.commit();
    }
  } catch (err) {
    console.warn('Could not batch update EV unit models:', err);
  }
}

export async function deleteModelFromProvider(providerId, modelName) {
  const cleanModel = (modelName || '').trim().toUpperCase();
  const provRef = doc(providersCol, providerId);
  const provSnap = await getDoc(provRef);
  let currentModels = [];
  if (provSnap.exists()) {
    const data = provSnap.data();
    currentModels = (Array.isArray(data.models) && data.models.length > 0)
      ? data.models
      : (DEFAULT_BRAND_MODELS[providerId] || []);
  } else {
    currentModels = DEFAULT_BRAND_MODELS[providerId] || [];
  }

  const updatedModels = currentModels.filter(m => m.toUpperCase() !== cleanModel);
  await setDoc(provRef, { models: updatedModels }, { merge: true });
}

