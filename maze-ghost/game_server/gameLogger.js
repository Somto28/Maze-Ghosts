// gameLogger.js — the Firestore "sink" for the study logger.
//
// This file only knows how to save one finished record to Firestore. Everything about WHAT gets recorded
// lives in log.js, which loads this file in the background. If Firebase can't load (offline, or a school
// network that blocks gstatic.com), log.js keeps the records in the browser and retries later, so the
// game never breaks and no data is silently lost.
//
// Every record is written with setDoc() under an ID chosen in the browser, so sending the same record
// twice (after a retry) can never create a duplicate: the second write is refused by the rules.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

// Firebase console → Project settings → General → Your apps.
// These values are safe to ship in front-end code; firestore.rules protects the data.
const firebaseConfig = {
  apiKey: "AIzaSyBmRWXcOMt_OFFiXA_QhYtlRUc7xBOmD6E",
  authDomain: "clearpath-3fb96.firebaseapp.com",
  projectId: "clearpath-3fb96",
  storageBucket: "clearpath-3fb96.firebasestorage.app",
  messagingSenderId: "708316665515",
  appId: "1:708316665515:web:51cf517455b77f03e2c9ee",
  measurementId: "G-ZMT6L7C8JS",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Save one record. Resolves "saved", or "rejected" when the rules refuse it (it already exists or is
 * malformed: retrying won't help). Throws on network trouble, so the caller keeps it and tries again.
 */
export async function write(collectionName, id, data) {
  try {
    await setDoc(doc(db, collectionName, id), { ...data, createdAt: serverTimestamp() });
    return "saved";
  } catch (err) {
    if (err?.code === "permission-denied" || err?.code === "invalid-argument") {
      console.warn(`Study log: ${collectionName}/${id} was refused (already saved, or invalid).`, err.message);
      return "rejected";
    }
    throw err;
  }
}
