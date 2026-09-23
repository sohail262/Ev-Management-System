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

// ================= EV SALE (flexible battery & charger) =================
export async function createEvSale({
  ev, batteryType = '', batteryCount = 0, chargerWattage = null,
  price, customerName, customerPhone, locationId, paymentMethod, saleDate
}) {
  const count = Number(batteryCount) || 0;
  let batteryUnits = [];
  if (batteryType && count > 0) {
    batteryUnits = await findAvailableUnits('battery', { batteryType, locationId, count });
    if (batteryUnits.length < count) {
      throw new Error(`Only ${batteryUnits.length} unit(s) of ${batteryType} available at this location (need ${count}).`);
    }
  }

  let chargerUnit = null;
  if (chargerWattage) {
    const chgUnits = await findAvailableUnits('charger', { wattage: Number(chargerWattage), locationId, count: 1 });
    if (!chgUnits.length) {
      throw new Error(`No ${chargerWattage}W charger available at this location.`);
    }
    chargerUnit = chgUnits[0];
  }

  const battCost = batteryUnits.reduce((s, u) => s + (u.costPrice || 0), 0);
  const battSelling = batteryUnits.reduce((s, u) => s + (u.sellingPrice || 0), 0);
  const chgCost = chargerUnit ? (chargerUnit.costPrice || 0) : 0;
  const chgSelling = chargerUnit ? (chargerUnit.sellingPrice || 0) : 0;

  const costTotal = (ev.costPrice || 0) + battCost + chgCost;
  const computedPrice = (ev.sellingPrice || 0) + battSelling + chgSelling;
  const finalPrice = price != null && price !== '' ? Number(price) : computedPrice;
  const invoiceNo = await nextInvoiceNo();

  const batch = writeBatch(db);
  const saleRef = doc(salesCol);
  batch.set(saleRef, {
    invoiceNo, type: 'ev', date: saleDate ? new Date(saleDate) : serverTimestamp(),
    customerName: customerName || '', customerPhone: customerPhone || '', locationId, paymentMethod,
    evId: ev.id, providerId: ev.providerId, model: ev.model || '', chassisNo: ev.chassisNo || '',
    hasBattery: Boolean(batteryType && count > 0),
    batteryType: batteryType || '',
    batteryCount: count,
    batteryCombinedWattage: count * 12,
    batteryUnitIds: batteryUnits.map(u => u.id),
    batteriesPrice: battSelling,
    hasCharger: Boolean(chargerUnit),
    chargerWattage: chargerUnit ? Number(chargerWattage) : null,
    chargerUnitId: chargerUnit ? chargerUnit.id : null,
    chargerPrice: chgSelling,
    evPrice: ev.sellingPrice || 0,
    price: finalPrice, costTotal, profit: finalPrice - costTotal
  });

  batch.update(doc(evCol, ev.id), { status: STATUS.SOLD, saleId: saleRef.id, dateSold: serverTimestamp() });
  batteryUnits.forEach(u => batch.update(doc(batteryCol, u.id), { status: STATUS.SOLD, saleId: saleRef.id, dateSold: serverTimestamp() }));
  if (chargerUnit) {
    batch.update(doc(chargerCol, chargerUnit.id), { status: STATUS.SOLD, saleId: saleRef.id, dateSold: serverTimestamp() });
  }

  addStockLog(batch, { type: 'sale', itemType: 'ev', label: `EV sold${customerName ? ` to ${customerName}` : ''}`, locationId });
  await batch.commit();
  return saleRef.id;
}

// ================= STANDALONE BATTERY / CHARGER SALE =================
export async function createUnitSale(type, {
  batteryType, wattage, qty = 1, price, locationId, customerName, customerPhone, paymentMethod, saleDate
}) {
  const count = Math.max(1, Number(qty) || 1);
  const isBattery = type === 'battery';
  const units = await findAvailableUnits(type, {
    batteryType: isBattery ? batteryType : undefined,
    wattage: !isBattery ? Number(wattage) : undefined,
    locationId,
    count
  });

  if (units.length < count) {
    const name = isBattery ? batteryType : `${wattage}W Charger`;
    throw new Error(`Only ${units.length} unit(s) of ${name} available at this location (need ${count}).`);
  }

  const costTotal = units.reduce((s, u) => s + (u.costPrice || 0), 0);
  const computedPrice = units.reduce((s, u) => s + (u.sellingPrice || 0), 0);
  const finalPrice = price != null && price !== '' ? Number(price) : computedPrice;
  const invoiceNo = await nextInvoiceNo();

  const batch = writeBatch(db);
  const saleRef = doc(salesCol);
  batch.set(saleRef, {
    invoiceNo, type, date: saleDate ? new Date(saleDate) : serverTimestamp(),
    customerName: customerName || '', customerPhone: customerPhone || '', locationId, paymentMethod,
    qty: count,
    batteryType: isBattery ? batteryType : '',
    batteryCombinedWattage: isBattery ? (count * 12) : null,
    wattage: isBattery ? 12 : Number(wattage),
    unitIds: units.map(u => u.id),
    price: finalPrice, costTotal, profit: finalPrice - costTotal
  });

  units.forEach(u => batch.update(doc(unitCol(type), u.id), { status: STATUS.SOLD, saleId: saleRef.id, dateSold: serverTimestamp() }));
  const logDesc = isBattery
    ? `${count} × ${batteryType} sold (${count * 12}W)`
    : `${count} × ${wattage}W Charger sold`;
  addStockLog(batch, { type: 'sale', itemType: type, label: logDesc, locationId });
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
