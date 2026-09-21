import {
  db, collection, doc, addDoc, query, orderBy, fsLimit, onSnapshot, serverTimestamp
} from '../firebase-init.js';

const logsCol = collection(db, 'stockLog');

// entry: { type: 'add'|'sale'|'transfer'|'adjust', itemType: 'ev'|'battery'|'charger'|'sparepart', label, locationId, toLocationId?, qty?, note? }
export function addStockLog(batchOrNull, entry) {
  const payload = { ...entry, date: serverTimestamp() };
  if (batchOrNull) {
    const ref = doc(logsCol);
    batchOrNull.set(ref, payload);
    return ref;
  }
  return addDoc(logsCol, payload);
}

export function listenStockLog(cb, max = 100) {
  const q = query(logsCol, orderBy('date', 'desc'), fsLimit(max));
  return onSnapshot(q, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
