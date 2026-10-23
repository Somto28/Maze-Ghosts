// gameLogger.js — Maze Ghosts gameplay logging to Firestore
// No npm or build tool needed: Firebase loads straight from Google's CDN.
//
// Add to your HTML, BEFORE your game scripts:
//   <script type="module" src="gameLogger.js"></script>
//
// Then anywhere in your game code (works in regular <script> files too):
//   logger.startAttempt(1);                       // when a level (re)starts
//   logger.recordAnswer("q4", "B", false);        // when a player answers a question
//   logger.recordMove("up");                      // each move in the gameplay loop
//   logger.endAttempt("death", { x: 4, y: 7 });   // on death
//   logger.endAttempt("win");                     // on level clear

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

// Paste YOUR config from Firebase console → Project settings → General → Your apps.
// These values are safe to ship in front-end code; security rules protect the data.
const firebaseConfig = {
  apiKey: "PASTE_HERE",
  authDomain: "clearpath-3fb96-4t89.firebaseapp.com",
  projectId: "clearpath-3fb96-4t89",
  storageBucket: "PASTE_HERE",
  messagingSenderId: "PASTE_HERE",
  appId: "PASTE_HERE",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Anonymous player ID: random, no names or emails. Persists for the browser tab
// so all levels in one play session share the same ID.
function getSessionId() {
  try {
    let id = sessionStorage.getItem("mg_session");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("mg_session", id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

const MAX_MOVES = 2000; // matches the limit in firestore.rules
const MAX_ANSWERS = 100;

class GameLogger {
  constructor() {
    this.sessionId = getSessionId();
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

  // questionId: your own label, e.g. "q4"; choice: what they picked; correct: true/false
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
    if (!this.current) return;
    const a = this.current;
    this.current = null;

    const record = {
      sessionId: this.sessionId,
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

    try {
      await addDoc(collection(db, "attempts"), record);
    } catch (err) {
      // Never let logging crash the game.
      console.warn("Could not save attempt:", err);
    }
  }
}

export const logger = new GameLogger();

// Make it available to regular (non-module) game scripts as `logger`.
window.logger = logger;
window.dispatchEvent(new Event("logger-ready"));
