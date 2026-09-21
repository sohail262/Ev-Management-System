// Firebase app initialization (modular SDK, loaded from CDN as ES modules).
// Replace the config below with your own Firebase project's config if you
// ever need to point this app at a different project.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc,
  deleteDoc, query, where, orderBy, limit as fsLimit, onSnapshot, serverTimestamp,
  writeBatch, runTransaction, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyAs0dQInjPaNpK1LKYOV6-eVi3AKKPkrNQ",
  authDomain: "ulike-27111.firebaseapp.com",
  projectId: "ulike-27111",
  storageBucket: "ulike-27111.firebasestorage.app",
  messagingSenderId: "692858248158",
  appId: "1:692858248158:web:7ca3c1e388055304bb5b4f",
  measurementId: "G-JC748PMSPY"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, fsLimit, onSnapshot, serverTimestamp, writeBatch,
  runTransaction, Timestamp
};
