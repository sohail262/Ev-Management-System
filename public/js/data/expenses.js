import {
  db, collection, doc, addDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp, Timestamp
} from '../firebase-init.js';
import { addStockLog } from './log.js';

const expensesCol = collection(db, 'expenses');

export function listenExpenses(cb) {
  const q = query(expensesCol, orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function addExpense({
  date,
  locationId,
  category,
  amount,
  paymentMethod = 'Cash',
  paidTo = '',
  description = '',
  receiptNo = ''
}) {
  const parsedAmount = Number(amount);
  if (!parsedAmount || parsedAmount <= 0) {
    throw new Error('Expense amount must be greater than zero.');
  }
  if (!category) {
    throw new Error('Expense category is required.');
  }
  if (!locationId) {
    throw new Error('Please select a showroom location.');
  }

  // Parse date
  let expenseDate = new Date();
  if (date) {
    if (typeof date === 'string') {
      const parts = date.split('-');
      if (parts.length === 3) {
        const now = new Date();
        expenseDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), now.getHours(), now.getMinutes(), now.getSeconds());
      } else {
        expenseDate = new Date(date);
      }
    } else if (date instanceof Date) {
      expenseDate = date;
    }
  }

  const payload = {
    date: Timestamp.fromDate(expenseDate),
    locationId,
    category,
    amount: Math.round(parsedAmount * 100) / 100,
    paymentMethod,
    paidTo: (paidTo || '').trim(),
    description: (description || '').trim(),
    receiptNo: (receiptNo || '').trim(),
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(expensesCol, payload);

  // Add an entry in activity log
  try {
    await addStockLog(null, {
      type: 'expense',
      label: `Expense: ${category} (₹${payload.amount})`,
      locationId,
      note: description || paidTo || category
    });
  } catch (e) {
    console.warn('Failed to log stock activity for expense:', e);
  }

  return docRef.id;
}

export async function updateExpense(id, {
  date,
  locationId,
  category,
  amount,
  paymentMethod,
  paidTo,
  description,
  receiptNo
}) {
  const updates = {};
  if (amount !== undefined) {
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) throw new Error('Amount must be greater than zero.');
    updates.amount = Math.round(parsedAmount * 100) / 100;
  }
  if (category !== undefined) updates.category = category;
  if (locationId !== undefined) updates.locationId = locationId;
  if (paymentMethod !== undefined) updates.paymentMethod = paymentMethod;
  if (paidTo !== undefined) updates.paidTo = (paidTo || '').trim();
  if (description !== undefined) updates.description = (description || '').trim();
  if (receiptNo !== undefined) updates.receiptNo = (receiptNo || '').trim();

  if (date) {
    if (typeof date === 'string') {
      const parts = date.split('-');
      if (parts.length === 3) {
        const now = new Date();
        updates.date = Timestamp.fromDate(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), now.getHours(), now.getMinutes(), now.getSeconds()));
      } else {
        updates.date = Timestamp.fromDate(new Date(date));
      }
    } else if (date instanceof Date) {
      updates.date = Timestamp.fromDate(date);
    }
  }

  updates.updatedAt = serverTimestamp();
  await updateDoc(doc(expensesCol, id), updates);
}

export async function deleteExpense(id) {
  await deleteDoc(doc(expensesCol, id));
}
