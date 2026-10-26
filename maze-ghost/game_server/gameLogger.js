// gameLogger.js — Maze Ghosts gameplay logging to Firestore
// No npm or build tool needed: Firebase loads straight from Google's CDN.
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
// Playtest groups: share a link with ?group=NAME, for example
//   https://YOUR-APP.up.railway.app/game_server/?group=periodA
// Every attempt from that tab is tagged with that group. Without it, the group is "general".

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

// ⚠️ Keep YOUR existing config here (copy the block from your current gameLogger.js,
// or from Firebase console → Project settings → General → Your apps).
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

// ---------- Player ID and playtest group ----------

function storageGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* ignore */ }
}

// Anonymous player ID: random, no names or emails. One per browser tab.
function getSessionId() {
  let id = storageGet("mg_session");
  if (!id) {
    id = crypto.randomUUID();
    storageSet("mg_session", id);
  }
  return id;
}

// Group from the link (?group=periodA). Letters, numbers, - and _ only, max 32 chars.
// Remembered for the tab, so it survives page reloads and level changes.
function getGroup() {
  const fromUrl = new URLSearchParams(location.search).get("group");
  if (fromUrl) {
    const clean = fromUrl.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
    if (clean) {
      storageSet("mg_group", clean);
      return clean;
    }
  }
  return storageGet("mg_group") || "general";
}

// Readable, time-ordered document ID, e.g. 2026-10-28_14-05-22_periodA_L3_a5_k9x2b1
// Firestore's console sorts by ID, so attempts appear in time order.
function makeDocId(group, level, attemptNumber, sessionId) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const playerTag = sessionId.replace(/-/g, "").slice(0, 6);
  return `${stamp}_${group}_L${level}_a${attemptNumber}_${playerTag}`;
}

// ---------- Logger ----------

const MAX_MOVES = 2000; // matches the limit in firestore.rules
const MAX_ANSWERS = 100;

class GameLogger {
  constructor() {
    this.sessionId = getSessionId();
    this.group = getGroup();
    this.attemptsPerLevel = {}; // { 1: 3, 2: 1, ... }
    this.current = null;
  }

  // Call when a level starts or restarts after a death.
  startAttempt(level) {
    this.attemptsPerLevel[level] = (this.attemptsPerLevel[level] || 0) + 1;
    this.current = {
      level,
      attemptNumber: this.attemptsPerLevel[level],
      answerChoices: [],
      moves: [],
      startedAt: performance.now(),
    };
  }

  // questionId: your own label, e.g. "L1_q4"; choice: what they picked; correct: true/false
  recordAnswer(questionId, choice, correct) {
    if (!this.current || this.current.answerChoices.length >= MAX_ANSWERS) return;
    this.current.answerChoices.push({
      questionId: String(questionId),
      choice: String(choice),
      correct: Boolean(correct),
    });
  }

  // direction: "up" | "down" | "left" | "right" (or whatever your game uses)
  recordMove(direction) {
    if (!this.current || this.current.moves.length >= MAX_MOVES) return;
    this.current.moves.push(String(direction));
  }

  // result: "win" or "death". deathPosition optional: { x, y } (add z if your maze is 3D)
  async endAttempt(result, deathPosition = null) {
    if (!this.current) {
      console.warn("endAttempt called but no attempt was open");
      return;
    }
    const a = this.current;
    this.current = null;

    const record = {
      sessionId: this.sessionId,
      group: this.group,
      level: a.level,
      attemptNumber: a.attemptNumber,
      result,
      answerChoices: a.answerChoices,
      moves: a.moves,
      moveCount: a.moves.length,
      durationSec: Math.round((performance.now() - a.startedAt) / 1000),
      createdAt: serverTimestamp(),
    };
    if (deathPosition) record.deathPosition = deathPosition;

    const id = makeDocId(this.group, a.level, a.attemptNumber, this.sessionId);
    try {
      await setDoc(doc(db, "attempts", id), record);
    } catch (err) {
      // Never let logging crash the game.
      console.warn("Could not save attempt:", err);
    }
  }
}

export const logger = new GameLogger();

// Also available to regular (non-module) scripts and the browser console.
window.logger = logger;
window.dispatchEvent(new Event("logger-ready"));