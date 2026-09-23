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

export async function addEvUnits({
  providerId, model = '', chassisNos = [], locationId, costPrice, sellingPrice, qty = 1
}) {
  const batch = writeBatch(db);
  const ids = [];
  for (let i = 0; i < qty; i++) {
    const evRef = doc(evCol);
    const chassisNo = (chassisNos[i] || '').trim();
    batch.set(evRef, {
      providerId,
      model: (model || '').trim(),
      chassisNo,
      locationId,
      costPrice: Number(costPrice) || 0,
      sellingPrice: Number(sellingPrice) || 0,
      status: STATUS.IN_STOCK,
      dateAdded: serverTimestamp()
    });
    ids.push(evRef.id);
  }
  addStockLog(batch, {
    type: 'add',
    itemType: 'ev',
    label: `${qty} × ${model || 'EV'} added`,
    locationId,
    qty
  });
  await batch.commit();
  return ids;
}

// Compatibility exports for backwards compatibility and browser caches
export async function addEvUnit(data) {
  return addEvUnits(data);
}
export async function addEvUnitWithBundle(data) {
  return addEvUnits(data);
}

export function updateEvUnit(id, data) {
  return updateDoc(doc(evCol, id), data);
}

export async function deleteEvUnit(ev) {
  await deleteDoc(doc(evCol, ev.id));
}

export async function transferEvUnit(ev, toLocationId, note = '', qty = 1) {
  const batch = writeBatch(db);
  const fromLoc = ev.locationId;
  const numQty = Math.max(1, parseInt(qty) || 1);

  let evsToTransfer = [ev];
  if (numQty > 1) {
    const q = query(
      evCol,
      where('status', '==', STATUS.IN_STOCK),
      where('locationId', '==', fromLoc),
      where('providerId', '==', ev.providerId)
    );
    const snap = await getDocs(q);
    const matches = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(e => (e.model || '').trim().toLowerCase() === (ev.model || '').trim().toLowerCase());

    const otherMatches = matches.filter(e => e.id !== ev.id);
    evsToTransfer = [ev, ...otherMatches].slice(0, numQty);
  }

  evsToTransfer.forEach(e => {
    batch.update(doc(evCol, e.id), { locationId: toLocationId });
  });

  const count = evsToTransfer.length;
  const label = `${count} × ${ev.model || 'EV'} transferred`;
  addStockLog(batch, {
    type: 'transfer',
    itemType: 'ev',
    label,
    locationId: fromLoc,
    toLocationId,
    qty: count,
    note
  });

  logTransfer(batch, {
    itemType: 'ev',
    itemLabel: `${ev.model || 'EV'}`,
    qty: count,
    itemId: ev.id,
    itemIds: evsToTransfer.map(e => e.id),
    fromLocationId: fromLoc,
    toLocationId,
    note
  });

  await batch.commit();
  return count;
}

