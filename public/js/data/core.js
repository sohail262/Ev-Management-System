import {
  db, collection, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot
} from '../firebase-init.js';
import { SEED_LOCATIONS, SEED_PROVIDERS } from '../constants.js';

const locationsCol = collection(db, 'locations');
const providersCol = collection(db, 'providers');

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
  return onSnapshot(providersCol, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function getProviders() {
  const snap = await getDocs(providersCol);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export function addProvider(data) {
  return addDoc(providersCol, data);
}
export function updateProvider(id, data) {
  return updateDoc(doc(providersCol, id), data);
}
export function deleteProvider(id) {
  return deleteDoc(doc(providersCol, id));
}
