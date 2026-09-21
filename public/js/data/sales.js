import {
  db, collection, doc, getDoc, query, orderBy, fsLimit, onSnapshot,
  writeBatch, runTransaction, serverTimestamp
} from '../firebase-init.js';
import { STATUS } from '../constants.js';
import { addStockLog } from './log.js';
import { findAvailableUnits } from './inventory.js';
import { invoiceNumber } from '../utils.js';

const salesCol = collection(db, 'sales');
const evCol = collection(db, 'evUnits');
const batteryCol = collection(db, 'batteryUnits');
const chargerCol = collection(db, 'chargerUnits');
const sparePartsCol = collection(db, 'spareParts');
const sparePartLogsCol = collection(db, 'sparePartLogs');
const counterRef = doc(db, 'meta', 'counters');

function unitCol(type) {
  return type === 'battery' ? batteryCol : chargerCol;
}

async function nextInvoiceNo() {
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = (snap.exists() ? (snap.data().seq || 0) : 0) + 1;
    tx.set(counterRef, { seq: next }, { merge: true });
    return next;
  });
  return invoiceNumber(seq);
}

// ================= EV SALE (bundle) =================
export async function createEvSale({ ev, batteryWattage, batteryCount, price, customerName, customerPhone, locationId, paymentMethod, saleDate }) {
  const batteryUnits = await findAvailableUnits('battery', { wattage: batteryWattage, locationId, count: batteryCount, preferLinkedEvId: ev.id });
  if (batteryUnits.length < batteryCount) {
    throw new Error(`Only ${batteryUnits.length} battery unit(s) of ${batteryWattage}W available at this location (need ${batteryCount}).`);
  }
  const chargerUnits = await findAvailableUnits('charger', { wattage: batteryWattage, locationId, count: 1, preferLinkedEvId: ev.id });
  if (chargerUnits.length < 1) {
    throw new Error(`No ${batteryWattage}W charger available at this location.`);
  }
  const chargerUnit = chargerUnits[0];

  const costTotal = (ev.costPrice || 0) + batteryUnits.reduce((s, u) => s + (u.costPrice || 0), 0) + (chargerUnit.costPrice || 0);
  const computedPrice = (ev.sellingPrice || 0) + batteryUnits.reduce((s, u) => s + (u.sellingPrice || 0), 0) + (chargerUnit.sellingPrice || 0);
  const finalPrice = price != null && price !== '' ? Number(price) : computedPrice;
  const invoiceNo = await nextInvoiceNo();

  const batch = writeBatch(db);
  const saleRef = doc(salesCol);
  batch.set(saleRef, {
    invoiceNo, type: 'ev', date: saleDate ? new Date(saleDate) : serverTimestamp(),
    customerName: customerName || '', customerPhone: customerPhone || '', locationId, paymentMethod,
    evId: ev.id, providerId: ev.providerId, model: ev.model || '', chassisNo: ev.chassisNo || '',
    batteryWattage, batteryCount, batteryUnitIds: batteryUnits.map(u => u.id), chargerUnitId: chargerUnit.id,
    evPrice: ev.sellingPrice || 0,
    batteriesPrice: batteryUnits.reduce((s, u) => s + (u.sellingPrice || 0), 0),
    chargerPrice: chargerUnit.sellingPrice || 0,
    price: finalPrice, costTotal, profit: finalPrice - costTotal
  });
  batch.update(doc(evCol, ev.id), { status: STATUS.SOLD, saleId: saleRef.id, dateSold: serverTimestamp() });
  batteryUnits.forEach(u => batch.update(doc(batteryCol, u.id), { status: STATUS.SOLD, saleId: saleRef.id, dateSold: serverTimestamp() }));
  batch.update(doc(chargerCol, chargerUnit.id), { status: STATUS.SOLD, saleId: saleRef.id, dateSold: serverTimestamp() });
  addStockLog(batch, { type: 'sale', itemType: 'ev', label: `EV sold${customerName ? ` to ${customerName}` : ''}`, locationId });
  await batch.commit();
  return saleRef.id;
}

// ================= STANDALONE BATTERY / CHARGER SALE =================
export async function createUnitSale(type, { unit, price, customerName, customerPhone, paymentMethod, saleDate }) {
  const invoiceNo = await nextInvoiceNo();
  const finalPrice = price != null && price !== '' ? Number(price) : (unit.sellingPrice || 0);
  const batch = writeBatch(db);
  const saleRef = doc(salesCol);
  batch.set(saleRef, {
    invoiceNo, type, date: saleDate ? new Date(saleDate) : serverTimestamp(),
    customerName: customerName || '', customerPhone: customerPhone || '', locationId: unit.locationId, paymentMethod,
    unitId: unit.id, wattage: unit.wattage,
    price: finalPrice, costTotal: unit.costPrice || 0, profit: finalPrice - (unit.costPrice || 0)
  });
  batch.update(doc(unitCol(type), unit.id), { status: STATUS.SOLD, saleId: saleRef.id, dateSold: serverTimestamp() });
  addStockLog(batch, { type: 'sale', itemType: type, label: `${unit.wattage}W ${type} sold`, locationId: unit.locationId });
  await batch.commit();
  return saleRef.id;
}

// ================= SPARE PART SALE =================
export async function createSparePartSale({ part, qty, price, customerName, customerPhone, locationId, paymentMethod, saleDate }) {
  if (qty > (part.quantity || 0)) throw new Error(`Only ${part.quantity} in stock.`);
  const invoiceNo = await nextInvoiceNo();
  const finalPrice = price != null && price !== '' ? Number(price) : (part.sellingPrice || 0) * qty;
  const costTotal = (part.costPrice || 0) * qty;
  const batch = writeBatch(db);
  const saleRef = doc(salesCol);
  batch.set(saleRef, {
    invoiceNo, type: 'sparepart', date: saleDate ? new Date(saleDate) : serverTimestamp(),
    customerName: customerName || '', customerPhone: customerPhone || '', locationId, paymentMethod,
    sparePartId: part.id, sparePartName: part.name, qty,
    price: finalPrice, costTotal, profit: finalPrice - costTotal
  });
  batch.update(doc(sparePartsCol, part.id), { quantity: part.quantity - qty });
  const logRef = doc(sparePartLogsCol);
  batch.set(logRef, { sparePartId: part.id, type: 'out', qty, date: serverTimestamp(), note: 'Sold', saleId: saleRef.id });
  addStockLog(batch, { type: 'sale', itemType: 'sparepart', label: `${part.name} sold (${qty} pcs)`, locationId });
  await batch.commit();
  return saleRef.id;
}

// ================= READ =================
export function listenSales(cb, max = 500) {
  const q = query(salesCol, orderBy('date', 'desc'), fsLimit(max));
  return onSnapshot(q, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function getSale(id) {
  const snap = await getDoc(doc(salesCol, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