// ================= BATTERY / CHARGER UNITS =================
export function listenUnits(type, cb) {
  return onSnapshot(unitCol(type), (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function addUnits(type, { wattage, batteryType, costPrice, sellingPrice, locationId, qty = 1 }) {
  const batch = writeBatch(db);
  const col = unitCol(type);
  const isBattery = type === 'battery';
  const cleanBattType = batteryType || 'Lead Battery';
  const cleanWattage = Number(wattage) || 48;
  const numQty = Math.max(1, parseInt(qty) || 1);

  for (let i = 0; i < numQty; i++) {
    const ref = doc(col);
    const data = {
      costPrice: Number(costPrice) || 0,
      sellingPrice: Number(sellingPrice) || 0,
      locationId,
      source: 'stock',
      status: STATUS.IN_STOCK,
      dateAdded: serverTimestamp()
    };
    if (isBattery) {
      data.batteryType = cleanBattType;
      data.unitWattage = 12; // Each battery is of 12W
    } else {
      data.wattage = cleanWattage;
    }
    batch.set(ref, data);
  }

  const logLabel = isBattery
    ? `${numQty} × ${cleanBattType} added (${numQty * 12}W combined)`
    : `${numQty} × ${cleanWattage}W Charger added`;

  addStockLog(batch, { type: 'add', itemType: type, label: logLabel, locationId, qty: numQty });
  await batch.commit();
}

export async function deleteEvUnitsBatch(evIds) {
  const batch = writeBatch(db);
  evIds.forEach(id => batch.delete(doc(evCol, id)));
  await batch.commit();
}

export async function deleteUnitsBatch(type, unitIds) {
  const batch = writeBatch(db);
  const col = unitCol(type);
  unitIds.forEach(id => batch.delete(doc(col, id)));
  await batch.commit();
}

export function updateUnit(type, id, data) {
  return updateDoc(doc(unitCol(type), id), data);
}

export async function deleteUnit(type, id) {
  await deleteDoc(doc(unitCol(type), id));
}

export async function transferUnit(type, unit, toLocationId, note = '', qty = 1) {
  const batch = writeBatch(db);
  const col = unitCol(type);
  const fromLoc = unit.locationId;
  const isBattery = type === 'battery';
  const desc = isBattery
    ? (unit.batteryType || `${unit.wattage || 12}W Battery`)
    : `${unit.wattage}W Charger`;
  const numQty = Math.max(1, parseInt(qty) || 1);

  let unitsToTransfer = [unit];
  if (numQty > 1) {
    const q = query(col, where('status', '==', STATUS.IN_STOCK), where('locationId', '==', fromLoc));
    const snap = await getDocs(q);
    let matches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (isBattery) {
      matches = matches.filter(u => (u.batteryType || 'Lead Battery') === (unit.batteryType || 'Lead Battery'));
    } else {
      matches = matches.filter(u => Number(u.wattage) === Number(unit.wattage));
    }
    const otherMatches = matches.filter(u => u.id !== unit.id);
    unitsToTransfer = [unit, ...otherMatches].slice(0, numQty);
  }

  unitsToTransfer.forEach(u => {
    batch.update(doc(col, u.id), { locationId: toLocationId });
  });

  const count = unitsToTransfer.length;
  const label = `${count} × ${desc} transferred`;
  addStockLog(batch, {
    type: 'transfer',
    itemType: type,
    label,
    locationId: fromLoc,
    toLocationId,
    qty: count,
    note
  });

  logTransfer(batch, {
    itemType: type,
    itemLabel: desc,
    qty: count,
    itemId: unit.id,
    itemIds: unitsToTransfer.map(u => u.id),
    fromLocationId: fromLoc,
    toLocationId,
    note
  });

  await batch.commit();
  return count;
}

export async function createDirectTransfer({ itemType, providerId, model, batteryType, wattage, fromLocationId, toLocationId, qty = 1, note = '' }) {
  const batch = writeBatch(db);
  const numQty = Math.max(1, parseInt(qty) || 1);
  let label = '';
  let transferredIds = [];

  if (itemType === 'ev') {
    const q = query(evCol, where('status', '==', STATUS.IN_STOCK), where('locationId', '==', fromLocationId));
    const snap = await getDocs(q);
    let matches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (providerId) matches = matches.filter(e => e.providerId === providerId);
    if (model) matches = matches.filter(e => (e.model || '').trim().toLowerCase() === model.trim().toLowerCase());
    if (matches.length < numQty) {
      throw new Error(`Only ${matches.length} unit(s) available in stock to transfer.`);
    }
    const toMove = matches.slice(0, numQty);
    toMove.forEach(e => batch.update(doc(evCol, e.id), { locationId: toLocationId }));
    transferredIds = toMove.map(e => e.id);
    label = `${numQty} × ${model || 'EV'}`;
  } else {
    const col = unitCol(itemType);
    const isBattery = itemType === 'battery';
    const q = query(col, where('status', '==', STATUS.IN_STOCK), where('locationId', '==', fromLocationId));
    const snap = await getDocs(q);
    let matches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (isBattery) {
      matches = matches.filter(u => (u.batteryType || 'Lead Battery') === (batteryType || 'Lead Battery'));
      label = `${numQty} × ${batteryType || 'Lead Battery'}`;
    } else {
      matches = matches.filter(u => Number(u.wattage) === Number(wattage));
      label = `${numQty} × ${wattage}W Charger`;
    }
    if (matches.length < numQty) {
      throw new Error(`Only ${matches.length} unit(s) available in stock to transfer.`);
    }
    const toMove = matches.slice(0, numQty);
    toMove.forEach(u => batch.update(doc(col, u.id), { locationId: toLocationId }));
    transferredIds = toMove.map(u => u.id);
  }

  addStockLog(batch, {
    type: 'transfer',
    itemType,
    label: `${label} transferred`,
    locationId: fromLocationId,
    toLocationId,
    qty: numQty,
    note
  });

  logTransfer(batch, {
    itemType,
    itemLabel: label.replace(/^\d+ × /, ''),
    qty: numQty,
    itemIds: transferredIds,
    fromLocationId,
    toLocationId,
    note
  });

  await batch.commit();
  return transferredIds;
}

export async function findAvailableUnits(type, { wattage, batteryType, locationId, count }) {
  const col = unitCol(type);
  const q = query(col, where('status', '==', STATUS.IN_STOCK), where('locationId', '==', locationId));
  const snap = await getDocs(q);
  let units = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (type === 'battery') {
    if (batteryType) {
      units = units.filter(u => (u.batteryType === batteryType) || (!u.batteryType && batteryType.includes('Lead')));
    }
  } else if (type === 'charger') {
    if (wattage) {
      units = units.filter(u => Number(u.wattage) === Number(wattage));
    }
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

export async function transferSparePart(part, toLocationId, qty = 1, note = '') {
  const numQty = Math.max(1, parseInt(qty) || 1);
  if ((part.quantity || 0) < numQty) {
    throw new Error(`Only ${part.quantity || 0} pcs available in stock.`);
  }
  const batch = writeBatch(db);
  batch.update(doc(sparePartsCol, part.id), {
    quantity: (part.quantity || 0) - numQty
  });
  const logRef = doc(sparePartLogsCol);
  batch.set(logRef, {
    sparePartId: part.id,
    type: 'out',
    qty: numQty,
    toLocationId,
    date: serverTimestamp(),
    note: `Transfer to ${toLocationId}: ${note}`
  });
  addStockLog(batch, {
    type: 'transfer',
    itemType: 'sparepart',
    label: `${numQty} × ${part.name} transferred`,
    locationId: 'loc_jadcherla',
    toLocationId,
    qty: numQty,
    note
  });
  logTransfer(batch, {
    itemType: 'sparepart',
    itemLabel: part.name,
    qty: numQty,
    itemId: part.id,
    fromLocationId: 'loc_jadcherla',
    toLocationId,
    note
  });
  await batch.commit();
}

export async function deleteSparePart(id) {
  await deleteDoc(doc(sparePartsCol, id));
}

export function listenSparePartLogs(sparePartId, cb) {
  const q = query(sparePartLogsCol, where('sparePartId', '==', sparePartId));
  return onSnapshot(q, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
