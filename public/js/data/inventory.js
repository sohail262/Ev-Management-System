import {
  db, collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, writeBatch, serverTimestamp
} from '../firebase-init.js';
import { addStockLog } from './log.js';
import { logTransfer } from './transfers.js';
import { STATUS } from '../constants.js';

const evCol = collection(db, 'evUnits');
const batteryCol = collection(db, 'batteryUnits');
const chargerCol = collection(db, 'chargerUnits');
const sparePartsCol = collection(db, 'spareParts');
const sparePartLogsCol = collection(db, 'sparePartLogs');

function unitCol(type) {
  return type === 'battery' ? batteryCol : chargerCol;
}

// ================= EV UNITS =================
export function listenEvUnits(cb) {
  return onSnapshot(evCol, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function addEvUnitWithBundle({
  providerId, model, chassisNo, locationId, costPrice, sellingPrice, bundleWattage,
  bundleBatteryCost = 0, bundleBatteryPrice = 0, bundleChargerCost = 0, bundleChargerPrice = 0
}) {
  const batch = writeBatch(db);
  const evRef = doc(evCol);
  const batteryRef = doc(batteryCol);
  const chargerRef = doc(chargerCol);

  batch.set(batteryRef, {
    wattage: bundleWattage, costPrice: bundleBatteryCost, sellingPrice: bundleBatteryPrice,
    locationId, source: 'bundle', linkedEvId: evRef.id, status: STATUS.IN_STOCK, dateAdded: serverTimestamp()
  });
  batch.set(chargerRef, {
    wattage: bundleWattage, costPrice: bundleChargerCost, sellingPrice: bundleChargerPrice,
    locationId, source: 'bundle', linkedEvId: evRef.id, status: STATUS.IN_STOCK, dateAdded: serverTimestamp()
  });
  batch.set(evRef, {
    providerId, model: model || '', chassisNo: chassisNo || '', locationId,
    costPrice, sellingPrice, bundleWattage,
    bundleBatteryUnitId: batteryRef.id, bundleChargerUnitId: chargerRef.id,
    status: STATUS.IN_STOCK, dateAdded: serverTimestamp()
  });
  addStockLog(batch, { type: 'add', itemType: 'ev', label: `EV added${chassisNo ? ` (${chassisNo})` : ''}`, locationId });
  await batch.commit();
  return evRef.id;
}

export function updateEvUnit(id, data) {
  return updateDoc(doc(evCol, id), data);
}

export async function deleteEvUnit(ev) {
  const batch = writeBatch(db);
  batch.delete(doc(evCol, ev.id));
  if (ev.bundleBatteryUnitId) batch.delete(doc(batteryCol, ev.bundleBatteryUnitId));
  if (ev.bundleChargerUnitId) batch.delete(doc(chargerCol, ev.bundleChargerUnitId));
  await batch.commit();
}

export async function transferEvUnit(ev, toLocationId, note = '') {
  const batch = writeBatch(db);
  batch.update(doc(evCol, ev.id), { locationId: toLocationId });
  if (ev.bundleBatteryUnitId) batch.update(doc(batteryCol, ev.bundleBatteryUnitId), { locationId: toLocationId });
  if (ev.bundleChargerUnitId) batch.update(doc(chargerCol, ev.bundleChargerUnitId), { locationId: toLocationId });
  addStockLog(batch, { type: 'transfer', itemType: 'ev', label: `EV transferred${ev.chassisNo ? ` (${ev.chassisNo})` : ''}`, locationId: ev.locationId, toLocationId, note });
  logTransfer(batch, { itemType: 'ev', itemId: ev.id, fromLocationId: ev.locationId, toLocationId, note });
  await batch.commit();
}

// ================= BATTERY / CHARGER UNITS =================
export function listenUnits(type, cb) {
  return onSnapshot(unitCol(type), (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function addUnits(type, { wattage, costPrice, sellingPrice, locationId, qty = 1 }) {
  const batch = writeBatch(db);
  const col = unitCol(type);
  for (let i = 0; i < qty; i++) {
    const ref = doc(col);
    batch.set(ref, {
      wattage, costPrice, sellingPrice, locationId, source: 'stock',
      status: STATUS.IN_STOCK, dateAdded: serverTimestamp()
    });
  }
  addStockLog(batch, { type: 'add', itemType: type, label: `${qty} × ${wattage}W ${type} added`, locationId, qty });
  await batch.commit();
}

export function updateUnit(type, id, data) {
  return updateDoc(doc(unitCol(type), id), data);
}

export async function deleteUnit(type, id) {
  await deleteDoc(doc(unitCol(type), id));
}

export async function transferUnit(type, unit, toLocationId, note = '') {
  const batch = writeBatch(db);
  batch.update(doc(unitCol(type), unit.id), { locationId: toLocationId });
  addStockLog(batch, { type: 'transfer', itemType: type, label: `${unit.wattage}W ${type} transferred`, locationId: unit.locationId, toLocationId, note });
  logTransfer(batch, { itemType: type, itemId: unit.id, fromLocationId: unit.locationId, toLocationId, note });
  await batch.commit();
}

export async function findAvailableUnits(type, { wattage, locationId, count, preferLinkedEvId }) {
  const col = unitCol(type);
  const q = query(col, where('status', '==', STATUS.IN_STOCK), where('wattage', '==', wattage), where('locationId', '==', locationId));
  const snap = await getDocs(q);
  let units = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (preferLinkedEvId) {
    units.sort((a, b) => (b.linkedEvId === preferLinkedEvId ? 1 : 0) - (a.linkedEvId === preferLinkedEvId ? 1 : 0));
  }
  return units.slice(0, count);
}

// ================= SPARE PARTS =================
export function listenSpareParts(cb) {
  return onSnapshot(sparePartsCol, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function addSparePart({ name, category, costPrice, sellingPrice, reorderLevel, quantity }) {
  const batch = writeBatch(db);
  const ref = doc(sparePartsCol);
  batch.set(ref, { name, category, costPrice, sellingPrice, reorderLevel, quantity, dateAdded: serverTimestamp() });
  const logRef = doc(sparePartLogsCol);
  batch.set(logRef, { sparePartId: ref.id, type: 'in', qty: quantity, date: serverTimestamp(), note: 'Initial stock' });
  addStockLog(batch, { type: 'add', itemType: 'sparepart', label: `${name} added (${quantity} pcs)` });
  await batch.commit();
  return ref.id;
}

export function updateSparePart(id, data) {
  return updateDoc(doc(sparePartsCol, id), data);
}

export async function restockSparePart(part, qty, note = 'Restock') {
  const batch = writeBatch(db);
  batch.update(doc(sparePartsCol, part.id), { quantity: (part.quantity || 0) + qty });
  const logRef = doc(sparePartLogsCol);
  batch.set(logRef, { sparePartId: part.id, type: 'in', qty, date: serverTimestamp(), note });
  addStockLog(batch, { type: 'add', itemType: 'sparepart', label: `${part.name} restocked (+${qty})` });
  await batch.commit();
}

export async function deleteSparePart(id) {
  await deleteDoc(doc(sparePartsCol, id));
}

export function listenSparePartLogs(sparePartId, cb) {
  const q = query(sparePartLogsCol, where('sparePartId', '==', sparePartId));
  return onSnapshot(q, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
