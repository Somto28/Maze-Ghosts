// gameLogger.js — the Firestore "sink" for the study logger.
//
// Load it from game.js (first line):
//   import { logger } from "/game_server/gameLogger.js";
//
// Calls from your game code:
//   logger.startAttempt(1);                       // when a level (re)starts
//   logger.recordAnswer("q4", "B", false);        // when a player answers a question
//   logger.recordMove("up");                      // each move in the gameplay loop
//   logger.endAttempt("death", { x: 4, y: 7 });   // on death
//   logger.endAttempt("win");                     // on level clear
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
