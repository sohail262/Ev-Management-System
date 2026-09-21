import { db, collection, doc, query, orderBy, onSnapshot, serverTimestamp } from '../firebase-init.js';

const transfersCol = collection(db, 'transfers');

// data: { itemType: 'ev'|'battery'|'charger', itemId, fromLocationId, toLocationId, note }
export function logTransfer(batch, data) {
  const ref = doc(transfersCol);
  batch.set(ref, { ...data, date: serverTimestamp() });
  return ref;
}

export function listenTransfers(cb) {
  const q = query(transfersCol, orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
